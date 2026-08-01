// Inbound Twilio SMS webhook — the ★SMS half of FrontDesk's text channels
// (MASTER_PLAN.md §4.D "text channels first: web chat widget, form, SMS
// two-way..."). Twilio POSTs here (form-encoded) for every inbound message
// to a number configured with this route as its "A message comes in"
// webhook. Configure on the Twilio Console (or via the number-provisioning
// CLI): `${NEXT_PUBLIC_APP_URL}/api/twilio/sms`.
//
// This reuses the SAME find-or-create-contact/conversation + AI-reply
// pipeline as the public web-chat widget (src/app/api/frontdesk/chat/route.ts)
// and the missed-call route (src/app/api/frontdesk/missed-call/route.ts) —
// both already establish the pattern this file follows for a public,
// unauthenticated channel ingestion path: service-role admin client (no
// caller session exists), org resolved from the request itself (there a
// slug, here the Twilio "To" number via org_phone_numbers), and
// src/lib/ai/frontdesk-reply.ts#draftCustomerReply for the actual reply.
// See docs/backend-notes.md "Webhook ingestion — TODO (Phase 2 channel
// connections)" — this route is exactly that TODO for the sms channel.
//
// An inbound SMS the model couldn't turn into a usable draft at all (not
// configured, out of quota, or bad JSON after a retry) does NOT get a
// "we'll get back to you" filler text — sending a vague line over a real
// phone number reads as spam. That case returns empty TwiML and marks the
// conversation `ai_state: "escalated"`.
//
// A model-decided `needsHuman` is different (Commander update, smart
// escalation — src/lib/ai/frontdesk-reply.ts's ESCALATION_GUIDE): the model
// only sets it for a named set of real triggers, and `draft.reply` is
// already a warm, in-voice line deferring that one topic to the owner — so
// it DOES get texted back, same as any other AI reply, alongside flagging
// `ai_state: "escalated"` so the thread still surfaces under the inbox's
// "Needs you" view. Either way the thread was already left `unread: true`
// the moment the inbound message landed, which is the "owner alert" path
// per docs/backend-notes.md's Phase 2 notes (there's no separate
// push-to-owner mechanism yet; the inbox's unread/escalated state IS the
// alert).

import { NextResponse, type NextRequest } from "next/server"

import { parseConversationMemory, shouldUpdateMemory, updateConversationMemory } from "@/lib/ai/conversation-memory"
import { AllowanceDeniedError } from "@/lib/ai/errors"
import { draftCustomerReply } from "@/lib/ai/frontdesk-reply"
import { getIntroToSend } from "@/lib/ai/intro"
import { recordAnalyticsEvent } from "@/lib/analytics"
import { sendVipAlertEmail } from "@/lib/email"
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin"
import { validateTwilioSignature } from "@/lib/twilio"
import type { Contact, Conversation, ConversationAiMode, Message } from "@/lib/types"

import { checkRateLimit, sweepStaleRateLimitBuckets } from "../../frontdesk/_shared"

const MAX_SMS_BODY_LENGTH = 1600 // Twilio's own concatenated-SMS ceiling.

/** Escapes the five XML predefined entities so a model-drafted reply can't break the TwiML document. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function twiml(innerXml: string): NextResponse {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response>${innerXml}</Response>`, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  })
}

/** Empty TwiML — "no reply, but the request was handled" for every soft-fail path (unknown number, rate limit, escalation, error). Never surfaces an HTTP error to Twilio, which would trigger retries/alarms on Twilio's side. */
function emptyTwiml(): NextResponse {
  return twiml("")
}

async function readFormParams(request: NextRequest): Promise<Record<string, string>> {
  const formData = await request.formData()
  const params: Record<string, string> = {}
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") params[key] = value
  }
  return params
}

