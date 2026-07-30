// Inbound Instagram DM webhook — the ★Instagram half of the Unified Inbox /
// FrontDesk text channels (MASTER_PLAN.md §4.C "comments+DMs... in one
// thread list" / §4.D "IG/FB Messenger"). Meta POSTs every inbound message
// event here once this URL + the `messages` field are subscribed on the
// connected app's Instagram webhook (see the module footer / the builder
// report for the exact values to paste in the Meta dashboard).
//
// Mirrors src/app/api/twilio/sms/route.ts's shape closely — same
// service-role admin client (no caller session exists for a Meta-signed
// public webhook), same find-or-create-contact/conversation pipeline, same
// src/lib/ai/frontdesk-reply.ts#draftCustomerReply drafting call, same
// best-effort analytics + instant lead-alert email — adapted for:
//   - a GET verification handshake (Meta's subscribe flow) alongside POST,
//   - HMAC request-signature validation instead of Twilio's,
//   - org resolution via `social_connections` (the connected IG account)
//     instead of `org_phone_numbers`,
//   - the ai_mode contract (migration 0011): 'auto' sends for real via the
//     Instagram Graph API; 'off' drafts only and never sends — see the
//     handleMessagingEvent 'off' branch below for exactly how that pending
//     draft is persisted, mirroring how the web-chat route
//     (src/app/api/frontdesk/chat/route.ts) persists its escalation
//     handoff line.
//
// Every per-event failure is caught and logged, never thrown past the
// handler — this route ALWAYS acks Meta with 200 fast, because Meta retries
// (and can eventually disable) a webhook subscription that returns
// non-2xx responses.

import { createHmac, timingSafeEqual } from "node:crypto"

import { NextResponse, type NextRequest } from "next/server"

import { AllowanceDeniedError } from "@/lib/ai/errors"
import { draftCustomerReply } from "@/lib/ai/frontdesk-reply"
import { getIntroToSend } from "@/lib/ai/intro"
import { recordAnalyticsEvent } from "@/lib/analytics"
import { sendLeadAlertEmail } from "@/lib/email"
import { fetchInstagramSenderProfile, sendInstagramMessage } from "@/lib/social/instagram-messaging"
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin"
import type { Contact, Conversation, ConversationAiMode, Message, SocialConnection } from "@/lib/types"

import { checkRateLimit, sweepStaleRateLimitBuckets } from "../../frontdesk/_shared"

/** Mirrors src/app/api/frontdesk/_shared.ts's MAX_MESSAGE_LENGTH for the other public text channels. */
const MAX_MESSAGE_TEXT_LENGTH = 1000
/** Shown in the thread for an inbound message with no text (attachment/sticker/etc.) — recorded so the thread isn't silently missing an event, never sent to the AI. */
const ATTACHMENT_PLACEHOLDER = "[attachment]"

type AdminClient = ReturnType<typeof createAdminClient>

// ---------------------------------------------------------------------------
// Payload shapes (Instagram messaging webhooks) — only the fields this route
// reads; iterated defensively since Meta's payloads are not guaranteed to be
// fully populated on every event.
// ---------------------------------------------------------------------------

interface InstagramAttachment {
  type?: string
}

interface InstagramMessagePayload {
  mid?: string
  text?: string
  is_echo?: boolean
  attachments?: InstagramAttachment[]
}

interface InstagramMessagingEvent {
  sender?: { id?: string }
  recipient?: { id?: string }
  timestamp?: number
  message?: InstagramMessagePayload
}

interface InstagramEntry {
  id?: string
  time?: number
  messaging?: InstagramMessagingEvent[]
  /** v2x Instagram-Login delivery envelope: messages arrive as
   *  changes[{field:"messages", value:<same event shape>}] instead of
   *  messaging[] (discovered live: real DMs used this shape and slipped
   *  through the messaging[]-only loop unparsed). */
  changes?: Array<{ field?: string; value?: InstagramMessagingEvent }>
}

interface InstagramWebhookPayload {
  object?: string
  entry?: InstagramEntry[]
}

