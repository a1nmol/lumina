"use server"

// Server actions for the Unified Inbox.
//
// Demo-safe throughout, mirroring src/app/(app)/studio/actions.ts: every
// action falls back to DEMO_CONVERSATIONS/DEMO_APPOINTMENTS when Supabase
// isn't configured (or there's no resolvable org), and a real quota denial
// (AllowanceDeniedError) is surfaced as a typed { error: "allowance" } result
// rather than swallowed. draftReply additionally surfaces a needsHuman
// escalation as a typed { error: "needs_human" } result and persists the
// ai_state flip to "escalated" server-side — see the AI transparency rules in
// docs/design-briefs/phase-2-inbox-frontdesk-crm.md.

import { AllowanceDeniedError } from "@/lib/ai/errors"
import { draftCustomerReply, draftWhisperMessage } from "@/lib/ai/frontdesk-reply"
import { isOpenRouterConfigured } from "@/lib/ai/openrouter"
import {
  rewriteDraft as rewriteDraftInternal,
  suggestReplies as suggestRepliesInternal,
  type RewriteMode,
} from "@/lib/ai/reply-assist"
import { shouldCaptureStyleExample } from "@/lib/ai/style-examples"
import { DEMO_APPOINTMENTS, DEMO_CONVERSATIONS, DEMO_ORG, type DemoConversationDetail } from "@/lib/demo"
import {
  getContactWithTimeline,
  getConversation,
  listConversations,
  markConversationRead,
  sendMessage,
  setAiState,
  setConversationAiMode as persistConversationAiMode,
  setConversationStatus,
  updateContactStatus,
  upsertContact,
} from "@/lib/frontdesk"
import { getCurrentOrgId } from "@/lib/org"
import { sendInstagramMessage } from "@/lib/social/instagram-messaging"
import { createAdminClient } from "@/lib/supabase/admin"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"
import { isTwilioConfigured, sendSms } from "@/lib/twilio"
import type {
  Appointment,
  BusinessBrain,
  ContactStatus,
  ConversationAiMode,
  ConversationAiState,
  ConversationDetail,
  ConversationStatus,
  ConversationWithContact,
  Message,
  MessageKind,
} from "@/lib/types"

import { getBusinessBrain } from "@/app/(app)/settings/brain/actions"

const DEMO_DRAFT_DELAY_MS = 900
const MAX_BODY_LENGTH = 4000
// Aligned with src/app/(app)/contacts/actions.ts's MAX_TAGS/MAX_TAG_LENGTH —
// the same contact `tags` column is written from both surfaces.
const MAX_TAGS = 12
const MAX_TAG_LENGTH = 40
const GENERIC_DEMO_DRAFT =
  "Thanks so much for reaching out — let me take a look and get back to you shortly with the details!"
const AI_FAILURE_MESSAGE = "I couldn't answer this — flagging for you."
const MAX_SERVICES_IN_FALLBACK = 3
const MAX_HOURS_IN_FALLBACK = 3

// AI-assist pair (suggested replies + tone rewriter) — demo-mode delay and
// canned copy, matching GENERIC_DEMO_DRAFT's conventions above.
const AI_ASSIST_DEMO_DELAY_MS = 700
const DEMO_SUGGESTED_REPLIES = [
  "Thanks so much for reaching out — happy to help with that! Let me pull the details together for you.",
  "Good question! Could you tell me a bit more about what you're looking for so I point you in the right direction?",
  "Appreciate your patience on this one — I'll get it sorted and follow up with you shortly!",
]
const MAX_REWRITE_TEXT_LENGTH = 1000
const REWRITE_NOTHING_TO_REWRITE_MESSAGE = "Nothing to rewrite."
const REWRITE_UNAVAILABLE_MESSAGE = "AI rewriting isn't available right now."
const REWRITE_FAILED_MESSAGE = "Couldn't rewrite that — please try again."

