// Inbound Retell AI webhook — the AI Phone Receptionist pilot's event feed
// (MASTER_PLAN.md §4.D "Voice [V2, metered+capped]"). Retell POSTs here for
// every call lifecycle event once this URL is set as an agent's
// `webhook_url` (see src/lib/voice/retell.ts#createOrUpdateAgentForOrg).
//
// Architecture (owner-approved): Retell hosted-agent pilot, NOT the
// custom-LLM WebSocket approach — Retell runs STT/TTS/turn-taking and the
// conversation itself (using the prompt we pushed via retell.ts); this route
// only INGESTS the resulting transcript/metadata into the existing
// conversations/messages model, exactly like the other channel webhooks
// (src/app/api/twilio/sms/route.ts, src/app/api/webhooks/instagram/route.ts)
// — same service-role admin client (no caller session exists for a
// Retell-signed public webhook), same find-or-create-contact/conversation
// shape, same fire-and-forget lead-alert + memory-trigger conventions.
//
// Only `call_ended` and `call_analyzed` do real work; `call_started` (and
// any other/unknown event) is acked with 200 and otherwise ignored — there's
// nothing worth persisting until the call has a transcript.
//
// Idempotency (review-hardened, concurrency-safe): `calls.retell_call_id`
// is the unique key (migration 0020) and the INSERT of that row is itself
// the first-seen gate — a claim arbitrated by the unique index, so two
// concurrent deliveries of the same call (a retry racing the original, or
// call_ended/call_analyzed overlapping) can't both win. The claim winner
// inserts transcript messages and fires lead alerts/analytics; the loser
// proceeds merge-only. Two facts can legitimately arrive on a LATER event
// than the claim winner, so each has its own atomic conditional-update
// claim (`... WHERE <field> IS NULL RETURNING`): voice-minutes usage/cost
// binds to whichever event first writes duration_secs, and the
// "Call summary: ..." thread note to whichever first writes summary.
//
// Every per-event failure is caught and logged, never thrown past the
// handler — this route ALWAYS acks Retell with 200 fast on anything past
// signature verification, matching the instagram webhook's rationale
// (avoid the provider disabling/backing off a flaky-looking subscription).

import { NextResponse, type NextRequest } from "next/server"

import { parseConversationMemory, shouldUpdateMemory, updateConversationMemory } from "@/lib/ai/conversation-memory"
import { recordAnalyticsEvent } from "@/lib/analytics"
import { sendLeadAlertEmail, sendVoiceCapEmail } from "@/lib/email"
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin"
import { getUsageSummary, recordUsage } from "@/lib/usage"
import { disableVoiceAgent } from "@/lib/voice/retell"
import {
  callDurationMinutes,
  estimateCallCostUsd,
  hasVoiceMinutesRemaining,
  mapPlainTranscriptToMessages,
  mapTranscriptToMessages,
  verifyRetellSignature,
  type RawRetellTranscriptUtterance,
} from "@/lib/voice/webhook"
import type { Call, Contact, Conversation, ConversationAiMode, Message } from "@/lib/types"

import { checkRateLimit, sweepStaleRateLimitBuckets } from "../../frontdesk/_shared"

/** Postgres unique-violation (23505) — the idempotency-claim arbiter, same convention as the Instagram webhook's mid dedupe. */
function isUniqueViolation(error: { code?: string } | null | undefined): boolean {
  return error?.code === "23505"
}


/** Cap on the call summary note's stored length — mirrors other channels' body-length caps. */
const MAX_SUMMARY_LENGTH = 1000

type AdminClient = ReturnType<typeof createAdminClient>

// ---------------------------------------------------------------------------
// Payload shapes — implemented defensively (parse-don't-assume), per the
// build spec: Retell's exact field names are TODO-VERIFY against live docs.
// ---------------------------------------------------------------------------

interface RetellCallAnalysis {
  call_summary?: string
  user_sentiment?: string
  call_successful?: boolean
}

interface RetellCallPayload {
  call_id?: string
  agent_id?: string
  from_number?: string
  to_number?: string
  start_timestamp?: number
  end_timestamp?: number
  transcript?: string
  transcript_object?: RawRetellTranscriptUtterance[]
  call_analysis?: RetellCallAnalysis
  recording_url?: string
  disconnection_reason?: string
}