// ---------------------------------------------------------------------------
// GET — Meta's webhook verification handshake, run once when the callback
// URL + verify token are saved in the Meta App Dashboard's Instagram
// webhook config.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get("hub.mode")
  const token = searchParams.get("hub.verify_token")
  const challenge = searchParams.get("hub.challenge")

  const expectedToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN
  if (mode === "subscribe" && challenge && expectedToken && token === expectedToken) {
    return new NextResponse(challenge, { status: 200 })
  }

  return new NextResponse("Forbidden", { status: 403 })
}

// ---------------------------------------------------------------------------
// Signature validation
// ---------------------------------------------------------------------------

/** True iff `signatureHeader` ("sha256=<hex>") is the HMAC-SHA256 of the RAW body under INSTAGRAM_APP_SECRET. Timing-safe compare. */
function isValidSignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.INSTAGRAM_APP_SECRET
  if (!appSecret || !signatureHeader) return false

  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex")}`

  const expectedBuffer = Buffer.from(expected)
  const providedBuffer = Buffer.from(signatureHeader)
  // timingSafeEqual throws on length mismatch — check that first, itself a
  // definitive "not equal".
  if (expectedBuffer.length !== providedBuffer.length) return false

  return timingSafeEqual(expectedBuffer, providedBuffer)
}

// ---------------------------------------------------------------------------
// POST — event delivery
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  sweepStaleRateLimitBuckets()

  // Read the raw body ONCE — needed verbatim (not re-serialized JSON) for
  // the HMAC check, then parsed.
  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return NextResponse.json({ ok: true })
  }

  // Skipped ONLY when INSTAGRAM_APP_SECRET isn't set at all, matching
  // src/app/api/twilio/sms/route.ts's TWILIO_AUTH_TOKEN convention — never
  // the case against a real Meta app in production, keeps local/demo dev
  // unblocked.
  if (process.env.INSTAGRAM_APP_SECRET) {
    const signature = request.headers.get("x-hub-signature-256")
    if (!isValidSignature(rawBody, signature)) {
      return new NextResponse("Forbidden", { status: 403 })
    }
  }

  let payload: InstagramWebhookPayload
  try {
    payload = JSON.parse(rawBody) as InstagramWebhookPayload
  } catch {
    return NextResponse.json({ ok: true })
  }

  if (payload.object !== "instagram" || !Array.isArray(payload.entry)) {
    return NextResponse.json({ ok: true })
  }

  if (!isSupabaseConfigured()) {
    // No backend configured — nothing to persist against; ack anyway so
    // Meta doesn't retry/rebill against a demo-only deployment.
    return NextResponse.json({ ok: true })
  }

  const admin = createAdminClient()

  // Durable diagnostic receipt — see migration 0012. Fire-and-forget.
  void admin
    .from("webhook_receipts")
    .insert({ source: "instagram", payload: payload as never })
    .then(({ error }) => {
      if (error) console.error("[webhooks/instagram] receipt insert failed", error.message)
    })

  for (const entry of payload.entry) {
    // Normalize both delivery envelopes into one event list: classic
    // Messenger-style entry.messaging[] AND the newer entry.changes[]
    // (field "messages") that Instagram-Login apps receive on current
    // webhook versions. Real DMs arrive via changes[]; synthetic/legacy
    // payloads via messaging[].
    const messagingEvents: InstagramMessagingEvent[] = Array.isArray(entry.messaging) ? [...entry.messaging] : []
    if (Array.isArray(entry.changes)) {
      for (const change of entry.changes) {
        if (change?.field === "messages" && change.value && typeof change.value === "object") {
          messagingEvents.push(change.value)
        }
      }
    }
    if (messagingEvents.length === 0) {
      console.warn("[webhooks/instagram] entry with no parseable events — keys:", Object.keys(entry as object).join(","))
    }
    for (const event of messagingEvents) {
      try {
        await handleMessagingEvent(admin, entry, event)
      } catch (error) {
        // Never let one bad event fail the whole delivery / surface a 5xx to
        // Meta — log and keep going.
        console.error("[webhooks/instagram] failed to handle messaging event", error)
      }
    }
  }

  return NextResponse.json({ ok: true })
}

