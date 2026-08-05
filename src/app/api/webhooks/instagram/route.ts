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
// Smart escalation (Commander update, migration 0015): a model-decided
// `draft.needsHuman` DOES send — `draft.reply` is already a warm, in-voice
// line deferring that one topic to the owner (see
// src/lib/ai/frontdesk-reply.ts's ESCALATION_GUIDE) — while also flagging
// `ai_state: "escalated"`. Only a genuine `!draft` (not configured, out of
// quota, or unparseable after a retry) escalates with no DM sent.
//
// Every per-event failure is caught and logged, never thrown past the
// handler — this route ALWAYS acks Meta with 200 fast, because Meta retries
// (and can eventually disable) a webhook subscription that returns
// non-2xx responses.
//
// Echo events (bug fix, 2026-08-01): `message.is_echo` is Meta's copy-back of
// an OUTBOUND message the CONNECTED ACCOUNT itself sent — either (a) our own
// Graph API send (already persisted at send time; see the mid capture at
// every sendInstagramMessage call site below and in
// src/app/(app)/inbox/actions.ts#deliverAndPersistReply — never
// double-insert) or (b) the owner replying directly from the Instagram app,
// which Lumina has otherwise never seen and previously silently dropped.
// Routed to handleEchoMessagingEvent below (skips rate limiting — echoes
// aren't customer traffic — and NEVER drafts/sends an AI reply), which flips
// the usual sender/recipient id roles: for an echo, sender.id is OUR account
// and recipient.id is the customer's IGSID.
//
// VIP gate (Commander update wave B1, migration 0016 contacts.is_vip): a VIP
// contact never gets an AI auto-reply, checked BEFORE drafting even starts
// (unlike the ai_mode 'off' branch below, which drafts first and discards) —
// see the VIP block right before the draftCustomerReply call.

import { createHmac, timingSafeEqual } from "node:crypto"

import { NextResponse, type NextRequest } from "next/server"

import { parseConversationMemory, shouldUpdateMemory, updateConversationMemory } from "@/lib/ai/conversation-memory"
import { AllowanceDeniedError } from "@/lib/ai/errors"
import { describeImageAttachment } from "@/lib/ai/describe-image"
import { draftCustomerReply } from "@/lib/ai/frontdesk-reply"
import { appendLuminaSignature, getIntroToSend } from "@/lib/ai/intro"
import { isDeepgramConfigured, transcribeVoiceNote } from "@/lib/ai/transcribe-audio"
import { recordAnalyticsEvent } from "@/lib/analytics"
import { sendLeadAlertEmail, sendVipAlertEmail } from "@/lib/email"
import { getEntitlements } from "@/lib/entitlements"
import {
  attachmentPlaceholderBody,
  classifyInstagramAttachmentType,
  normalizeInstagramAttachments,
  parseInstagramReplyToStory,
  STORY_REPLY_PLACEHOLDER_BODY,
  type NormalizedInstagramAttachment,
  type NormalizedInstagramStoryReply,
  type RawInstagramAttachment,
  type RawInstagramReplyTo,
} from "@/lib/social/instagram-attachments"
import { isDuplicateOfRecentSend, RECENT_SEND_DEDUPE_WINDOW_MS, type DedupeCandidateMessage } from "@/lib/social/instagram-echo"
import { sniffStoryMediaKind } from "@/lib/social/instagram-story-media"
import {
  fetchInstagramSenderProfile,
  sendInstagramMessage,
  sendInstagramTypingIndicator,
} from "@/lib/social/instagram-messaging"
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin"
import type { Contact, Conversation, ConversationAiMode, Message, SocialConnection } from "@/lib/types"

import { checkRateLimit, sweepStaleRateLimitBuckets } from "../../frontdesk/_shared"

/** Mirrors src/app/api/frontdesk/_shared.ts's MAX_MESSAGE_LENGTH for the other public text channels. */
const MAX_MESSAGE_TEXT_LENGTH = 1000

/** Cap on a reel/shared-post caption (payload.title) persisted into metadata.attachment.caption — sender-supplied text, never trusted beyond this length. */
const MAX_ATTACHMENT_CAPTION_LENGTH = 300

type AdminClient = ReturnType<typeof createAdminClient>