/** Small, deterministic demo-mode stand-in for rewriteDraft when Supabase/OpenRouter aren't configured — never calls a model. */
function demoRewriteText(text: string, mode: RewriteMode): string {
  switch (mode) {
    case "friendlier":
      return `${text.replace(/[.!]+$/, "")}! Happy to help however I can.`
    case "shorter": {
      const firstSentence = text.match(/^[^.!?]*[.!?]/)?.[0]?.trim()
      return firstSentence && firstSentence.length < text.length ? firstSentence : text
    }
    case "more_formal":
      return text
        .replace(/\bwe're\b/gi, "we are")
        .replace(/\byou'll\b/gi, "you will")
        .replace(/\bthat's\b/gi, "that is")
        .replace(/\bwe'll\b/gi, "we will")
    case "translate_es":
      return "Gracias por tu mensaje, en breve te confirmamos los detalles."
    default:
      return text
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function firstName(name: string | null | undefined): string {
  if (!name) return "there"
  return name.trim().split(/\s+/)[0] || "there"
}

/** A short, human-readable "open Mon 9-5, ..." summary from the Business Brain's hours, or null if none are set. */
function summarizeHours(brain: BusinessBrain | null): string | null {
  const entries = Object.entries(brain?.hours ?? {})
    .filter((entry): entry is [string, { open: string; close: string; closed?: boolean }] => Boolean(entry[1]) && !entry[1]!.closed)
    .slice(0, MAX_HOURS_IN_FALLBACK)
    .map(([day, window]) => `${day} ${window.open}-${window.close}`)
  return entries.length > 0 ? entries.join(", ") : null
}

/** A short "we offer X, Y, Z" summary from the Business Brain's services, or null if none are set. */
function summarizeServices(brain: BusinessBrain | null): string | null {
  const names = (brain?.services ?? [])
    .slice(0, MAX_SERVICES_IN_FALLBACK)
    .map((service) => service.name)
    .filter(Boolean)
  return names.length > 0 ? names.join(", ") : null
}

/**
 * A graceful, non-AI fallback reply for when Supabase is configured but
 * OpenRouter is not (finding 1): grounded in real Business Brain data
 * (hours/services) and the real contact's name where available, but
 * deliberately generic about anything it can't know for sure — it never
 * fabricates specifics about the customer's actual question.
 */
function groundedFallbackDraft(conversation: ConversationDetail, businessBrain: BusinessBrain | null): string {
  const name = firstName(conversation.contact?.name)
  const hoursSummary = summarizeHours(businessBrain)
  const servicesSummary = summarizeServices(businessBrain)

  const parts = [`Hi ${name}, thanks so much for reaching out!`]
  if (servicesSummary) parts.push(`We offer ${servicesSummary}, and we'll get you the exact details for your question shortly.`)
  else parts.push("We'll take a look and get you the exact details shortly.")
  if (hoursSummary) parts.push(`We're open ${hoursSummary}.`)
  parts.push("Talk soon!")
  return parts.join(" ")
}

/**
 * A thread-list row's conversation shape. `messages` is optional and only
 * ever populated by demo data (DEMO_CONVERSATIONS already carries full
 * history) — the thread list uses it, when present, to render a real last-
 * message snippet instead of a generic "via <channel>" placeholder, without
 * requiring every conversation's full history to be loaded up front against
 * a real backend.
 */
export type ThreadListConversation = ConversationWithContact & { messages?: Message[] }

/** Everything the Inbox needs on first paint. */
export interface InboxData {
  conversations: ThreadListConversation[]
}

/** Loads this org's conversations (joined with contact fields), falling back to demo data when Supabase isn't configured. */
export async function getInboxData(): Promise<InboxData> {
  if (!isSupabaseConfigured()) {
    return { conversations: DEMO_CONVERSATIONS }
  }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { conversations: [] }

  const conversations = await listConversations(orgId)
  return { conversations }
}

/** A conversation's full detail for the center pane. `pendingAiDraft` only ever comes from demo data. */
export type InboxConversationDetail = DemoConversationDetail

/** Loads one conversation's full message history + contact for the detail pane. */
export async function getConversationDetail(conversationId: string): Promise<InboxConversationDetail | null> {
  if (!isSupabaseConfigured()) {
    return DEMO_CONVERSATIONS.find((conversation) => conversation.id === conversationId) ?? null
  }

  const orgId = await getCurrentOrgId()
  if (!orgId) return null

  return await getConversation(orgId, conversationId)
}

/** Appointments booked for a contact — used by the context pane's "Linked appointments" section. */
export async function getAppointmentsForContact(contactId: string): Promise<Appointment[]> {
  if (!isSupabaseConfigured()) {
    return DEMO_APPOINTMENTS.filter((appointment) => appointment.contact_id === contactId)
  }

  const orgId = await getCurrentOrgId()
  if (!orgId) return []

  const result = await getContactWithTimeline(orgId, contactId)
  if (!result) return []

  return result.timeline
    .filter((event): event is Extract<(typeof result.timeline)[number], { type: "appointment" }> => event.type === "appointment")
    .map((event) => event.appointment)
}

export type DraftReplyResult =
  | { draft: string; model?: string; costUsd?: number }
  | { error: "allowance"; message: string }
  | { error: "needs_human"; message: string }
  | { error: "not_found"; message: string }

/**
 * Drafts the next customer reply.
 *
 * - Supabase not configured (true demo mode): returns the thread's canned
 *   pendingAiDraft (or a generic canned draft) after a short simulated delay.
 * - Supabase configured but OpenRouter not configured: loads the REAL
 *   conversation + Business Brain and returns a graceful, generic-but-
 *   grounded fallback draft (see groundedFallbackDraft) instead of a demo
 *   placeholder — there is no AI available, but the org's own data still is.
 * - Both configured: calls draftCustomerReply — a needsHuman result (or the
 *   model failing to produce a usable draft) flips ai_state to "escalated"
 *   and is surfaced as a typed error so the composer can toast + reflect the
 *   state change; a spend-guard/quota denial is surfaced distinctly.
 *
 * A missing conversation (e.g. raced with a delete, or a stale id) is its
 * own distinct "not_found" error — unlike a real escalation, there is no
 * conversation left to flip ai_state on, so it must not attempt that write.
 */
export async function draftReply(conversationId: string): Promise<DraftReplyResult> {
  if (!isSupabaseConfigured()) {
    await sleep(DEMO_DRAFT_DELAY_MS)
    const demoConversation = DEMO_CONVERSATIONS.find((conversation) => conversation.id === conversationId)
    return { draft: demoConversation?.pendingAiDraft ?? GENERIC_DEMO_DRAFT }
  }

  const orgId = await getCurrentOrgId()
  if (!orgId) {
    await sleep(DEMO_DRAFT_DELAY_MS)
    return { draft: GENERIC_DEMO_DRAFT }
  }

  const conversation = await getConversation(orgId, conversationId)
  if (!conversation) {
    return { error: "not_found", message: "This conversation could not be found." }
  }

  if (!isOpenRouterConfigured()) {
    const businessBrain = await getBusinessBrain()
    return { draft: groundedFallbackDraft(conversation, businessBrain) }
  }

  try {
    const businessBrain = await getBusinessBrain()
    const result = await draftCustomerReply({
      orgId,
      businessBrain,
      conversation,
      messages: conversation.messages,
      contact: conversation.contact,
    })

    if (!result) {
      await setAiState(orgId, conversationId, "escalated")
      return { error: "needs_human", message: AI_FAILURE_MESSAGE }
    }

    if (result.needsHuman) {
      await setAiState(orgId, conversationId, "escalated")
      return { error: "needs_human", message: result.reason ?? AI_FAILURE_MESSAGE }
    }

    return { draft: result.reply, model: result.model, costUsd: result.costUsd }
  } catch (error) {
    if (error instanceof AllowanceDeniedError) {
      return { error: "allowance", message: error.message || "You're out of AI reply quota this month." }
    }
    throw error
  }
}

export type SuggestRepliesResult =
  | { suggestions: string[]; model?: string; costUsd?: number }
  | { error: "allowance"; message: string }

/**
 * Suggests up to 3 quick-tap reply options for a conversation's most recent
 * customer message (never auto-sent — the composer fills its textarea from
 * whichever chip the human taps).
 *
 * - Supabase not configured (true demo mode) or no org resolved: canned
 *   DEMO_SUGGESTED_REPLIES after a short simulated delay, mirroring draftReply.
 * - Supabase configured but OpenRouter not: no model available, returns an
 *   empty list rather than a fake draft (there's nothing grounded to offer
 *   for 3 *alternative* replies the way groundedFallbackDraft can for one).
 * - Both configured: delegates to suggestReplies (src/lib/ai/reply-assist.ts).
 *   A parse failure there already degrades to an empty list; only a real
 *   spend-guard/quota denial is surfaced as an error here.
 */
export async function suggestReplies(conversationId: string): Promise<SuggestRepliesResult> {
  if (!isSupabaseConfigured()) {
    await sleep(AI_ASSIST_DEMO_DELAY_MS)
    return { suggestions: DEMO_SUGGESTED_REPLIES }
  }

  const orgId = await getCurrentOrgId()
  if (!orgId) {
    await sleep(AI_ASSIST_DEMO_DELAY_MS)
    return { suggestions: DEMO_SUGGESTED_REPLIES }
  }

  if (!isOpenRouterConfigured()) {
    return { suggestions: [] }
  }

  try {
    const result = await suggestRepliesInternal({ orgId, conversationId })
    return { suggestions: result?.suggestions ?? [], model: result?.model, costUsd: result?.costUsd }
  } catch (error) {
    if (error instanceof AllowanceDeniedError) {
      return { error: "allowance", message: error.message || "You're out of AI reply quota this month." }
    }
    throw error
  }
}

export type RewriteDraftResult =
  | { text: string; model?: string; costUsd?: number }
  | { error: "allowance"; message: string }
  | { error: "invalid" | "failed"; message: string }

/**
 * Rewrites a draft reply already sitting in the composer (friendlier /
 * shorter / more formal / Spanish translation) — never auto-sent, only
 * replaces the composer's text; the human still has to press Send.
 */
export async function rewriteDraft(text: string, mode: RewriteMode): Promise<RewriteDraftResult> {
  const trimmed = text.trim()
  if (!trimmed || trimmed.length > MAX_REWRITE_TEXT_LENGTH) {
    return { error: "invalid", message: REWRITE_NOTHING_TO_REWRITE_MESSAGE }
  }

  if (!isSupabaseConfigured()) {
    await sleep(AI_ASSIST_DEMO_DELAY_MS)
    return { text: demoRewriteText(trimmed, mode) }
  }

  const orgId = await getCurrentOrgId()
  if (!orgId) {
    await sleep(AI_ASSIST_DEMO_DELAY_MS)
    return { text: demoRewriteText(trimmed, mode) }
  }

  if (!isOpenRouterConfigured()) {
    return { error: "failed", message: REWRITE_UNAVAILABLE_MESSAGE }
  }

  try {
    const result = await rewriteDraftInternal({ orgId, text: trimmed, mode })
    if (!result) return { error: "failed", message: REWRITE_FAILED_MESSAGE }
    return { text: result.text, model: result.model, costUsd: result.costUsd }
  } catch (error) {
    if (error instanceof AllowanceDeniedError) {
      return { error: "allowance", message: error.message || "You're out of AI reply quota this month." }
    }
    throw error
  }
}

// ---------------------------------------------------------------------------
// Delivery — the owner's manual-send counterpart to the AI auto-reply sends
// already wired in src/app/api/webhooks/instagram/route.ts (Instagram) and
// src/app/api/twilio/sms/route.ts (SMS). sendReply below calls deliverReply
// BEFORE persisting the outbound message row: a failed delivery must never
// be recorded as "sent" to the thread, so every helper here throws a clear,
// human-readable Error on failure rather than returning a typed result —
// sendReply lets it propagate, and persists nothing.
// ---------------------------------------------------------------------------

/** Meta's standard messaging window — a plain send is only allowed within this. */
const INSTAGRAM_STANDARD_WINDOW_MS = 24 * 60 * 60 * 1000
/**
 * Meta's HUMAN_AGENT tag extends replies out to 7 days after the customer's
 * last message, but ONLY for human-directed replies — never an unattended AI
 * auto-send (the webhook routes never use this path; their sends happen
 * inside the standard window a fresh inbound message just opened). Both
 * senders here qualify as human-directed: sendReply is the owner's own
 * composer, and whisperToConversation is the owner personally instructing
 * the exact response moments before it goes out — the owner is in the loop
 * for every tagged send. Deliberate decision (Commander wave B2 review).
 */
const INSTAGRAM_HUMAN_AGENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Sends via the Instagram Graph API, honoring Meta's App-Review-mandated
 * messaging windows: plain send inside 24h of the customer's last inbound
 * message, HUMAN_AGENT-tagged send from 24h out to 7 days, and an honest
 * failure past 7 days (or if the customer never messaged in) — there is no
 * way to deliver, so this never fakes success.
 */
/** Returns the Instagram send's `message_id`, when returned — stored by callers as metadata.instagram_mid so the echo handler recognizes this as our own send (see src/app/api/webhooks/instagram/route.ts#handleEchoMessagingEvent). */
async function deliverInstagramReply(orgId: string, conversation: ConversationDetail, body: string): Promise<string | null> {
  const igsid =
    typeof conversation.contact?.custom?.instagram_igsid === "string"
      ? (conversation.contact.custom.instagram_igsid as string)
      : null

  const supabase = await createClient()
  const { data: connection, error } = await supabase
    .from("social_connections")
    .select()
    .eq("org_id", orgId)
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(`sendReply: failed to load Instagram connection: ${error.message}`)
  }
  if (!connection || !igsid) {
    throw new Error("This Instagram conversation isn't connected for sending.")
  }

  const lastInbound = [...conversation.messages].reverse().find((message) => message.direction === "inbound")
  const ageMs = lastInbound ? Date.now() - new Date(lastInbound.created_at).getTime() : null

  if (ageMs === null || ageMs > INSTAGRAM_HUMAN_AGENT_WINDOW_MS) {
    throw new Error("Instagram only allows replies within 7 days of the customer's last message.")
  }

  try {
    const result = await sendInstagramMessage(
      connection.access_token,
      igsid,
      body,
      ageMs >= INSTAGRAM_STANDARD_WINDOW_MS ? "HUMAN_AGENT" : undefined
    )
    return result.messageId
  } catch {
    // The underlying call already logs the HTTP status (never the token) —
    // see src/lib/social/instagram-messaging.ts. Nothing more to log here.
    throw new Error("Couldn't deliver to Instagram — try again.")
  }
}

/** Sends via Twilio's SMS REST API, using the org's provisioned number as the "From". Returns null (SMS has no analogous mid to capture here). */
async function deliverSmsReply(orgId: string, conversation: ConversationDetail, body: string): Promise<null> {
  if (!isTwilioConfigured()) {
    throw new Error("SMS sending isn't configured yet.")
  }

  const to = conversation.contact?.phone?.trim()
  if (!to) {
    throw new Error("This contact doesn't have a phone number on file.")
  }

  const supabase = await createClient()
  const { data: numberRow, error } = await supabase
    .from("org_phone_numbers")
    .select("phone_number")
    .eq("org_id", orgId)
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(`sendReply: failed to load org phone number: ${error.message}`)
  }
  if (!numberRow) {
    throw new Error("This business doesn't have a phone number connected for SMS yet.")
  }

  try {
    await sendSms(to, numberRow.phone_number, body)
  } catch (sendError) {
    console.error("[inbox/actions] failed to send SMS reply", sendError)
    throw new Error("Couldn't deliver the text message — try again.")
  }

  return null
}

/**
 * Delivers a customer-facing reply on its channel. instagram and sms
 * actually push the message out; web_chat (and any other/future channel)
 * is a deliberate no-op — the widget conversation is request/response over
 * the browser tab that's already open, so there's no separate channel to
 * push a reply to, and the existing persist-only behavior is correct.
 *
 * Returns the channel's send id when one exists (Instagram's message_id) so
 * the caller can stamp it onto the persisted message's metadata as
 * instagram_mid — the same key the inbound/echo webhook dedupe matches on,
 * so an echo of THIS send is recognized as our own and never double-recorded.
 */
async function deliverReply(orgId: string, conversation: ConversationDetail, body: string): Promise<string | null> {
  switch (conversation.channel) {
    case "instagram":
      return deliverInstagramReply(orgId, conversation, body)
    case "sms":
      return deliverSmsReply(orgId, conversation, body)
    default:
      return null
  }
}

export interface DeliverAndPersistReplyInput {
  orgId: string
  conversationId: string
  body: string
  aiHandled?: boolean
  model?: string | null
  costUsd?: number
  metadata?: Record<string, unknown>
}

/**
 * The shared channel-delivery core (Commander update wave B2): loads the
 * conversation, delivers `body` on its channel (see deliverReply — throws a
 * clear, human-readable Error on a real delivery failure, e.g. an Instagram
 * messaging-window miss or SMS not configured, and persists NOTHING when it
 * does), then persists the message via sendMessage once delivery succeeds.
 * Used by BOTH sendReply (the owner's manual composer send) and
 * whisperToConversation (the owner's whisper-to-AI send) so every reply that
 * actually leaves Lumina — human-typed or AI-composed — goes through
 * IDENTICAL Instagram-window/SMS delivery logic. Never used for internal
 * notes, which never leave Lumina (see sendReply's own "note" branch).
 */
async function deliverAndPersistReply(input: DeliverAndPersistReplyInput): Promise<Message | null> {
  const conversation = await getConversation(input.orgId, input.conversationId)
  if (!conversation) {
    throw new Error("This conversation could not be found.")
  }
  const sendId = await deliverReply(input.orgId, conversation, input.body)

  return await sendMessage(input.orgId, input.conversationId, {
    body: input.body,
    kind: "message",
    aiHandled: input.aiHandled,
    model: input.model,
    costUsd: input.costUsd,
    metadata: sendId ? { ...input.metadata, instagram_mid: sendId } : input.metadata,
  })
}

export interface SendReplyInput {
  conversationId: string
  body: string
  kind: MessageKind
  /** True when this message is being sent verbatim (or edited) from an AI draft. */
  aiHandled?: boolean
  model?: string | null
  costUsd?: number
  /**
   * The AI-drafted text that originally prefilled the composer (from
   * draftReply or a clicked suggestion chip — see ReplyComposer's
   * originalAiDraftRef) BEFORE any owner edits. Only ever set for kind
   * "message" (never for notes/whispers, which have their own paths). When
   * present and it differs from the body actually sent, sendReply captures
   * the pair as an edit-learning exemplar (migration 0018
   * ai_style_examples) — see captureStyleExampleIfEdited below.
   */
  originalAiDraft?: string
}

// ---------------------------------------------------------------------------
// Edit-learning capture (Outlast wave 2, Part A) — every time the owner sends
// something meaningfully different from the AI draft that prefilled the
// composer, that pair is free training signal for src/lib/ai/style-examples.ts.
// ---------------------------------------------------------------------------

const MAX_STYLE_EXAMPLE_TEXT_LENGTH = 1000
/** Keep only the newest N rows per org — a rolling window is plenty of signal, and this keeps the table (and every fetchStyleExamples query) cheap forever. */
const STYLE_EXAMPLES_KEEP_COUNT = 50

/**
 * Fire-and-forget capture of one edit-learning exemplar. Captures NOTHING
 * (no row) when the trimmed draft and trimmed sent text are identical — an
 * unedited send has nothing to learn from — or when originalAiDraft is blank
 * (a from-scratch reply, or a suggestion that was never actually used).
 * Best-effort throughout: any query failure here is logged and swallowed,
 * never surfaced to the caller — see sendReply's void call site, which never
 * awaits this.
 */
async function captureStyleExampleIfEdited(
  orgId: string,
  conversationId: string,
  originalAiDraft: string,
  sentBody: string
): Promise<void> {
  if (!shouldCaptureStyleExample(originalAiDraft, sentBody)) return
  const trimmedDraft = originalAiDraft.trim()
  const trimmedSent = sentBody.trim()

  const supabase = await createClient()

  const { data: conversationRow } = await supabase
    .from("conversations")
    .select("channel")
    .eq("org_id", orgId)
    .eq("id", conversationId)
    .maybeSingle()

  const { error: insertError } = await supabase.from("ai_style_examples").insert({
    org_id: orgId,
    conversation_id: conversationId,
    channel: conversationRow?.channel ?? null,
    ai_draft: trimmedDraft.slice(0, MAX_STYLE_EXAMPLE_TEXT_LENGTH),
    owner_text: trimmedSent.slice(0, MAX_STYLE_EXAMPLE_TEXT_LENGTH),
  })

  if (insertError) {
    console.error("[inbox/actions] failed to capture style example", insertError.message)
    return
  }

  // Cap table growth: prune everything past the newest STYLE_EXAMPLES_KEEP_COUNT
  // rows for this org. Uses the service-role admin client, not the RLS-scoped
  // client above — migration 0018 only grants org members SELECT/INSERT on
  // this table, no DELETE policy, so a delete via the user-scoped client
  // would be silently blocked by RLS and never actually prune anything.
  // Best-effort — a failed prune just means the table grows a bit more than
  // intended, never worth failing the capture over.
  const admin = createAdminClient()
  const { data: staleRows, error: staleError } = await admin
    .from("ai_style_examples")
    .select("id")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    // Secondary key: identical created_at values (fast concurrent inserts)
    // must rank stably across executions, or the keep/prune boundary drifts.
    .order("id", { ascending: false })
    .range(STYLE_EXAMPLES_KEEP_COUNT, STYLE_EXAMPLES_KEEP_COUNT + 200)

  if (staleError || !staleRows || staleRows.length === 0) return

  const { error: deleteError } = await admin
    .from("ai_style_examples")
    .delete()
    .in("id", staleRows.map((row) => row.id))

  if (deleteError) {
    console.error("[inbox/actions] failed to prune ai_style_examples", deleteError.message)
  }
}

/**
 * Sends a reply or internal note. Demo mode synthesizes a Message for
 * optimistic append; configured mode delivers first (see
 * deliverAndPersistReply — skipped for internal notes, which never leave
 * Lumina) and only persists once delivery succeeds. A delivery failure
 * throws and nothing is persisted — the composer's catch surfaces the thrown
 * message as a toast.
 */
export async function sendReply(input: SendReplyInput): Promise<Message | null> {
  const trimmed = input.body.trim()
  if (!trimmed || trimmed.length > MAX_BODY_LENGTH) {
    throw new Error("sendReply: invalid body")
  }

  if (!isSupabaseConfigured()) {
    return {
      id: `demo-sent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      org_id: DEMO_ORG.id,
      conversation_id: input.conversationId,
      direction: "outbound",
      kind: input.kind,
      body: trimmed,
      ai_handled: input.aiHandled ?? false,
      model: input.model ?? null,
      cost_usd: input.costUsd ?? 0,
      metadata: {},
      created_at: new Date().toISOString(),
    }
  }

  const orgId = await getCurrentOrgId()
  if (!orgId) return null

  if (input.kind === "note") {
    return await sendMessage(orgId, input.conversationId, {
      body: trimmed,
      kind: "note",
      aiHandled: input.aiHandled,
      model: input.model,
      costUsd: input.costUsd,
    })
  }

  const message = await deliverAndPersistReply({
    orgId,
    conversationId: input.conversationId,
    body: trimmed,
    aiHandled: input.aiHandled,
    model: input.model,
    costUsd: input.costUsd,
  })

  if (message && input.originalAiDraft?.trim()) {
    void captureStyleExampleIfEdited(orgId, input.conversationId, input.originalAiDraft, trimmed).catch((error) => {
      console.error("[inbox/actions] style-example capture threw", error)
    })
  }

  return message
}

// ---------------------------------------------------------------------------
// Whisper commands (Commander update wave B2) — the owner privately tells the
// AI what to say next (composer detects a draft starting with "@ai ", see
// src/components/inbox/reply-composer.tsx) and the AI weaves it into the
// conversation in its own voice (src/lib/ai/frontdesk-reply.ts#draftWhisperMessage).
// ---------------------------------------------------------------------------

const MAX_WHISPER_INSTRUCTION_LENGTH = 500
const WHISPER_UNAVAILABLE_MESSAGE = "Whisper isn't available right now."
const WHISPER_FAILED_MESSAGE = "Couldn't compose that — please try again."

export type WhisperToConversationResult =
  | { note: Message; reply: Message; text: string; model?: string; costUsd?: number }
  | { error: "allowance"; message: string }
  | { error: "invalid" | "failed" | "not_found"; message: string }

/**
 * The owner's private whisper flow: persists `instruction` as an internal
 * note FIRST (kind "note", ai_handled false — so it's on record even if
 * drafting/delivery fails next), then drafts a customer-facing message from
 * it (draftWhisperMessage) and sends it through the exact same delivery path
 * sendReply uses (deliverAndPersistReply above), persisted as outbound
 * ai_handled true with `metadata: { whisper: true }`. Demo mode / no
 * OpenRouter configured returns a typed "failed" error rather than faking a
 * whisper reply — there's no honest canned line for "the AI composed
 * whatever you privately asked it to."
 */
export async function whisperToConversation(
  conversationId: string,
  instruction: string
): Promise<WhisperToConversationResult> {
  const trimmedInstruction = instruction.trim()
  if (!trimmedInstruction || trimmedInstruction.length > MAX_WHISPER_INSTRUCTION_LENGTH) {
    return { error: "invalid", message: "Whisper instruction must be between 1 and 500 characters." }
  }

  if (!isSupabaseConfigured() || !isOpenRouterConfigured()) {
    return { error: "failed", message: WHISPER_UNAVAILABLE_MESSAGE }
  }

  const orgId = await getCurrentOrgId()
  if (!orgId) {
    return { error: "failed", message: WHISPER_UNAVAILABLE_MESSAGE }
  }

  const conversation = await getConversation(orgId, conversationId)
  if (!conversation) {
    return { error: "not_found", message: "This conversation could not be found." }
  }

  // Persisted first and unconditionally — the owner's private instruction
  // stays on record even if the AI can't compose or deliver a reply below.
  const note = await sendMessage(orgId, conversationId, {
    body: `Whisper to AI: ${trimmedInstruction}`,
    kind: "note",
    aiHandled: false,
  })
  if (!note) {
    return { error: "failed", message: WHISPER_FAILED_MESSAGE }
  }

  try {
    const businessBrain = await getBusinessBrain()
    const drafted = await draftWhisperMessage({
      orgId,
      instruction: trimmedInstruction,
      businessBrain,
      conversation,
      messages: conversation.messages,
      contact: conversation.contact,
    })

    if (!drafted) {
      return { error: "failed", message: WHISPER_FAILED_MESSAGE }
    }

    const reply = await deliverAndPersistReply({
      orgId,
      conversationId,
      body: drafted.reply,
      aiHandled: true,
      model: drafted.model,
      costUsd: drafted.costUsd,
      metadata: { whisper: true },
    })

    if (!reply) {
      return { error: "failed", message: WHISPER_FAILED_MESSAGE }
    }

    return { note, reply, text: reply.body ?? drafted.reply, model: drafted.model, costUsd: drafted.costUsd }
  } catch (error) {
    if (error instanceof AllowanceDeniedError) {
      return { error: "allowance", message: error.message || "You're out of AI reply quota this month." }
    }
    // deliverAndPersistReply throws a clear, human-readable message for a
    // real delivery failure (Instagram messaging-window miss, SMS not
    // configured, etc.) — surface that instead of a generic failure.
    if (error instanceof Error && error.message) {
      return { error: "failed", message: error.message }
    }
    throw error
  }
}

export interface ActionResult {
  ok: boolean
}

/** Sets a conversation's status (open/pending/resolved). Demo-safe no-op when unconfigured. */
export async function setStatus(conversationId: string, status: ConversationStatus): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: true }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: true }

  try {
    await setConversationStatus(orgId, conversationId, status)
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

/** Sets a conversation's AI transparency state. Demo-safe no-op when unconfigured. */
export async function setState(conversationId: string, aiState: ConversationAiState): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: true }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: true }

  try {
    await setAiState(orgId, conversationId, aiState)
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

/**
 * Sets a conversation's per-thread AI autonomy — 'auto' lets the AI send
 * replies itself, 'off' makes it draft-only (see migration 0011 and the
 * enforcement in src/app/api/frontdesk/chat/route.ts /
 * src/app/api/twilio/sms/route.ts). Demo-safe no-op when unconfigured — the
 * inbox UI itself skips calling this action in demo mode (see
 * InboxShell#handleAiModeChange) and shows the standard "changes aren't
 * saved" toast instead, matching src/app/(app)/settings/faq-card.tsx.
 */
export async function setConversationAiMode(conversationId: string, mode: ConversationAiMode): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: true }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: true }

  try {
    await persistConversationAiMode(orgId, conversationId, mode)
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

/** Moves a contact to a new pipeline status. Demo-safe no-op when unconfigured. */
export async function setContactPipelineStatus(contactId: string, status: ContactStatus): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: true }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: true }

  try {
    await updateContactStatus(orgId, contactId, status)
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

/** Appends a tag to a contact (dedupes, trims to a reasonable length, caps total tag count). Demo-safe no-op when unconfigured. */
export async function addContactTag(contactId: string, currentTags: string[], tag: string): Promise<ActionResult> {
  const cleaned = tag.trim().slice(0, MAX_TAG_LENGTH)
  if (!cleaned) return { ok: false }

  const nextTags = Array.from(new Set([...currentTags, cleaned]))
  if (nextTags.length > MAX_TAGS) return { ok: false }

  if (!isSupabaseConfigured()) return { ok: true }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: true }

  try {
    await upsertContact(orgId, { id: contactId, tags: nextTags })
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

/** Marks a conversation as read (clears `unread`). Demo-safe no-op when unconfigured. */
export async function markRead(conversationId: string): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: true }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: true }

  try {
    await markConversationRead(orgId, conversationId)
    return { ok: true }
  } catch {
    return { ok: false }
  }
}