// ---------------------------------------------------------------------------
// Per-event handling
// ---------------------------------------------------------------------------

async function handleMessagingEvent(
  admin: AdminClient,
  entry: InstagramEntry,
  event: InstagramMessagingEvent
): Promise<void> {
  const senderId = event.sender?.id?.trim()
  const message = event.message
  if (!senderId || !message) return

  // Our own sends, echoed back by Meta — never re-ingest or reply to these.
  if (message.is_echo) return

  if (!checkRateLimit(`instagram:${senderId}`)) return

  const hasText = typeof message.text === "string" && message.text.trim().length > 0
  const hasAttachments = Array.isArray(message.attachments) && message.attachments.length > 0
  if (!hasText && !hasAttachments) return // nothing worth recording at all

  const text = hasText ? (message.text as string).trim().slice(0, MAX_MESSAGE_TEXT_LENGTH) : null
  const storedBody = text ?? ATTACHMENT_PLACEHOLDER

  // -----------------------------------------------------------------
  // 4. Org mapping — recipient.id (the specific account this event was
  // addressed to) first, then entry.id (the batch-level account) as a
  // fallback; both social_connections.ig_user_id (either provider — direct
  // Instagram Business Login or a linked Facebook Page, see
  // supabase/migrations/0010_social_connections_instagram.sql) and
  // .page_id (the Instagram-Business-Login flow reuses this column for the
  // IG user id — see src/lib/social/instagram.ts's upsert) are checked.
  // -----------------------------------------------------------------
  const candidateAccountIds = Array.from(
    new Set([event.recipient?.id?.trim(), entry.id?.trim()].filter((id): id is string => Boolean(id)))
  )
  if (candidateAccountIds.length === 0) return

  let connection: SocialConnection | null = null
  for (const accountId of candidateAccountIds) {
    const { data, error } = await admin
      .from("social_connections")
      .select()
      .or(`ig_user_id.eq.${accountId},page_id.eq.${accountId}`)
      .limit(1)

    if (error) throw new Error(error.message)
    if (data && data.length > 0) {
      connection = data[0] as SocialConnection
      break
    }
  }
  if (!connection) return // no org has this IG account connected — stray/stale webhook, nothing to do.

  const orgId = connection.org_id
  const accessToken = connection.access_token

  const { data: brain } = await admin.from("business_brain").select().eq("org_id", orgId).maybeSingle()

  // -----------------------------------------------------------------
  // 5. Contact — find-or-create by the sender's IGSID. contacts
  // (supabase/migrations/0003_frontdesk.sql) has no dedicated
  // instagram-id column, so the IGSID is stored in the extensible `custom`
  // jsonb field and matched with `.contains`, the exact pattern
  // src/app/api/frontdesk/chat/route.ts already uses for the web-chat
  // widget's anonymous visitor id.
  // -----------------------------------------------------------------
  const { data: existingContact, error: contactLookupError } = await admin
    .from("contacts")
    .select()
    .eq("org_id", orgId)
    .eq("source", "instagram")
    .contains("custom", { instagram_igsid: senderId })
    .maybeSingle()

  if (contactLookupError) throw new Error(contactLookupError.message)

  let contact: Contact | null = existingContact
  const isNewContact = !contact

  if (!contact) {
    const profile = await fetchInstagramSenderProfile(accessToken, senderId)
    const displayName = profile?.name?.trim() || profile?.username?.trim() || "Instagram customer"

    const { data: createdContact, error: contactInsertError } = await admin
      .from("contacts")
      .insert({
        org_id: orgId,
        name: displayName,
        source: "instagram",
        status: "lead",
        custom: { instagram_igsid: senderId, instagram_username: profile?.username ?? null },
      })
      .select()
      .single()

    if (contactInsertError || !createdContact) {
      throw new Error(contactInsertError?.message ?? "failed to create contact")
    }
    contact = createdContact
  }

  // -----------------------------------------------------------------
  // 6. Conversation — find-or-create (org, contact, channel 'instagram').
  // A NEW conversation's ai_mode is set from the org's
  // business_brain.frontdesk_auto_reply (migration 0011's contract):
  // true -> 'auto', false -> 'off', missing Brain -> 'auto'.
  // -----------------------------------------------------------------
  const { data: existingConversation, error: conversationLookupError } = await admin
    .from("conversations")
    .select()
    .eq("org_id", orgId)
    .eq("contact_id", contact.id)
    .eq("channel", "instagram")
    .maybeSingle()

  if (conversationLookupError) throw new Error(conversationLookupError.message)

  let conversation: Conversation | null = existingConversation
  const isNewConversation = !conversation

  if (!conversation) {
    const initialAiMode: ConversationAiMode = brain?.frontdesk_auto_reply === false ? "off" : "auto"

    const { data: createdConversation, error: conversationInsertError } = await admin
      .from("conversations")
      .insert({ org_id: orgId, contact_id: contact.id, channel: "instagram", ai_mode: initialAiMode })
      .select()
      .single()

    if (conversationInsertError || !createdConversation) {
      throw new Error(conversationInsertError?.message ?? "failed to create conversation")
    }
    conversation = createdConversation
  }

  // Best-effort loop-data recording — never fail the webhook over an
  // analytics-recording error, matching the sms/chat routes.
  if (isNewContact) {
    try {
      await recordAnalyticsEvent(orgId, {
        kind: "lead_captured",
        contactId: contact.id,
        conversationId: conversation.id,
        metadata: { channel: "instagram" },
      })
    } catch (analyticsError) {
      console.error("[webhooks/instagram] failed to record lead_captured event", analyticsError)
    }

    // Instant lead alert — fire-and-forget by design (see
    // src/lib/email.ts#sendLeadAlertEmail's own header), matching every
    // other FrontDesk ingestion route.
    sendLeadAlertEmail({
      orgId,
      channel: "instagram",
      contactName: contact.name,
      contactPhone: contact.phone,
      contactEmail: contact.email,
      messagePreview: text,
    }).catch((emailError) => console.error("[webhooks/instagram] failed to send lead alert email", emailError))
  }
  if (isNewConversation) {
    try {
      await recordAnalyticsEvent(orgId, {
        kind: "conversation_started",
        contactId: contact.id,
        conversationId: conversation.id,
        metadata: { channel: "instagram" },
      })
    } catch (analyticsError) {
      console.error("[webhooks/instagram] failed to record conversation_started event", analyticsError)
    }
  }

  // -----------------------------------------------------------------
  // Dedupe on message.mid, stored in messages.metadata — no dedicated
  // external-id column on `messages` either, so this reuses the same
  // jsonb-metadata convention src/app/api/twilio/sms/route.ts uses for
  // `twilio_message_sid`. Best-effort: if Meta ever omits `mid` we fall
  // through and record the message rather than drop it.
  // -----------------------------------------------------------------
  const mid = message.mid?.trim() || null
  if (mid) {
    const { data: existingMessage, error: dedupeError } = await admin
      .from("messages")
      .select("id")
      .eq("org_id", orgId)
      .eq("conversation_id", conversation.id)
      .contains("metadata", { instagram_mid: mid })
      .maybeSingle()

    if (dedupeError) throw new Error(dedupeError.message)
    if (existingMessage) return // already recorded (Meta redelivery) — skip everything below.
  }

  const { data: inboundMessage, error: inboundError } = await admin
    .from("messages")
    .insert({
      org_id: orgId,
      conversation_id: conversation.id,
      direction: "inbound",
      kind: "message",
      body: storedBody,
      ai_handled: false,
      metadata: mid ? { instagram_mid: mid } : {},
    })
    .select()
    .single()

  if (inboundError || !inboundMessage) {
    throw new Error(inboundError?.message ?? "failed to record inbound message")
  }

  // A fresh inbound message always makes the thread newly unread — the
  // owner-alert path, same as every other channel.
  await admin
    .from("conversations")
    .update({ last_message_at: inboundMessage.created_at, unread: true })
    .eq("id", conversation.id)
    .eq("org_id", orgId)

  // Attachment-only messages are recorded above (so the thread shows
  // something) but never handed to the AI — there's no text to draft a
  // reply from.
  if (!hasText) return

  // -----------------------------------------------------------------
  // 7. AI reply.
  // -----------------------------------------------------------------
  const { data: history, error: historyError } = await admin
    .from("messages")
    .select()
    .eq("org_id", orgId)
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: true })

  if (historyError) throw new Error(historyError.message)

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
    // Out of ai_replies quota — same soft handoff as sms/chat: escalate, no send.
    draft = null
  }

  if (!draft || draft.needsHuman) {
    await admin
      .from("conversations")
      .update({ ai_state: "escalated" })
      .eq("id", conversation.id)
      .eq("org_id", orgId)
    return
  }

  // -----------------------------------------------------------------
  // ai_mode contract (migration 0011) — re-read the conversation's current
  // ai_mode right before deciding whether to auto-send, in case the owner
  // flipped it (from the inbox) between this event's insert above and now.
  // -----------------------------------------------------------------
  const { data: freshConversation, error: freshConversationError } = await admin
    .from("conversations")
    .select("ai_mode")
    .eq("id", conversation.id)
    .eq("org_id", orgId)
    .single()

  if (freshConversationError) throw new Error(freshConversationError.message)
  const aiMode: ConversationAiMode = freshConversation?.ai_mode ?? conversation.ai_mode

  if (aiMode === "off") {
    // The AI may not send on its own for this thread. Convention (unified
    // with the chat/sms routes' ai_mode enforcement): no message row is
    // stored — the conversation flips to ai_state 'ai_draft' and stays
    // unread, and the inbox's existing "AI draft" composer button
    // regenerates the reply on demand when the owner opens the thread.
    // Storing the unsent draft as an outbound `messages` row was rejected:
    // the thread UI renders outbound rows as sent, which would lie.
    await admin
      .from("conversations")
      .update({ ai_state: "ai_draft" })
      .eq("id", conversation.id)
      .eq("org_id", orgId)

    return
  }

  // -----------------------------------------------------------------
  // Honest-AI intro (migration 0013, src/lib/ai/intro.ts) — when gated in,
  // sent as its own separate DM immediately BEFORE the real reply. Computed
  // from the server-side message history fetched above (everything except
  // the inbound message that just triggered this reply). A send failure here
  // is logged and swallowed — it must never block the real reply below.
  // -----------------------------------------------------------------
  const priorMessages = (history ?? []).filter((message) => message.id !== inboundMessage.id)
  const introToSend = getIntroToSend({
    aiIntroEnabled: brain?.ai_intro_enabled ?? false,
    aiIntroText: brain?.ai_intro_text,
    priorMessages,
  })

  if (introToSend) {
    try {
      await sendInstagramMessage(accessToken, senderId, introToSend)
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
        // The DM was already sent — the transcript is now missing a message
        // the customer really received, so this must be loud, not silent.
        console.error("[webhooks/instagram] intro DM sent but failed to persist", introInsertError)
      }
    } catch (introError) {
      console.error("[webhooks/instagram] failed to send honest-AI intro", introError)
    }
  }

  // -----------------------------------------------------------------
  // 'auto' — actually send the DM via the Instagram Graph API, then
  // persist exactly as src/app/api/twilio/sms/route.ts's ai_answered path
  // does.
  // -----------------------------------------------------------------
  try {
    await sendInstagramMessage(accessToken, senderId, draft.reply)
  } catch (sendError) {
    console.error("[webhooks/instagram] failed to send DM reply", sendError)
    await admin
      .from("conversations")
      .update({ ai_state: "escalated" })
      .eq("id", conversation.id)
      .eq("org_id", orgId)
    return
  }

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
}
