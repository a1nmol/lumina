// Public, unauthenticated web-chat endpoint for the embeddable widget
// (public/widget.js -> /widget/[org] -> here). MASTER_PLAN.md §4.D "web chat
// widget" / "text channels first".
//
// This route uses the SERVICE-ROLE ADMIN CLIENT (src/lib/supabase/admin.ts)
// for every read/write, not the RLS-scoped server client. That's
// intentional and safe here: the visitor calling this endpoint has no
// Supabase auth session at all (they're an anonymous customer on a
// third-party site), and every RLS policy on contacts/conversations/messages
// is scoped `to authenticated` (supabase/migrations/0003_frontdesk.sql) — an
// anon request would be denied everything. src/lib/frontdesk.ts's own header
// comment anticipates exactly this: "Inbound customer messages arrive via
// channel webhooks... inserted with the service-role admin client, which
// bypasses RLS entirely." This route IS that webhook-equivalent ingestion
// path for the web_chat channel. We compensate for bypassing RLS by
// resolving the org from a validated slug only (never a client-supplied id)
// and never returning anything beyond {reply, ai, escalated} to the caller.

import { NextResponse, type NextRequest } from "next/server"

import { AllowanceDeniedError } from "@/lib/ai/errors"
import { draftCustomerReply } from "@/lib/ai/frontdesk-reply"
import { DEMO_BUSINESS_BRAIN } from "@/lib/demo"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Contact, Conversation, Message } from "@/lib/types"

import { ORG_SLUG_RE, resolveWidgetOrg } from "@/app/widget/resolve-org"

import { checkRateLimit, isValidMessageBody, isValidVisitorId, sweepStaleRateLimitBuckets } from "../_shared"

const DEMO_REPLY_DELAY_MS = 800

interface ChatRequestBody {
  org?: unknown
  visitorId?: unknown
  message?: unknown
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Canned, Business-Brain-grounded reply for demo mode — no live model call. */
function buildDemoReply(message: string): string {
  const lower = message.toLowerCase()
  const brain = DEMO_BUSINESS_BRAIN

  if (/hour|open|close|when/.test(lower)) {
    return `We're open Mon–Thu 7am–6pm, Fri 7am–7pm, Sat 8am–7pm, and Sun 8am–3pm. Anything I can help you order ahead of your visit?`
  }

  if (/cake|birthday/.test(lower)) {
    const cake = brain.services.find((service) => /cake/i.test(service.name))
    return `Yes! Our custom birthday cakes are ${cake?.price ?? "$45"} and need about 48 hours notice — tell me your flavor and the date and I'll get it started.`
  }

  if (/price|cost|how much|menu/.test(lower)) {
    return `A cinnamon roll is $4.50, a sourdough loaf is $8, and a catering tray (a dozen pastries) is $60. Want me to help you place an order?`
  }

  if (/book|order|reserve|catering/.test(lower)) {
    return `I'd love to help set that up — what date works for you, and roughly how many people is it for?`
  }

  return `Thanks for reaching out to ${brain.business_name}! ${brain.description ?? ""} How can I help — hours, an order, or something else?`.trim()
}

export async function POST(request: NextRequest) {
  sweepStaleRateLimitBuckets()

  let body: ChatRequestBody
  try {
    body = (await request.json()) as ChatRequestBody
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
  }

  const orgSlug = body.org
  const visitorId = body.visitorId
  const message = body.message

  if (typeof orgSlug !== "string" || !ORG_SLUG_RE.test(orgSlug)) {
    return NextResponse.json({ error: "Invalid org." }, { status: 400 })
  }
  if (!isValidVisitorId(visitorId)) {
    return NextResponse.json({ error: "Invalid visitor id." }, { status: 400 })
  }
  if (!isValidMessageBody(message)) {
    return NextResponse.json({ error: "Message must be between 1 and 1000 characters." }, { status: 400 })
  }

  const trimmedMessage = message.trim()

  if (!checkRateLimit(`${orgSlug}:${visitorId}`)) {
    return NextResponse.json({ error: "Too many messages. Please slow down." }, { status: 429 })
  }

  const resolved = await resolveWidgetOrg(orgSlug)
  if (!resolved) {
    return NextResponse.json({ error: "This chat isn't available." }, { status: 404 })
  }

  // -------------------------------------------------------------------
  // Demo mode (built-in showcase org, or Supabase not configured) — no
  // persistence, no model call. Small artificial delay so the typing
  // indicator in the widget reads as genuine.
  // -------------------------------------------------------------------
  if (resolved.isDemo) {
    await sleep(DEMO_REPLY_DELAY_MS)
    return NextResponse.json({ reply: buildDemoReply(trimmedMessage), ai: true })
  }

  // -------------------------------------------------------------------
  // Configured mode — real org, real persistence, real model call.
  // -------------------------------------------------------------------
  const admin = createAdminClient()

  try {
    let contact: Contact | null = null
    const { data: existingContact, error: contactLookupError } = await admin
      .from("contacts")
      .select()
      .eq("org_id", resolved.orgId)
      .eq("source", "web_chat")
      .contains("custom", { visitor_id: visitorId })
      .maybeSingle()

    if (contactLookupError) throw new Error(contactLookupError.message)
    contact = existingContact

    if (!contact) {
      const { data: createdContact, error: contactInsertError } = await admin
        .from("contacts")
        .insert({
          org_id: resolved.orgId,
          name: "Web visitor",
          source: "web_chat",
          status: "lead",
          custom: { visitor_id: visitorId },
        })
        .select()
        .single()

      if (contactInsertError || !createdContact) {
        throw new Error(contactInsertError?.message ?? "failed to create contact")
      }
      contact = createdContact
    }

    let conversation: Conversation | null = null
    const { data: existingConversation, error: conversationLookupError } = await admin
      .from("conversations")
      .select()
      .eq("org_id", resolved.orgId)
      .eq("contact_id", contact.id)
      .eq("channel", "web_chat")
      .maybeSingle()

    if (conversationLookupError) throw new Error(conversationLookupError.message)
    conversation = existingConversation

    if (!conversation) {
      const { data: createdConversation, error: conversationInsertError } = await admin
        .from("conversations")
        .insert({ org_id: resolved.orgId, contact_id: contact.id, channel: "web_chat" })
        .select()
        .single()

      if (conversationInsertError || !createdConversation) {
        throw new Error(conversationInsertError?.message ?? "failed to create conversation")
      }
      conversation = createdConversation
    }

    const { data: inboundMessage, error: inboundError } = await admin
      .from("messages")
      .insert({
        org_id: resolved.orgId,
        conversation_id: conversation.id,
        direction: "inbound",
        kind: "message",
        body: trimmedMessage,
        ai_handled: false,
      })
      .select()
      .single()

    if (inboundError || !inboundMessage) {
      throw new Error(inboundError?.message ?? "failed to record inbound message")
    }

    // A fresh inbound message always makes the thread newly unread, until
    // (and unless) the AI auto-answers below.
    await admin
      .from("conversations")
      .update({ last_message_at: inboundMessage.created_at, unread: true })
      .eq("id", conversation.id)
      .eq("org_id", resolved.orgId)

    const { data: history, error: historyError } = await admin
      .from("messages")
      .select()
      .eq("org_id", resolved.orgId)
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true })

