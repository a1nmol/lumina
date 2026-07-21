// Missed-call-to-text (MASTER_PLAN.md §4.D ★missed-call-to-text). Currently
// a simulation-ready endpoint: it accepts { org, phone } directly so it can
// be exercised from the app/demo today. When Twilio call-status webhooks are
// wired up in the channel-connection pass, that webhook handler will call
// this same find-or-create + first-text logic after verifying the Twilio
// signature — this route is written so that wiring is a thin addition, not
// a rewrite.
//
// Uses the service-role admin client for the same reason as
// src/app/api/frontdesk/chat/route.ts: no authenticated session exists for
// an inbound telephony event, and every contacts/conversations/messages RLS
// policy is scoped `to authenticated`.

import { NextResponse, type NextRequest } from "next/server"

import { recordAnalyticsEvent } from "@/lib/analytics"
import { createAdminClient } from "@/lib/supabase/admin"
import { DEMO_BUSINESS_BRAIN } from "@/lib/demo"
import { resolveWidgetOrg, ORG_SLUG_RE } from "@/app/widget/resolve-org"
import type { BusinessBrain } from "@/lib/types"

import { isValidPhone } from "../_shared"

interface MissedCallRequestBody {
  org?: unknown
  phone?: unknown
}

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const

/** "how can we help?" first text, personalized from the Business Brain (hours today + top service if available). */
function buildMissedCallText(businessName: string, brain: BusinessBrain | null): string {
  const greeting = `Sorry we missed your call at ${businessName}! How can we help?`

  if (!brain) return greeting

  const today = DAY_NAMES[new Date().getDay()]
  const todayHours = brain.hours?.[today]
  const hoursLine = todayHours
    ? todayHours.closed
      ? "We're closed today,"
      : `We're open today ${todayHours.open}–${todayHours.close},`
    : null

  const topService = brain.services?.[0]?.name

  const parts = [
    greeting,
    hoursLine ? `${hoursLine} reply here and we'll help right away.` : "Reply here and we'll help right away.",
    topService ? `Ask us about ${topService.toLowerCase()} or anything else.` : null,
  ].filter(Boolean)

  return parts.join(" ")
}

export async function POST(request: NextRequest) {
  let body: MissedCallRequestBody
  try {
    body = (await request.json()) as MissedCallRequestBody
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
  }

  const orgSlug = body.org
  const phone = body.phone

  if (typeof orgSlug !== "string" || !ORG_SLUG_RE.test(orgSlug)) {
    return NextResponse.json({ error: "Invalid org." }, { status: 400 })
  }
  if (!isValidPhone(phone)) {
    return NextResponse.json({ error: "Invalid phone number." }, { status: 400 })
  }

  const trimmedPhone = phone.trim()

  const resolved = await resolveWidgetOrg(orgSlug)
  if (!resolved) {
    return NextResponse.json({ error: "This business isn't available." }, { status: 404 })
  }

  const text = buildMissedCallText(resolved.businessName, resolved.brain ?? DEMO_BUSINESS_BRAIN)

  // -------------------------------------------------------------------
  // Demo mode — return the would-be text without persisting anything.
  // -------------------------------------------------------------------
  if (resolved.isDemo) {
    return NextResponse.json({ message: text })
  }

  // -------------------------------------------------------------------
  // Configured mode — find-or-create the contact + sms conversation, send
  // the templated first text as a real outbound message.
  // -------------------------------------------------------------------
  const admin = createAdminClient()

  try {
    const { data: existingContact, error: contactLookupError } = await admin
      .from("contacts")
      .select()
      .eq("org_id", resolved.orgId)
      .eq("phone", trimmedPhone)
      .maybeSingle()

    if (contactLookupError) throw new Error(contactLookupError.message)

    let contact = existingContact
    const isNewContact = !contact
    if (!contact) {
      const { data: createdContact, error: contactInsertError } = await admin
        .from("contacts")
        .insert({
          org_id: resolved.orgId,
          phone: trimmedPhone,
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
      .eq("org_id", resolved.orgId)
      .eq("contact_id", contact.id)
      .eq("channel", "sms")
      .maybeSingle()

    if (conversationLookupError) throw new Error(conversationLookupError.message)

    let conversation = existingConversation
    const isNewConversation = !conversation
    if (!conversation) {
      const { data: createdConversation, error: conversationInsertError } = await admin
        .from("conversations")
        .insert({ org_id: resolved.orgId, contact_id: contact.id, channel: "sms" })
        .select()
        .single()

      if (conversationInsertError || !createdConversation) {
        throw new Error(conversationInsertError?.message ?? "failed to create conversation")
      }
      conversation = createdConversation
    }

    // Best-effort loop-data recording — never fail the missed-call text over
    // an analytics-recording error. Deduped to only fire on first sight of a
    // new contact/conversation.
    if (isNewContact) {
      try {
        await recordAnalyticsEvent(resolved.orgId, {
          kind: "lead_captured",
          contactId: contact.id,
          conversationId: conversation.id,
          metadata: { channel: "missed_call" },
        })
      } catch (analyticsError) {
        console.error("[frontdesk/missed-call] failed to record lead_captured event", analyticsError)
      }
    }
    if (isNewConversation) {
      try {
        await recordAnalyticsEvent(resolved.orgId, {
          kind: "conversation_started",
          contactId: contact.id,
          conversationId: conversation.id,
          metadata: { channel: "sms" },
        })
      } catch (analyticsError) {
        console.error("[frontdesk/missed-call] failed to record conversation_started event", analyticsError)
      }
    }

    const { data: outboundMessage, error: outboundError } = await admin
      .from("messages")
      .insert({
        org_id: resolved.orgId,
        conversation_id: conversation.id,
        direction: "outbound",
        kind: "message",
        body: text,
        ai_handled: false,
      })
      .select()
      .single()

    if (outboundError || !outboundMessage) {
      throw new Error(outboundError?.message ?? "failed to record outbound message")
    }

    // A missed call always deserves the owner's attention, even though a
    // templated text already went out — leave the thread unread.
    await admin
      .from("conversations")
      .update({ last_message_at: outboundMessage.created_at, unread: true })
      .eq("id", conversation.id)
      .eq("org_id", resolved.orgId)

    return NextResponse.json({ message: text, contactId: contact.id, conversationId: conversation.id })
  } catch (error) {
    console.error("[frontdesk/missed-call] failed to handle missed call", error)
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 })
  }
}