export async function POST(request: NextRequest) {
  sweepStaleRateLimitBuckets()

  let params: Record<string, string>
  try {
    params = await readFormParams(request)
  } catch {
    return emptyTwiml()
  }

  // -------------------------------------------------------------------
  // 1. Signature validation — reject 403 on mismatch. Skipped ONLY when
  // TWILIO_AUTH_TOKEN isn't set at all, which never happens against a real
  // Twilio number in production (Twilio can't sign without it existing on
  // both sides); this keeps local/demo dev unblocked without a live account.
  // -------------------------------------------------------------------
  if (process.env.TWILIO_AUTH_TOKEN) {
    const signature = request.headers.get("x-twilio-signature")
    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/twilio/sms`
    if (!validateTwilioSignature(webhookUrl, params, signature)) {
      return new NextResponse("Forbidden", { status: 403 })
    }
  }

  const from = params.From?.trim()
  const to = params.To?.trim()
  const rawBody = typeof params.Body === "string" ? params.Body : ""
  const messageSid = params.MessageSid ?? null

  if (!from || !to) {
    // Malformed/unexpected payload — nothing sane to do with it, but never
    // error back to Twilio.
    return emptyTwiml()
  }

  if (!checkRateLimit(`sms:${from}`)) {
    return emptyTwiml()
  }

  if (!isSupabaseConfigured()) {
    // No backend configured at all — there's no org to resolve this number
    // against. Nothing to do but ack Twilio.
    return emptyTwiml()
  }

  const admin = createAdminClient()

  try {
    // -----------------------------------------------------------------
    // 2. Map To -> org via org_phone_numbers. Unknown number -> empty
    // TwiML, never an error (a stray webhook hit / stale number config on
    // Twilio's side shouldn't 500).
    // -----------------------------------------------------------------
    const { data: numberRow, error: numberLookupError } = await admin
      .from("org_phone_numbers")
      .select("org_id")
      .eq("phone_number", to)
      .maybeSingle()

    if (numberLookupError) throw new Error(numberLookupError.message)
    if (!numberRow) return emptyTwiml()

    const orgId = numberRow.org_id

    const { data: brain } = await admin.from("business_brain").select().eq("org_id", orgId).maybeSingle()

    const trimmedBody = rawBody.trim().slice(0, MAX_SMS_BODY_LENGTH)

    // -----------------------------------------------------------------
    // 3. Find-or-create contact (by phone) + conversation (channel "sms")
    // — same shape as src/app/api/frontdesk/missed-call/route.ts, which
    // already establishes the "sms" channel for this phone-number-only
    // identity (so a caller who's missed-call-texted and later sends a real
    // SMS lands in the same thread).
    // -----------------------------------------------------------------
    const { data: existingContact, error: contactLookupError } = await admin
      .from("contacts")
      .select()
      .eq("org_id", orgId)
      .eq("phone", from)
      .maybeSingle()

    if (contactLookupError) throw new Error(contactLookupError.message)

    let contact: Contact | null = existingContact
    const isNewContact = !contact

    if (!contact) {
      const { data: createdContact, error: contactInsertError } = await admin
        .from("contacts")
        .insert({
          org_id: orgId,
          phone: from,
          source: "sms",
          status: "lead",
        })
        .select()
        .single()

      if (contactInsertError || !createdContact) {
        throw new Error(contactInsertError?.message ?? "failed to create contact")
      }
      contact = createdContact
    }

    const { data: existingConversation, error: conversationLookupError } = await admin
      .from("conversations")
      .select()
      .eq("org_id", orgId)
      .eq("contact_id", contact.id)
      .eq("channel", "sms")
      .maybeSingle()

    if (conversationLookupError) throw new Error(conversationLookupError.message)

    let conversation: Conversation | null = existingConversation
    const isNewConversation = !conversation

    if (!conversation) {
      // New conversation's AI autonomy defaults from the org's Business
      // Brain setting (migration 0011 `business_brain.frontdesk_auto_reply`,
      // defaults true) — 'auto' unless the owner has explicitly turned org-
      // wide auto-reply off. See src/app/(app)/settings/frontdesk-auto-reply-card.tsx.
      const initialAiMode: ConversationAiMode = brain?.frontdesk_auto_reply === false ? "off" : "auto"
      const { data: createdConversation, error: conversationInsertError } = await admin
        .from("conversations")
        .insert({ org_id: orgId, contact_id: contact.id, channel: "sms", ai_mode: initialAiMode })
        .select()
        .single()

      if (conversationInsertError || !createdConversation) {
        throw new Error(conversationInsertError?.message ?? "failed to create conversation")
      }
      conversation = createdConversation
    }

    // Best-effort loop-data recording — never fail the reply over an
    // analytics-recording error, matching the chat/missed-call routes.
    if (isNewContact) {
      try {
        await recordAnalyticsEvent(orgId, {
          kind: "lead_captured",
          contactId: contact.id,
          conversationId: conversation.id,
          metadata: { channel: "sms" },
        })
      } catch (analyticsError) {
        console.error("[twilio/sms] failed to record lead_captured event", analyticsError)
      }
    }
    if (isNewConversation) {
      try {
        await recordAnalyticsEvent(orgId, {
          kind: "conversation_started",
          contactId: contact.id,
          conversationId: conversation.id,
          metadata: { channel: "sms" },
        })
      } catch (analyticsError) {
        console.error("[twilio/sms] failed to record conversation_started event", analyticsError)
      }
    }

    const { data: inboundMessage, error: inboundError } = await admin
      .from("messages")
      .insert({
        org_id: orgId,
        conversation_id: conversation.id,
        direction: "inbound",
        kind: "message",
        body: trimmedBody || null,
        ai_handled: false,
        metadata: messageSid ? { twilio_message_sid: messageSid } : {},
      })
      .select()
      .single()

    if (inboundError || !inboundMessage) {
      throw new Error(inboundError?.message ?? "failed to record inbound message")
    }

    // A fresh inbound message always makes the thread newly unread — this is
    // the owner-alert path referenced in the module header, regardless of
    // whether the AI goes on to answer it below.
    await admin
      .from("conversations")
      .update({ last_message_at: inboundMessage.created_at, unread: true })
      .eq("id", conversation.id)
      .eq("org_id", orgId)

    // -----------------------------------------------------------------
    // 4. Draft (or decline to draft) an AI reply, exactly like the widget.
    // -----------------------------------------------------------------
    const { data: history, error: historyError } = await admin
      .from("messages")
      .select()
      .eq("org_id", orgId)
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true })

    if (historyError) throw new Error(historyError.message)

    // -----------------------------------------------------------------
    // Rolling conversation memory (Commander update, migration 0015) —
    // fire-and-forget, BEFORE the ai_mode/needsHuman branches below, so
    // memory keeps updating even on a thread the AI isn't (or can't)
    // currently reply on. Never awaited on the reply path.
    // -----------------------------------------------------------------
    const messagesSoFar = ((history ?? []) as Message[]).filter((message) => message.kind === "message")
    if (shouldUpdateMemory(parseConversationMemory(conversation.ai_memory), messagesSoFar.length)) {
      void updateConversationMemory({ orgId, conversationId: conversation.id }).catch((error) =>
        console.error("[twilio/sms] failed to update conversation memory", error)
      )
    }

    // -----------------------------------------------------------------
    // VIP gate (Commander update wave B1, migration 0016 contacts.is_vip) —
    // sits BEFORE drafting, not just before sending: a VIP contact never
    // gets an AI auto-reply, so there's no point paying for a draft that can
    // never be used. Treated like the ai_mode 'off' branch below (ai_state
    // 'ai_draft', no SMS sent), plus a best-effort owner alert distinct from
    // the new-lead alert above. Memory still updates regardless (see the
    // block above) — VIP only gates sending, never learning.
    // -----------------------------------------------------------------
    if (contact.is_vip) {
      sendVipAlertEmail({
        orgId,
        channel: "sms",
        contactName: contact.name,
        contactPhone: contact.phone,
        contactEmail: contact.email,
        messagePreview: trimmedBody || null,
      }).catch((emailError) => console.error("[twilio/sms] failed to send VIP alert email", emailError))

      await admin
        .from("conversations")
        .update({ ai_state: "ai_draft" })
        .eq("id", conversation.id)
        .eq("org_id", orgId)

      return emptyTwiml()
    }

    let draft: Awaited<ReturnType<typeof draftCustomerReply>> = null
    try {
      draft = await draftCustomerReply({
        orgId,
        businessBrain: brain ?? null,
        conversation,
        messages: (history ?? []) as Message[],
        contact,
      })
    } catch (error) {
      if (!(error instanceof AllowanceDeniedError)) throw error
      // Out of ai_replies quota — same soft handoff as the widget, minus the
      // filler SMS (see module header): mark escalated, send nothing.
      draft = null
    }

    if (!draft) {
      // Not configured, out of quota, or the model couldn't produce a usable
      // draft after a retry — no SMS reply is sent; the thread is already
      // unread, mark it escalated so the owner's inbox names why.
      await admin
        .from("conversations")
        .update({ ai_state: "escalated" })
        .eq("id", conversation.id)
        .eq("org_id", orgId)

      return emptyTwiml()
    }

    if (conversation.ai_mode === "off") {
      // This thread's AI autonomy is off (migration 0011 — the owner's
      // per-conversation override, or the org default it was created with):
      // the AI never sends on its own here. No SMS goes out; the draft is
      // discarded rather than persisted verbatim (no dedicated draft-text
      // column) — the thread surfaces as ai_state 'ai_draft' and the owner
      // regenerates the draft on demand from the Inbox composer's "AI
      // draft" button, exactly like a manually-requested draft on any other
      // thread. unread is already true from the inbound-message update above.
      // Gates the needsHuman deferral below too (review fix): needsHuman
      // now SENDS a real SMS, so 'off' must block it like any auto-reply —
      // needsHuman while off just flags escalated (owner attention).
      await admin
        .from("conversations")
        .update({ ai_state: draft.needsHuman ? "escalated" : "ai_draft" })
        .eq("id", conversation.id)
        .eq("org_id", orgId)

      return emptyTwiml()
    }

    // -----------------------------------------------------------------
    // Honest-AI intro (migration 0013, src/lib/ai/intro.ts) — when gated in,
    // sent as its own leading <Message> verb; Twilio sends each <Message> in
    // a <Response> as a separate outgoing SMS, in order, so this arrives as
    // its own text immediately before the real reply below. If persisting it
    // fails it's dropped from the TwiML too (never send an SMS we can't
    // record) — the real reply is sent either way.
    // -----------------------------------------------------------------
    const priorMessages = (history ?? []).filter((message) => message.id !== inboundMessage.id)
    const introToSend = getIntroToSend({
      aiIntroEnabled: brain?.ai_intro_enabled ?? false,
      aiIntroText: brain?.ai_intro_text,
      priorMessages,
    })

    let introXml = ""
    if (introToSend) {
      const { error: introInsertError } = await admin.from("messages").insert({
        org_id: orgId,
        conversation_id: conversation.id,
        direction: "outbound",
        kind: "message",
        body: introToSend,
        ai_handled: true,
        metadata: { intro: true },
      })
      if (introInsertError) {
        console.error("[twilio/sms] failed to persist honest-AI intro message", introInsertError)
      } else {
        introXml = `<Message>${escapeXml(introToSend)}</Message>`
      }
    }

    if (draft.needsHuman) {
      // Smart escalation (Commander update): `reply` here is a real, warm,
      // in-voice deferral of THIS topic — it's what actually gets texted
      // back, the AI just also flags the thread for the owner. Sits AFTER
      // the ai_mode gate and the intro block (review fix): 'off' blocks it,
      // and a first-contact deferral still leads with the honest-AI intro.
      const { data: outboundMessage, error: outboundError } = await admin
        .from("messages")
        .insert({
          org_id: orgId,
          conversation_id: conversation.id,
          direction: "outbound",
          kind: "message",
          body: draft.reply,
          ai_handled: true,
          model: draft.model,
          cost_usd: draft.costUsd,
          metadata: { handoff: true },
        })
        .select()
        .single()

      if (outboundError || !outboundMessage) {
        throw new Error(outboundError?.message ?? "failed to record outbound message")
      }

      await admin
        .from("conversations")
        .update({ ai_state: "escalated", last_message_at: outboundMessage.created_at })
        .eq("id", conversation.id)
        .eq("org_id", orgId)

      return twiml(`${introXml}<Message>${escapeXml(draft.reply)}</Message>`)
    }

    // -----------------------------------------------------------------
    // 5. AI produced a reply — persist it the same way the widget route
    // does, then answer Twilio with TwiML so it's sent back as a real SMS.
    // -----------------------------------------------------------------
    const { data: outboundMessage, error: outboundError } = await admin
      .from("messages")
      .insert({
        org_id: orgId,
        conversation_id: conversation.id,
        direction: "outbound",
        kind: "message",
        body: draft.reply,
        ai_handled: true,
        model: draft.model,
        cost_usd: draft.costUsd,
      })
      .select()
      .single()

    if (outboundError || !outboundMessage) {
      throw new Error(outboundError?.message ?? "failed to record outbound message")
    }

    await admin
      .from("conversations")
      .update({
        ai_state: "ai_answered",
        status: "open",
        unread: false,
        last_message_at: outboundMessage.created_at,
      })
      .eq("id", conversation.id)
      .eq("org_id", orgId)

    return twiml(`${introXml}<Message>${escapeXml(draft.reply)}</Message>`)
  } catch (error) {
    console.error("[twilio/sms] failed to handle inbound message", error)
    // Never surface a 5xx to Twilio for an internal error — ack with empty
    // TwiML; the failure is logged for us to investigate.
    return emptyTwiml()
  }
}
