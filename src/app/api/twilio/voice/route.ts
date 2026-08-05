// Inbound Twilio voice webhook — powers ★missed-call-to-text
// (MASTER_PLAN.md §4.D). Configure this route as a number's "A call comes
// in" webhook: `${NEXT_PUBLIC_APP_URL}/api/twilio/voice`. Voice itself is
// Phase 4 (MASTER_PLAN.md §4.D "Voice [V2, metered+capped]") — for now every
// call is intentionally never answered live: we tell the caller we'll text
// them, then hang up, and actually send that text before responding (a
// route handler can't do work after it returns).
//
// The DB writes below intentionally mirror
// src/app/api/frontdesk/missed-call/route.ts exactly (contact.source:
// "missed_call", conversation.channel: "sms") rather than introducing a new
// shape — a caller who has already texted the business (src/app/api/twilio/sms,
// contact.source: "sms") is found by phone and reused here too, so a missed
// call and a real SMS thread from the same number never fork into two
// contacts. recordAnalyticsEvent calls use metadata.channel: "missed_call",
// matching that route's convention.

import { NextResponse, type NextRequest } from "next/server"

import { recordAnalyticsEvent } from "@/lib/analytics"
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin"
import { sendSms, validateTwilioSignature } from "@/lib/twilio"
import type { Contact, Conversation } from "@/lib/types"

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

/** `<Say>text</Say><Hangup/>` — the only voice flow this route produces: tell the caller we'll text them, then end the call. Omitting `<Say>` entirely (just `<Hangup/>`) is the silent fallback for anything we can't confidently handle. */
function sayAndHangup(sayText: string | null): NextResponse {
  const inner = sayText ? `<Say>${escapeXml(sayText)}</Say><Hangup/>` : "<Hangup/>"
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  })
}

/** Silent hangup — used for anything we can't confidently handle (bad signature aside, which is a hard 403). Never a 5xx back to Twilio. */
function silentHangup(): NextResponse {
  return sayAndHangup(null)
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
  let params: Record<string, string>
  try {
    params = await readFormParams(request)
  } catch {
    return silentHangup()
  }

  // Signature validation — same posture as src/app/api/twilio/sms: reject
  // 403 on mismatch, skipped only when TWILIO_AUTH_TOKEN isn't set at all.
  if (process.env.TWILIO_AUTH_TOKEN) {
    const signature = request.headers.get("x-twilio-signature")
    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/twilio/voice`
    if (!validateTwilioSignature(webhookUrl, params, signature)) {
      return new NextResponse("Forbidden", { status: 403 })
    }
  }

  const from = params.From?.trim()
  const to = params.To?.trim()

  if (!from || !to || !isSupabaseConfigured()) {
    return silentHangup()
  }

  const admin = createAdminClient()

  try {
    // Map To -> org via org_phone_numbers, same as the SMS route. Unknown
    // number -> silent hangup, never an error.
    const { data: numberRow, error: numberLookupError } = await admin
      .from("org_phone_numbers")
      .select("org_id")
      .eq("phone_number", to)
      .maybeSingle()

    if (numberLookupError) throw new Error(numberLookupError.message)
    if (!numberRow) return silentHangup()

    const orgId = numberRow.org_id

    const [{ data: org }, { data: brain }] = await Promise.all([
      admin.from("orgs").select("id, name").eq("id", orgId).maybeSingle(),
      admin.from("business_brain").select().eq("org_id", orgId).maybeSingle(),
    ])

    const businessName = (brain?.business_name || org?.name) ?? "our team"

    const smsText = `${businessName} here — sorry we missed your call! Text us here what you need and we'll get right back to you.`
    const sayText = `Thanks for calling ${businessName}. Sorry we missed you — we're sending you a text right now so you can tell us what you need.`

    // Do the SMS + persistence work BEFORE responding (a route handler can't
    // do work after returning). A failed text still gets the caller a
    // sensible spoken message; log and continue rather than dropping the
    // call flow.
    try {
      await sendSms(from, to, smsText)
    } catch (sendError) {
      console.error("[twilio/voice] failed to send missed-call text", sendError)
    }

    // Find-or-create contact/conversation exactly like
    // src/app/api/frontdesk/missed-call/route.ts.
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
          source: "missed_call",
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
      const { data: createdConversation, error: conversationInsertError } = await admin
        .from("conversations")
        .insert({ org_id: orgId, contact_id: contact.id, channel: "sms" })
        .select()
        .single()

      if (conversationInsertError || !createdConversation) {
        throw new Error(conversationInsertError?.message ?? "failed to create conversation")
      }
      conversation = createdConversation
    }

    if (isNewContact) {
      try {
        await recordAnalyticsEvent(orgId, {
          kind: "lead_captured",
          contactId: contact.id,
          conversationId: conversation.id,
          metadata: { channel: "missed_call" },
        })
      } catch (analyticsError) {
        console.error("[twilio/voice] failed to record lead_captured event", analyticsError)
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
        console.error("[twilio/voice] failed to record conversation_started event", analyticsError)
      }
    }

    const { data: outboundMessage, error: outboundError } = await admin
      .from("messages")
      .insert({
        org_id: orgId,
        conversation_id: conversation.id,
        direction: "outbound",
        kind: "message",
        body: smsText,
        ai_handled: false,
      })
      .select()
      .single()

    if (outboundError || !outboundMessage) {
      throw new Error(outboundError?.message ?? "failed to record outbound message")
    }

    // A missed call always deserves the owner's attention, even though a
    // templated text already went out — leave the thread unread, matching
    // src/app/api/frontdesk/missed-call/route.ts.
    await admin
      .from("conversations")
      .update({ last_message_at: outboundMessage.created_at, unread: true })
      .eq("id", conversation.id)
      .eq("org_id", orgId)

    return sayAndHangup(sayText)
  } catch (error) {
    console.error("[twilio/voice] failed to handle missed call", error)
    // Still tell the caller something sensible even if persistence failed —
    // the phone call flow shouldn't die over a DB error.
    return sayAndHangup(
      "Sorry we missed your call — please try texting this number and we'll get right back to you."
    )
  }
}