interface RetellWebhookPayload {
  event?: string
  call?: RetellCallPayload
}

// maxDuration ceiling (mirrors src/app/api/webhooks/instagram/route.ts's
// rationale) — transcript ingestion + memory update can stack on one event.
export const maxDuration = 60

export async function POST(request: NextRequest) {
  sweepStaleRateLimitBuckets()

  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return NextResponse.json({ ok: true })
  }

  // Signature validation — skipped ONLY when RETELL_API_KEY isn't set at
  // all, matching every other webhook route's TWILIO_AUTH_TOKEN/
  // INSTAGRAM_APP_SECRET convention (never the case against a real Retell
  // agent in production; keeps local/demo dev unblocked).
  const retellApiKey = process.env.RETELL_API_KEY?.trim()
  if (retellApiKey) {
    const signature = request.headers.get("x-retell-signature")
    if (!verifyRetellSignature(rawBody, signature, retellApiKey)) {
      return new NextResponse("Forbidden", { status: 403 })
    }
  }

  let payload: RetellWebhookPayload
  try {
    payload = JSON.parse(rawBody) as RetellWebhookPayload
  } catch {
    return NextResponse.json({ ok: true })
  }

  if (!isSupabaseConfigured()) {
    // No backend configured — nothing to persist against; ack anyway so
    // Retell doesn't retry against a demo-only deployment.
    return NextResponse.json({ ok: true })
  }

  const admin = createAdminClient()

  // Durable diagnostic receipt — matches src/app/api/webhooks/instagram/route.ts's
  // webhook_receipts convention. Fire-and-forget.
  void admin
    .from("webhook_receipts")
    .insert({ source: "retell", payload: payload as never })
    .then(({ error }) => {
      if (error) console.error("[webhooks/retell] receipt insert failed", error.message)
    })

  const event = payload.event
  const call = payload.call

  if (!call || (event !== "call_ended" && event !== "call_analyzed")) {
    // call_started or an unrecognized event — nothing to persist yet.
    return NextResponse.json({ ok: true })
  }

  try {
    await handleCallEvent(admin, call)
  } catch (error) {
    console.error("[webhooks/retell] failed to handle call event", error)
  }

  return NextResponse.json({ ok: true })
}