    if (historyError) throw new Error(historyError.message)

    // Whatever line the widget shows the customer must also exist in the
    // owner's transcript — an unrecorded promise ("we'll get back to you")
    // is a record-integrity gap. Persisted as ai_handled WITHOUT clearing
    // unread, so the thread still surfaces under "Needs you".
    const escalationOrgId = resolved.orgId
    const escalationConversationId = conversation.id
    async function persistEscalationReply(body: string) {
      await admin
        .from("messages")
        .insert({
          org_id: escalationOrgId,
          conversation_id: escalationConversationId,
          direction: "outbound",
          kind: "message",
          body,
          ai_handled: true,
          metadata: { handoff: true },
        })
      await admin
        .from("conversations")
        .update({ ai_state: "escalated", last_message_at: new Date().toISOString() })
        .eq("id", escalationConversationId)
        .eq("org_id", escalationOrgId)
    }

    let draft: Awaited<ReturnType<typeof draftCustomerReply>> = null
    try {
      draft = await draftCustomerReply({
        orgId: resolved.orgId,
        businessBrain: resolved.brain,
        conversation,
        messages: (history ?? []) as Message[],
        contact,
      })
    } catch (error) {
      if (error instanceof AllowanceDeniedError) {
        // Out of ai_replies quota (spend guard) — fail soft, never expose
        // the quota error to the customer, just hand off to a human.
        const handoff = "Thanks for your message — we'll get back to you shortly!"
        await persistEscalationReply(handoff)
        return NextResponse.json({ reply: handoff, ai: true, escalated: true })
      }
      throw error
    }

    if (!draft) {
      // Not configured (OpenRouter missing) or the model couldn't produce a
      // usable draft after a retry — same soft handoff as a quota denial.
      const handoff = "Thanks for your message — we'll get back to you shortly!"
      await persistEscalationReply(handoff)
      return NextResponse.json({ reply: handoff, ai: true, escalated: true })
    }

    if (draft.needsHuman) {
      // The AI's own handoff line (e.g. "I couldn't answer this — flagging
      // for the team") is what the customer saw, so it's persisted too;
      // unread stays true so the thread surfaces under "Needs you".
      await persistEscalationReply(draft.reply)
      return NextResponse.json({ reply: draft.reply, ai: true, escalated: true })
    }

    const { data: outboundMessage, error: outboundError } = await admin
      .from("messages")
      .insert({
        org_id: resolved.orgId,
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
      .eq("org_id", resolved.orgId)

    return NextResponse.json({ reply: draft.reply, ai: true })
  } catch (error) {
    console.error("[frontdesk/chat] failed to handle message", error)
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 })
  }
}