// ---------------------------------------------------------------------------
// Payload shapes (Instagram messaging webhooks) — only the fields this route
// reads; iterated defensively since Meta's payloads are not guaranteed to be
// fully populated on every event.
// ---------------------------------------------------------------------------

interface InstagramMessagePayload {
  mid?: string
  text?: string
  is_echo?: boolean
  attachments?: RawInstagramAttachment[]
  /** Present when this message is a reply to one of the business's own Stories — see src/lib/social/instagram-attachments.ts#parseInstagramReplyToStory. */
  reply_to?: RawInstagramReplyTo
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

// Explicit ceiling (review fix): the enrichment chain (story sniff 8s +
// voice transcription 15s + vision + reply drafting) can stack on one
// pathological event; degrade to "finishes late" instead of a platform kill
// that would strand the thread with no reply and no escalation.
export const maxDuration = 60

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
        } else if (change?.field) {
          // Diagnostics (Senses Wave — voice-note live-verification): community
          // reports say some event types (voice notes among them) may arrive
          // under an UNSUPPORTED or otherwise unhandled `field` instead of
          // "messages" — this breadcrumb is what makes that confirmable from
          // logs/webhook_receipts rather than silently dropped.
          console.warn(`[webhooks/instagram] entry.changes[] field not handled: "${change.field}"`)
        }
      }
    }
    if (messagingEvents.length === 0) {
      console.warn("[webhooks/instagram] entry with no parseable events — keys:", Object.keys(entry as object).join(","))
    }
    for (const event of messagingEvents) {
      try {
        if (event.message?.is_echo) {
          await handleEchoMessagingEvent(admin, entry, event)
        } else {
          await handleMessagingEvent(admin, entry, event)
        }
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

/**
 * Turns one normalized attachment into the `metadata.attachment`/
 * `metadata.attachments[]` entry to persist on insert — shared by
 * handleMessagingEvent and handleEchoMessagingEvent. Story media policy
 * (Meta rule, Senses Wave): a "story_mention" attachment's `url` is NEVER
 * persisted, even on this first insert — only `type`/`title`. Every other
 * kind keeps the existing url/title shape.
 */
function attachmentEntryFor(attachment: NormalizedInstagramAttachment): Record<string, unknown> {
  if (attachment.kind === "story_mention") {
    return { type: attachment.kind, title: attachment.title }
  }
  return { type: attachment.kind, url: attachment.url, title: attachment.title }
}

async function handleMessagingEvent(
  admin: AdminClient,
  entry: InstagramEntry,
  event: InstagramMessagingEvent
): Promise<void> {
  const senderId = event.sender?.id?.trim()
  const message = event.message
  if (!senderId || !message) return

  // Echo events (message.is_echo) are routed to handleEchoMessagingEvent by
  // the caller and never reach here — this is a genuine inbound customer
  // message from this point on.

  if (!checkRateLimit(`instagram:${senderId}`)) return

  // Diagnostics (Senses Wave) — an attachment type Meta sends that this app
  // doesn't recognize falls back to the generic "file" bucket silently by
  // design (see instagram-attachments.ts's header), but that silence makes a
  // genuinely new/unexpected type (e.g. how a voice note that DOESN'T arrive
  // as "audio" would look) invisible in logs. Logged here, not inside the
  // pure classifier, to keep that module I/O-free.
  if (Array.isArray(message.attachments)) {
    for (const raw of message.attachments) {
      if (raw?.type && classifyInstagramAttachmentType(raw.type) === "file") {
        console.warn(`[webhooks/instagram] unrecognized attachment type "${raw.type}" — falling back to 'file' bucket`)
      }
    }
  }

  const hasText = typeof message.text === "string" && message.text.trim().length > 0
  const attachments: NormalizedInstagramAttachment[] = normalizeInstagramAttachments(message.attachments)
  const hasAttachments = attachments.length > 0
  const replyToStory: NormalizedInstagramStoryReply | null = parseInstagramReplyToStory(message.reply_to)
  const hasStoryReply = replyToStory !== null

  // Diagnostics breadcrumb (Senses Wave, owner directive) — makes a live
  // voice-note test verifiable from logs even before/regardless of whether
  // DEEPGRAM_API_KEY is set, since community reports say voice notes may not
  // even arrive as a normal "audio" attachments[] entry (see the
  // entry.changes[] field breadcrumb above too).
  if (attachments.some((attachment) => attachment.kind === "audio")) {
    console.warn(`[webhooks/instagram] audio attachment observed (deepgram configured: ${isDeepgramConfigured()})`)
  }

  if (!hasText && !hasAttachments && !hasStoryReply) return // nothing worth recording at all

  const text = hasText ? (message.text as string).trim().slice(0, MAX_MESSAGE_TEXT_LENGTH) : null
  // A typed placeholder ("[photo]", "[reel]", ...) per src/lib/social/instagram-attachments.ts
  // instead of a generic "[attachment]" — reads better in the Inbox thread
  // list with zero UI changes. When the customer also sent real text
  // alongside the attachment (a caption), that text is the stored body, same
  // as any other message. A story reply with no typed text (rare) falls back
  // to STORY_REPLY_PLACEHOLDER_BODY the same way.
  const storedBody = text ?? (hasAttachments ? attachmentPlaceholderBody(attachments[0].kind) : STORY_REPLY_PLACEHOLDER_BODY)

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
      // storedBody, not `text` — an attachment-only first message still gives
      // the owner's alert a preview ("[photo]") instead of a blank line.
      messagePreview: storedBody,
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

  // Attachment metadata (migration 0012's jsonb `metadata` column, same
  // convention as `instagram_mid` above): `attachment` is always the primary
  // (first) attachment (or, when there's no attachments[] entry at all, the
  // reply_to.story envelope, normalized to the "story_reply" pseudo-type);
  // `attachments` is added too when there's more than one, so nothing is
  // lost for the rare multi-attachment event. `description`/`caption`/
  // `transcript`/`media_kind` are filled in below, after the insert, once
  // the relevant best-effort enrichment (vision/caption/sniff/transcribe)
  // has had a chance to run — kept off this first insert so a slow/failed
  // enrichment call never delays recording the inbound message itself.
  const attachmentMetadata: Record<string, unknown> = hasAttachments
    ? {
        attachment: attachmentEntryFor(attachments[0]),
        ...(attachments.length > 1 ? { attachments: attachments.map(attachmentEntryFor) } : {}),
      }
    : hasStoryReply
      ? { attachment: { type: "story_reply" } } // url intentionally omitted — story media policy, see attachmentEntryFor's doc comment.
      : {}

  const { data: inboundMessage, error: inboundError } = await admin
    .from("messages")
    .insert({
      org_id: orgId,
      conversation_id: conversation.id,
      direction: "inbound",
      kind: "message",
      body: storedBody,
      ai_handled: false,
      metadata: { ...(mid ? { instagram_mid: mid } : {}), ...attachmentMetadata },
    })
    .select()
    .single()

  if (inboundError || !inboundMessage) {
    throw new Error(inboundError?.message ?? "failed to record inbound message")
  }
  // A separately-named, definitely-non-null alias for the row above — TS
  // narrowing from the guard doesn't carry into the nested function
  // declarations below (patchAttachmentMetadata/enrichStoryMedia), which
  // close over this binding.
  const persistedInboundMessage: Message = inboundMessage

  // A fresh inbound message always makes the thread newly unread — the
  // owner-alert path, same as every other channel.
  await admin
    .from("conversations")
    .update({ last_message_at: persistedInboundMessage.created_at, unread: true })
    .eq("id", conversation.id)
    .eq("org_id", orgId)

  // -----------------------------------------------------------------
  // Attachment enrichment (Senses Wave) — best-effort per kind, mirroring
  // this block's original image-only shape: any failure just means the AI
  // answers honestly that it can't see/hear it, per the attachment
  // STYLE_GUIDE line in src/lib/ai/frontdesk-reply.ts — it must never block
  // the reply below. Every successful enrichment is patched onto THIS SAME
  // message row so later replies in this thread reuse it instead of redoing
  // the work. Kind coverage this wave (owner-approved ranking — plain video
  // is deliberately skipped):
  //   image         -> vision (unchanged from before this wave)
  //   reel          -> caption from payload.title only (url is the VIDEO
  //                    FILE, never fetched/vision'd)
  //   share/post    -> vision on the post's cover IMAGE (payload.url) +
  //                    title-as-caption
  //   story_mention -> content-sniff payload.url; vision only if it sniffs
  //                    as an image
  //   story_reply   -> same content-sniff, from message.reply_to.story
  //                    (not part of attachments[] at all)
  //   audio         -> Deepgram transcription, only when DEEPGRAM_API_KEY
  //                    is set; otherwise stays honest-blind
  //
  // Story-media policy (Meta rule): the CDN url is NEVER persisted for
  // story_mention/story_reply — only the resulting description/media_kind
  // flag — and the sniff/vision call happens synchronously here since the
  // CDN url is short-lived, matching this whole block's existing
  // synchronous-before-drafting shape.
  // -----------------------------------------------------------------

  async function patchAttachmentMetadata(patch: Record<string, unknown>): Promise<void> {
    const currentMetadata = (persistedInboundMessage.metadata ?? {}) as Record<string, unknown>
    const currentAttachment = (currentMetadata.attachment ?? {}) as Record<string, unknown>
    const updatedMetadata = { ...currentMetadata, attachment: { ...currentAttachment, ...patch } }

    const { error: metadataUpdateError } = await admin
      .from("messages")
      .update({ metadata: updatedMetadata })
      .eq("id", persistedInboundMessage.id)
      .eq("org_id", orgId)

    if (metadataUpdateError) {
      console.error("[webhooks/instagram] failed to persist attachment metadata", metadataUpdateError.message)
    } else {
      persistedInboundMessage.metadata = updatedMetadata
    }
  }

  /** Shared by the story_mention attachment branch and the reply_to.story branch below — both need the exact same sniff-then-maybe-vision treatment, just from different sources (an attachments[] entry vs. reply_to.story). */
  async function enrichStoryMedia(url: string | null, caption: string | null, hasLinkSticker: boolean): Promise<void> {
    const patch: Record<string, unknown> = {}
    if (caption) patch.caption = caption.slice(0, MAX_ATTACHMENT_CAPTION_LENGTH)
    if (hasLinkSticker) patch.has_link_sticker = true

    if (url) {
      try {
        const mediaKind = await sniffStoryMediaKind(url)
        patch.media_kind = mediaKind
        if (mediaKind === "image") {
          const described = await describeImageAttachment({ orgId, imageUrl: url, title: caption })
          if (described?.description) patch.description = described.description
        }
      } catch (sniffError) {
        console.error("[webhooks/instagram] story-media sniff/describe failed — falling back to type-only", sniffError)
      }
    }

    if (Object.keys(patch).length > 0) await patchAttachmentMetadata(patch)
  }

  const primaryAttachment = attachments[0]

  if (primaryAttachment?.kind === "image" && primaryAttachment.url) {
    try {
      const described = await describeImageAttachment({
        orgId,
        imageUrl: primaryAttachment.url,
        title: primaryAttachment.title,
      })
      if (described?.description) await patchAttachmentMetadata({ description: described.description })
    } catch (visionError) {
      console.error("[webhooks/instagram] image vision describe failed — falling back to type-only", visionError)
    }
  } else if (primaryAttachment?.kind === "reel") {
    // No fetch, no vision — payload.url is the reel's VIDEO FILE; payload.title
    // is the reel's CAPTION, which is grounding enough on its own.
    if (primaryAttachment.title) {
      try {
        await patchAttachmentMetadata({ caption: primaryAttachment.title.slice(0, MAX_ATTACHMENT_CAPTION_LENGTH) })
      } catch (captionError) {
        console.error("[webhooks/instagram] failed to persist reel caption", captionError)
      }
    }
  } else if (primaryAttachment?.kind === "share") {
    try {
      const patch: Record<string, unknown> = {}
      if (primaryAttachment.title) patch.caption = primaryAttachment.title.slice(0, MAX_ATTACHMENT_CAPTION_LENGTH)
      if (primaryAttachment.url) {
        const described = await describeImageAttachment({
          orgId,
          imageUrl: primaryAttachment.url,
          title: primaryAttachment.title,
        })
        if (described?.description) patch.description = described.description
      }
      if (Object.keys(patch).length > 0) await patchAttachmentMetadata(patch)
    } catch (visionError) {
      console.error("[webhooks/instagram] shared-post vision describe failed — falling back to type-only", visionError)
    }
  } else if (primaryAttachment?.kind === "story_mention") {
    await enrichStoryMedia(primaryAttachment.url, primaryAttachment.title, false).catch((error) =>
      console.error("[webhooks/instagram] story_mention enrichment failed", error)
    )
  } else if (primaryAttachment?.kind === "audio" && primaryAttachment.url) {
    if (isDeepgramConfigured()) {
      try {
        const transcribed = await transcribeVoiceNote({ orgId, audioUrl: primaryAttachment.url })
        if (transcribed?.transcript) await patchAttachmentMetadata({ transcript: transcribed.transcript })
      } catch (transcribeError) {
        console.error("[webhooks/instagram] voice-note transcription failed — falling back to type-only", transcribeError)
      }
    }
    // No key configured — the diagnostics breadcrumb already fired above
    // (right after attachments were normalized); nothing else to do here,
    // the message stays honest-blind per attachmentToPromptContent's "audio"
    // fallback.
  }

  if (replyToStory) {
    await enrichStoryMedia(replyToStory.url, null, Boolean(replyToStory.linkStickerUrl)).catch((error) =>
      console.error("[webhooks/instagram] story-reply enrichment failed", error)
    )
  }

  // -----------------------------------------------------------------
  // 7. AI reply. Attachment-only messages now flow through here too (no more
  // "no text, skip the AI" gate) — the AI reacts to the description above,
  // or is honest about not being able to see/watch/hear it, per the
  // attachment STYLE_GUIDE line.
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
      console.error("[webhooks/instagram] failed to update conversation memory", error)
    )
  }

  // -----------------------------------------------------------------
  // VIP gate (Commander update wave B1, migration 0016 contacts.is_vip) —
  // sits BEFORE drafting (unlike the ai_mode 'off' branch further down,
  // which drafts first and discards): a VIP contact never gets an AI
  // auto-reply, so there's no point paying for a draft that can never be
  // sent. Flags ai_state 'ai_draft' directly (skipping the draft means we
  // can't know needsHuman) and fires a best-effort owner alert distinct
  // from the new-lead alert above. Memory still updates regardless (see the
  // block above) — VIP only gates sending, never learning.
  // -----------------------------------------------------------------
  if (contact.is_vip) {
    sendVipAlertEmail({
      orgId,
      channel: "instagram",
      contactName: contact.name,
      contactPhone: contact.phone,
      contactEmail: contact.email,
      messagePreview: storedBody,
    }).catch((emailError) => console.error("[webhooks/instagram] failed to send VIP alert email", emailError))

    await admin
      .from("conversations")
      .update({ ai_state: "ai_draft" })
      .eq("id", conversation.id)
      .eq("org_id", orgId)

    return
  }

  // Typing indicator (Commander update wave B2) — best-effort, fired right
  // before the model call so the customer sees a live "…typing" cue while it
  // thinks. Never let this affect the real reply below: a plain try/catch,
  // not awaited-blocking beyond itself, and its failure is just logged.
  // Skipped when this thread's AI is off (review fix): the off-branch below
  // never sends, and "typing… then nothing" is worse than no cue at all.
  // conversation.ai_mode here can be seconds stale vs the authoritative
  // re-read below — worst case is one spurious typing cue, never a wrong send.
  if (conversation.ai_mode !== "off") {
    try {
      await sendInstagramTypingIndicator(accessToken, senderId)
    } catch (typingError) {
      console.error("[webhooks/instagram] typing indicator failed", typingError)
    }
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
    // Out of ai_replies quota — same soft handoff as sms/chat: escalate, no send.
    draft = null
  }

  if (!draft) {
    // Not configured, out of quota, or the model couldn't produce a usable
    // draft after a retry — no DM is sent, just flag the thread.
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
  // Sits ABOVE the needsHuman branch (review fix): a needsHuman deferral
  // now SENDS a real DM, so the owner's 'off' toggle must gate it exactly
  // like a normal auto-reply.
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
    // needsHuman while off: flag escalated (owner attention) — never send.
    await admin
      .from("conversations")
      .update({ ai_state: draft.needsHuman ? "escalated" : "ai_draft" })
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
  const priorMessages = (history ?? []).filter((message) => message.id !== persistedInboundMessage.id)
  let introToSend = getIntroToSend({
    aiIntroEnabled: brain?.ai_intro_enabled ?? false,
    aiIntroText: brain?.ai_intro_text,
    priorMessages,
  })

  // Free-tier fallback branding (src/lib/plans.ts's `remove_branding`) —
  // appended to the intro text ONLY, never the real reply below.
  if (introToSend) {
    try {
      const entitlements = await getEntitlements(orgId)
      introToSend = appendLuminaSignature(introToSend, Boolean(entitlements.featureFlags.remove_branding))
    } catch (entitlementsError) {
      // Branding is cosmetic; the reply is not (review-caught): an
      // entitlements blip must never drop the customer's answer. Send the
      // intro unbranded and move on.
      console.error("[webhooks/instagram] failed to resolve entitlements for intro branding, sending unbranded", entitlementsError)
    }
  }

  if (introToSend) {
    try {
      const introSendResult = await sendInstagramMessage(accessToken, senderId, introToSend)
      const { error: introInsertError } = await admin.from("messages").insert({
        org_id: orgId,
        conversation_id: conversation.id,
        direction: "outbound",
        kind: "message",
        body: introToSend,
        ai_handled: true,
        // instagram_mid — same key the inbound/echo dedupe matches on
        // (see message.mid handling above and handleEchoMessagingEvent
        // below) — so Meta's echo of THIS send is recognized as our own
        // and never double-recorded.
        metadata: { intro: true, ...(introSendResult.messageId ? { instagram_mid: introSendResult.messageId } : {}) },
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

  if (draft.needsHuman) {
    // Smart escalation (Commander update): `reply` here is a real, warm,
    // in-voice deferral of THIS topic — it's what actually gets DMed back,
    // the AI just also flags the thread for the owner. Sits AFTER the
    // ai_mode gate and the intro block (review fix): the owner's 'off'
    // toggle applies, and a deferral that happens to be the first AI
    // message still carries the honest-AI disclosure.
    let deferralSendResult: Awaited<ReturnType<typeof sendInstagramMessage>>
    try {
      deferralSendResult = await sendInstagramMessage(accessToken, senderId, draft.reply)
    } catch (sendError) {
      console.error("[webhooks/instagram] failed to send deferral DM", sendError)
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
        metadata: {
          ...(draft.windDown === "close" ? { handoff: true, wind_down: "close" } : { handoff: true }),
          ...(deferralSendResult.messageId ? { instagram_mid: deferralSendResult.messageId } : {}),
        },
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
    return
  }

  // -----------------------------------------------------------------
  // 'auto' — actually send the DM via the Instagram Graph API, then
  // persist exactly as src/app/api/twilio/sms/route.ts's ai_answered path
  // does. A wind-down "close" reply (Commander update wave B2) still sends
  // for real — it's the AI's warm sign-off — but flips ai_state to
  // 'escalated' instead of 'ai_answered' (the owner needs to pick this
  // thread up) and tags the message so draftCustomerReply's own dedupe skips
  // drafting a repeat sign-off on the next inbound message.
  // -----------------------------------------------------------------
  let replySendResult: Awaited<ReturnType<typeof sendInstagramMessage>>
  try {
    replySendResult = await sendInstagramMessage(accessToken, senderId, draft.reply)
  } catch (sendError) {
    console.error("[webhooks/instagram] failed to send DM reply", sendError)
    await admin
      .from("conversations")
      .update({ ai_state: "escalated" })
      .eq("id", conversation.id)
      .eq("org_id", orgId)
    return
  }

  const isWindDownClose = draft.windDown === "close"

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
      metadata: {
        ...(isWindDownClose ? { wind_down: "close" } : {}),
        ...(replySendResult.messageId ? { instagram_mid: replySendResult.messageId } : {}),
      },
    })
    .select()
    .single()

  if (outboundError || !outboundMessage) {
    throw new Error(outboundError?.message ?? "failed to record outbound message")
  }

  await admin
    .from("conversations")
    .update({
      ai_state: isWindDownClose ? "escalated" : "ai_answered",
      status: "open",
      unread: false,
      last_message_at: outboundMessage.created_at,
    })
    .eq("id", conversation.id)
    .eq("org_id", orgId)
}

// ---------------------------------------------------------------------------
// Echo events — the owner replying to a customer from the Instagram app
// itself (or Meta's copy-back of our own API sends). See the module header
// for the bug-fix context. NEVER drafts or sends an AI reply; only persists
// and (for a genuinely new owner-typed message) triggers memory learning.
// ---------------------------------------------------------------------------

function isUniqueViolation(error: { code?: string } | null | undefined): boolean {
  return error?.code === "23505"
}

async function handleEchoMessagingEvent(
  admin: AdminClient,
  entry: InstagramEntry,
  event: InstagramMessagingEvent
): Promise<void> {
  // ID roles flip for an echo vs. a normal inbound event: sender.id is OUR
  // OWN connected account (used for org resolution, below) and recipient.id
  // is the CUSTOMER's IGSID (used for the contact lookup).
  const ourAccountId = event.sender?.id?.trim()
  const customerIgsid = event.recipient?.id?.trim()
  const message = event.message
  if (!ourAccountId || !customerIgsid || !message) return

  const hasText = typeof message.text === "string" && message.text.trim().length > 0
  const attachments: NormalizedInstagramAttachment[] = normalizeInstagramAttachments(message.attachments)
  const hasAttachments = attachments.length > 0
  if (!hasText && !hasAttachments) return // nothing worth recording

  const text = hasText ? (message.text as string).trim().slice(0, MAX_MESSAGE_TEXT_LENGTH) : null
  const storedBody = text ?? attachmentPlaceholderBody(attachments[0].kind)

  // Org resolution — same candidate-id lookup as the normal path, seeded
  // from OUR account (sender.id/entry.id) instead of the customer's id.
  const candidateAccountIds = Array.from(
    new Set([ourAccountId, entry.id?.trim()].filter((id): id is string => Boolean(id)))
  )
  if (candidateAccountIds.length === 0) return

  let connection: SocialConnection | null = null
  for (const accountId of candidateAccountIds) {
    const { data, error } = await admin
      .from("social_connections")
      .select()
      .or(`ig_user_id.eq.${accountId},page_id.eq.${accountId}`)
      .limit(1)

    if (error) {
      console.error("[webhooks/instagram] echo org lookup failed", error.message)
      return
    }
    if (data && data.length > 0) {
      connection = data[0] as SocialConnection
      break
    }
  }
  if (!connection) return // no org has this account connected — stray/stale webhook.

  const orgId = connection.org_id

  // Contact lookup — recipient.id (the CUSTOMER's IGSID) for an echo.
  const { data: existingContact, error: contactLookupError } = await admin
    .from("contacts")
    .select()
    .eq("org_id", orgId)
    .eq("source", "instagram")
    .contains("custom", { instagram_igsid: customerIgsid })
    .maybeSingle()

  if (contactLookupError) {
    console.error("[webhooks/instagram] echo contact lookup failed", contactLookupError.message)
    return
  }
  // An echo for a customer Lumina has never seen inbound from has nothing to
  // attach to — silently return rather than fabricate a contact/conversation
  // from a one-sided echo.
  if (!existingContact) return
  const contact = existingContact as Contact

  const { data: existingConversation, error: conversationLookupError } = await admin
    .from("conversations")
    .select()
    .eq("org_id", orgId)
    .eq("contact_id", contact.id)
    .eq("channel", "instagram")
    .maybeSingle()

  if (conversationLookupError) {
    console.error("[webhooks/instagram] echo conversation lookup failed", conversationLookupError.message)
    return
  }
  if (!existingConversation) return // no thread to resolve this echo against.
  const conversation = existingConversation as Conversation

  const mid = message.mid?.trim() || null

  // Dedupe layer 1 — mid match: catches our own already-persisted API sends
  // (every sendInstagramMessage call site now stores the send's message_id
  // as metadata.instagram_mid, same key inbound dedupe uses) and any Meta
  // redelivery of the same echo event.
  if (mid) {
    const { data: existingByMid, error: midDedupeError } = await admin
      .from("messages")
      .select("id")
      .eq("org_id", orgId)
      .eq("conversation_id", conversation.id)
      .contains("metadata", { instagram_mid: mid })
      .maybeSingle()

    if (midDedupeError) {
      console.error("[webhooks/instagram] echo mid dedupe lookup failed", midDedupeError.message)
      return
    }
    if (existingByMid) return // already recorded.
  }

  // Dedupe layer 2 — recent-send race: the echo can arrive before our own
  // API-send insert has committed, so the mid isn't on any row yet. Look at
  // this thread's outbound messages from the last
  // RECENT_SEND_DEDUPE_WINDOW_MS; an exact body match with no mid yet is
  // backfilled with this echo's mid instead of inserted as a new row.
  const recentSince = new Date(Date.now() - RECENT_SEND_DEDUPE_WINDOW_MS).toISOString()
  const { data: recentOutbound, error: recentOutboundError } = await admin
    .from("messages")
    .select("id, direction, kind, body, created_at, metadata")
    .eq("org_id", orgId)
    .eq("conversation_id", conversation.id)
    .eq("direction", "outbound")
    // kind gate (review-caught): internal notes are also direction "outbound";
    // matching a same-text note would drop the genuine echo AND mislabel the
    // note as a delivered DM. Enforced in isDuplicateOfRecentSend too.
    .eq("kind", "message")
    .gte("created_at", recentSince)
    .order("created_at", { ascending: false })

  if (recentOutboundError) {
    console.error("[webhooks/instagram] echo recent-send lookup failed", recentOutboundError.message)
    return
  }

  const raceDuplicate = isDuplicateOfRecentSend(
    (recentOutbound ?? []) as DedupeCandidateMessage[],
    storedBody,
    Date.now()
  )

  if (raceDuplicate) {
    if (mid) {
      const currentMetadata = (raceDuplicate.metadata ?? {}) as Record<string, unknown>
      const { error: backfillError } = await admin
        .from("messages")
        .update({ metadata: { ...currentMetadata, instagram_mid: mid } })
        .eq("id", raceDuplicate.id)
        .eq("org_id", orgId)

      // A failed backfill is survivable: the body is already recorded by the
      // original send, so nothing is lost. The residual risk is a late Meta
      // redelivery of this echo AFTER the 120s window (layer 2 won't match,
      // no mid on the row for layer 1/3) inserting a lookalike row — that
      // needs a transient DB error AND a delayed redelivery to line up, so
      // we log loudly instead of retrying.
      if (backfillError) console.error("[webhooks/instagram] echo mid backfill failed", backfillError.message)
    }
    return
  }

  // Not a duplicate of anything already known — a genuine owner reply typed
  // directly in the Instagram app. Persist as a real outbound human message
  // so the transcript is complete and memory learns it.
  const attachmentMetadata: Record<string, unknown> = hasAttachments
    ? {
        attachment: attachmentEntryFor(attachments[0]),
        ...(attachments.length > 1 ? { attachments: attachments.map(attachmentEntryFor) } : {}),
      }
    : {}

  const { data: insertedMessage, error: insertError } = await admin
    .from("messages")
    .insert({
      org_id: orgId,
      conversation_id: conversation.id,
      direction: "outbound",
      kind: "message",
      body: storedBody,
      ai_handled: false,
      metadata: { ...(mid ? { instagram_mid: mid } : {}), echo: true, ...attachmentMetadata },
    })
    .select()
    .single()

  if (insertError) {
    // migration 0014's unique partial index on metadata->>'instagram_mid'
    // makes a genuinely concurrent duplicate insert error here rather than
    // slip past the select-based dedupe above — that's already deduped, not
    // a real failure, so it's logged quietly and never thrown.
    if (isUniqueViolation(insertError)) {
      console.debug("[webhooks/instagram] echo insert deduped by unique index", insertError.message)
      return
    }
    console.error("[webhooks/instagram] failed to persist echo message", insertError.message)
    return
  }
  if (!insertedMessage) return

  // The owner just replied themselves — the thread does NOT become newly
  // unread (unlike a real inbound message), and ai_state/unread are
  // otherwise left exactly as they were.
  await admin
    .from("conversations")
    .update({ last_message_at: insertedMessage.created_at })
    .eq("id", conversation.id)
    .eq("org_id", orgId)

  // Fire-and-forget conversation memory, same trigger the normal inbound
  // path uses — so the AI learns what the owner said manually, even though
  // it never sends anything from this path.
  const { data: history, error: historyError } = await admin
    .from("messages")
    .select()
    .eq("org_id", orgId)
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: true })

  if (historyError) {
    console.error("[webhooks/instagram] echo memory history lookup failed", historyError.message)
    return
  }

  const messagesSoFar = ((history ?? []) as Message[]).filter((historyMessage) => historyMessage.kind === "message")
  if (shouldUpdateMemory(parseConversationMemory(conversation.ai_memory), messagesSoFar.length)) {
    void updateConversationMemory({ orgId, conversationId: conversation.id }).catch((error) =>
      console.error("[webhooks/instagram] failed to update conversation memory (echo)", error)
    )
  }
}