async function handleCallEvent(admin: AdminClient, call: RetellCallPayload): Promise<void> {
  const retellCallId = call.call_id?.trim()
  const fromNumber = call.from_number?.trim()
  const toNumber = call.to_number?.trim()
  if (!retellCallId) return // nothing to key idempotency off of — can't safely proceed.

  if (fromNumber && !checkRateLimit(`retell:${fromNumber}`)) return

  // -----------------------------------------------------------------
  // 1. Org resolution — to_number -> org_voice_settings.phone_number first,
  // falling back to a match on call.agent_id -> retell_agent_id (covers a
  // call routed by agent override, e.g. src/lib/voice/retell.ts#createTestCall).
  // -----------------------------------------------------------------
  let orgId: string | null = null

  if (toNumber) {
    const { data, error } = await admin.from("org_voice_settings").select("org_id").eq("phone_number", toNumber).maybeSingle()
    if (error) throw new Error(error.message)
    orgId = data?.org_id ?? null
  }

  if (!orgId && call.agent_id) {
    const { data, error } = await admin.from("org_voice_settings").select("org_id").eq("retell_agent_id", call.agent_id).maybeSingle()
    if (error) throw new Error(error.message)
    orgId = data?.org_id ?? null
  }

  if (!orgId) return // stray/stale webhook — no org owns this number/agent.

  // -----------------------------------------------------------------
  // 2. Idempotency claim (review fix: TOCTOU) — the INSERT itself is the
  // gate, arbitrated by calls.retell_call_id's unique index. Two concurrent
  // deliveries of the same call (a retry racing the original, or
  // call_ended/call_analyzed overlapping) can't both win: the loser gets a
  // 23505, loads the winner's row, and proceeds as a merge-only event —
  // transcript ingestion, lead alerts, and analytics are all gated on
  // winning this claim. (Usage/cost and the summary note get their own
  // atomic conditional-update claims below — they can arrive on a LATER
  // event than the one that won this insert.)
  // -----------------------------------------------------------------
  let existingCall: Call | null = null
  let isFirstSeen = false
  {
    const { data: claimedCall, error: claimError } = await admin
      .from("calls")
      .insert({ org_id: orgId, retell_call_id: retellCallId, from_number: fromNumber ?? null, to_number: toNumber ?? null })
      .select()
      .single()

    if (claimError) {
      if (!isUniqueViolation(claimError)) throw new Error(claimError.message)
      const { data: winnerRow, error: winnerError } = await admin
        .from("calls")
        .select()
        .eq("retell_call_id", retellCallId)
        .maybeSingle()
      if (winnerError) throw new Error(winnerError.message)
      existingCall = (winnerRow as Call | null) ?? null
    } else if (claimedCall) {
      isFirstSeen = true
    }
  }

  // -----------------------------------------------------------------
  // 3. Find-or-create contact (by phone) + conversation (channel "voice") —
  // same shape as src/app/api/twilio/sms/route.ts. Skipped entirely when
  // there's no caller number to identify them by (e.g. a suppressed/
  // unknown caller ID) — the calls row is still recorded, just with no
  // linked conversation.
  // -----------------------------------------------------------------
  let contact: Contact | null = null
  let conversation: Conversation | null = null
  let isNewContact = false
  let isNewConversation = false

  if (fromNumber) {
    const { data: existingContact, error: contactLookupError } = await admin
      .from("contacts")
      .select()
      .eq("org_id", orgId)
      .eq("phone", fromNumber)
      .maybeSingle()

    if (contactLookupError) throw new Error(contactLookupError.message)
    contact = existingContact
    isNewContact = !contact

    if (!contact) {
      const { data: createdContact, error: contactInsertError } = await admin
        .from("contacts")
        .insert({ org_id: orgId, phone: fromNumber, source: "voice", status: "lead" })
        .select()
        .single()

      if (contactInsertError || !createdContact) {
        // Unique-index race (org_id, phone): a concurrent event for the same
        // caller won the insert — adopt their row instead of aborting.
        if (contactInsertError && isUniqueViolation(contactInsertError)) {
          const { data: racedContact, error: refetchError } = await admin
            .from("contacts")
            .select()
            .eq("org_id", orgId)
            .eq("phone", fromNumber)
            .maybeSingle()
          if (refetchError || !racedContact) {
            throw new Error(refetchError?.message ?? "contact race refetch failed")
          }
          contact = racedContact
          isNewContact = false
        } else {
          throw new Error(contactInsertError?.message ?? "failed to create contact")
        }
      } else {
        contact = createdContact
      }
    }

    const { data: existingConversation, error: conversationLookupError } = await admin
      .from("conversations")
      .select()
      .eq("org_id", orgId)
      .eq("contact_id", contact.id)
      .eq("channel", "voice")
      .maybeSingle()

    if (conversationLookupError) throw new Error(conversationLookupError.message)
    conversation = existingConversation
    isNewConversation = !conversation

    if (!conversation) {
      // Voice never auto-sends text — ai_mode is cosmetic here (there's no
      // "reply" to gate), but set 'auto' for consistency with every other
      // channel's default.
      const initialAiMode: ConversationAiMode = "auto"
      const { data: createdConversation, error: conversationInsertError } = await admin
        .from("conversations")
        .insert({ org_id: orgId, contact_id: contact.id, channel: "voice", ai_mode: initialAiMode })
        .select()
        .single()

      if (conversationInsertError || !createdConversation) {
        throw new Error(conversationInsertError?.message ?? "failed to create conversation")
      }
      conversation = createdConversation
    }
  }

  // -----------------------------------------------------------------
  // 4. First-seen work: transcript ingestion, lead alert, analytics,
  // usage/minute-cap. Never repeated on a later event for the same call.
  // -----------------------------------------------------------------
  if (isFirstSeen && conversation) {
    const structuredTranscriptMessages = mapTranscriptToMessages(call.transcript_object)
    const transcriptMessages =
      structuredTranscriptMessages.length > 0 ? structuredTranscriptMessages : mapPlainTranscriptToMessages(call.transcript)

    if (transcriptMessages.length > 0) {
      const { error: insertError } = await admin.from("messages").insert(
        transcriptMessages.map((message) => ({
          org_id: orgId,
          conversation_id: conversation!.id,
          direction: message.direction,
          kind: "message" as const,
          body: message.body,
          ai_handled: message.ai_handled,
          metadata: { retell_call_id: retellCallId },
        }))
      )
      if (insertError) console.error("[webhooks/retell] failed to insert transcript messages", insertError.message)

      // A call's transcript always makes the thread newly unread — the
      // owner-alert path, same as every other channel.
      await admin
        .from("conversations")
        .update({ last_message_at: new Date().toISOString(), unread: true, status: "open" })
        .eq("id", conversation.id)
        .eq("org_id", orgId)
    }

    if (isNewContact) {
      try {
        await recordAnalyticsEvent(orgId, {
          kind: "lead_captured",
          contactId: contact!.id,
          conversationId: conversation.id,
          metadata: { channel: "voice" },
        })
      } catch (analyticsError) {
        console.error("[webhooks/retell] failed to record lead_captured event", analyticsError)
      }

      sendLeadAlertEmail({
        orgId,
        channel: "voice",
        contactName: contact!.name,
        contactPhone: contact!.phone,
        contactEmail: contact!.email,
        messagePreview: transcriptMessages.find((message) => message.direction === "inbound")?.body ?? null,
      }).catch((emailError) => console.error("[webhooks/retell] failed to send lead alert email", emailError))
    }
    if (isNewConversation) {
      try {
        await recordAnalyticsEvent(orgId, {
          kind: "conversation_started",
          contactId: contact!.id,
          conversationId: conversation.id,
          metadata: { channel: "voice" },
        })
      } catch (analyticsError) {
        console.error("[webhooks/retell] failed to record conversation_started event", analyticsError)
      }
    }

    // Fire-and-forget memory trigger, same pattern as every other channel.
    const { data: history, error: historyError } = await admin
      .from("messages")
      .select()
      .eq("org_id", orgId)
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true })

    if (!historyError) {
      const messagesSoFar = ((history ?? []) as Message[]).filter((message) => message.kind === "message")
      if (shouldUpdateMemory(parseConversationMemory(conversation.ai_memory), messagesSoFar.length)) {
        void updateConversationMemory({ orgId, conversationId: conversation.id }).catch((error) =>
          console.error("[webhooks/retell] failed to update conversation memory", error)
        )
      }
    }
  }

  // -----------------------------------------------------------------
  // 5. Duration/cost + minute-cap enforcement — recorded once, the first
  // time a duration becomes available for this call (existingCall had none
  // yet). Guards against double-billing the same call across call_ended ->
  // call_analyzed or a webhook retry.
  // -----------------------------------------------------------------
  const durationSecs =
    typeof call.start_timestamp === "number" && typeof call.end_timestamp === "number" && call.end_timestamp > call.start_timestamp
      ? Math.round((call.end_timestamp - call.start_timestamp) / 1000)
      : null

  // Atomic duration claim (review fix): only the request that transitions
  // duration_secs NULL -> value owns usage/cost recording — concurrency-safe
  // even when two events carrying a duration race each other.
  let shouldRecordUsage = false
  if (durationSecs !== null) {
    const { data: durationClaim, error: durationClaimError } = await admin
      .from("calls")
      .update({ duration_secs: durationSecs, cost_usd: estimateCallCostUsd(durationSecs) })
      .eq("retell_call_id", retellCallId)
      .is("duration_secs", null)
      .select("id")
    if (durationClaimError) {
      console.error("[webhooks/retell] duration claim failed", durationClaimError.message)
    } else {
      shouldRecordUsage = (durationClaim?.length ?? 0) > 0
    }
  }

  if (shouldRecordUsage) {
    const minutes = callDurationMinutes(durationSecs!)
    const costUsd = estimateCallCostUsd(durationSecs!)

    try {
      await recordUsage(orgId, {
        feature: "voice_minutes",
        units: minutes,
        costUsd,
        metadata: { retell_call_id: retellCallId },
      })
    } catch (usageError) {
      console.error("[webhooks/retell] failed to record voice_minutes usage", usageError)
    }

    // Minute-cap enforcement — best-effort, never blocks the rest of this
    // handler. Reads the org's configured cap directly (org_voice_settings,
    // not the plan catalog — see src/lib/usage.ts#getVoiceMinutesUsageFraction's
    // header for why) and this month's usage INCLUDING the call just recorded.
    try {
      const { data: settings } = await admin
        .from("org_voice_settings")
        .select("max_minutes_month, enabled")
        .eq("org_id", orgId)
        .maybeSingle()

      if (settings?.enabled) {
        const summary = await getUsageSummary(orgId)
        const usedMinutes = summary.unitsByFeature.voice_minutes ?? 0

        if (!hasVoiceMinutesRemaining(usedMinutes, settings.max_minutes_month)) {
          await disableVoiceAgent(orgId)
          sendVoiceCapEmail({ orgId, usedMinutes: Math.round(usedMinutes), capMinutes: settings.max_minutes_month }).catch(
            (emailError) => console.error("[webhooks/retell] failed to send voice cap email", emailError)
          )
        }
      }
    } catch (capError) {
      console.error("[webhooks/retell] minute-cap enforcement check failed", capError)
    }
  }

  // -----------------------------------------------------------------
  // 6. Upsert the `calls` row — merges onto any existing row rather than
  // blindly overwriting, so an earlier event's fields (e.g. call_ended's
  // duration) survive a later event that doesn't repeat them.
  // -----------------------------------------------------------------
  const callSummary = call.call_analysis?.call_summary?.trim().slice(0, MAX_SUMMARY_LENGTH) || null
  const outcome =
    typeof call.call_analysis?.call_successful === "boolean"
      ? call.call_analysis.call_successful
        ? "successful"
        : "unsuccessful"
      : (call.disconnection_reason ?? null)

  const callRow = {
    org_id: orgId,
    conversation_id: conversation?.id ?? existingCall?.conversation_id ?? null,
    retell_call_id: retellCallId,
    from_number: fromNumber ?? existingCall?.from_number ?? null,
    to_number: toNumber ?? existingCall?.to_number ?? null,
    started_at:
      typeof call.start_timestamp === "number" ? new Date(call.start_timestamp).toISOString() : (existingCall?.started_at ?? null),
    ended_at: typeof call.end_timestamp === "number" ? new Date(call.end_timestamp).toISOString() : (existingCall?.ended_at ?? null),
    duration_secs: durationSecs ?? existingCall?.duration_secs ?? null,
    outcome: outcome ?? existingCall?.outcome ?? null,
    summary: callSummary ?? existingCall?.summary ?? null,
    cost_usd: durationSecs !== null ? estimateCallCostUsd(durationSecs) : (existingCall?.cost_usd ?? 0),
  }

  const { error: upsertError } = await admin.from("calls").upsert(callRow, { onConflict: "retell_call_id" })
  if (upsertError) console.error("[webhooks/retell] failed to upsert calls row", upsertError.message)

  // A fresh, non-empty summary that wasn't there before gets its own note in
  // the thread — inserted once (guarded by existingCall not already having
  // one), so a retried call_analyzed delivery doesn't duplicate the note.
  // Atomic summary claim (review fix): only the request that transitions
  // summary NULL -> value inserts the thread note — a racing duplicate can't
  // double-post it.
  let ownsSummaryWrite = false
  if (callSummary) {
    const { data: summaryClaim, error: summaryClaimError } = await admin
      .from("calls")
      .update({ summary: callSummary })
      .eq("retell_call_id", retellCallId)
      .is("summary", null)
      .select("id")
    if (summaryClaimError) {
      console.error("[webhooks/retell] summary claim failed", summaryClaimError.message)
    } else {
      ownsSummaryWrite = (summaryClaim?.length ?? 0) > 0
    }
  }

  if (conversation && callSummary && ownsSummaryWrite) {
    const { error: noteError } = await admin.from("messages").insert({
      org_id: orgId,
      conversation_id: conversation.id,
      direction: "outbound",
      kind: "note",
      body: `Call summary: ${callSummary}`,
      ai_handled: true,
      metadata: { call_summary: true, retell_call_id: retellCallId },
    })
    if (noteError) console.error("[webhooks/retell] failed to insert call-summary note", noteError.message)
  }
}
