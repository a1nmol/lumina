import "server-only"

// FrontDesk customer-reply drafting — the "AI answers/drafts" half of the
// Unified Inbox (MASTER_PLAN.md §4.D). Routes through the shared model
// router's "customer_reply" job, which is PINNED to Claude Haiku 4.5 first
// (src/lib/ai/router.ts MODEL_CANDIDATES.customer_reply) precisely because
// this prompt carries real customer PII (name, phone, email, message
// content) — MASTER_PLAN.md §5 is explicit: "NEVER send customer PII to
// free tiers (they may train on it). Route PII to paid endpoints." Do NOT
// repoint this job at a free-tier model.
//
// Returns null when OpenRouter/Supabase aren't configured (demo mode) or the
// model can't produce usable JSON after one retry — callers should fall back
// to a canned demo draft, exactly like src/lib/ai/generate-content.ts does
// for Content Studio.
//
// AllowanceDeniedError (spend guard / quota) is NOT swallowed here — it
// propagates up through runTextJob (which already meters usage against the
// org's `ai_replies` allowance) so the caller can surface a real
// "out of quota" state instead of silently drafting nothing.

import { ATTACHMENT_PLACEHOLDER_BY_KIND } from "@/lib/social/instagram-attachments"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import type {
  BusinessBrain,
  BusinessService,
  Contact,
  ContactStatus,
  Conversation,
  Message,
} from "@/lib/types"

import { buildMemoryPromptLines, parseConversationMemory } from "./conversation-memory"
import type { ChatMessage } from "./openrouter"
import { isOpenRouterConfigured } from "./openrouter"
import { runTextJob } from "./router"

export interface DraftCustomerReplyInput {
  orgId: string
  businessBrain: BusinessBrain | null
  conversation: Conversation
  /** Full message history for the conversation; only the most recent MAX_HISTORY_MESSAGES are sent to the model. */
  messages: Message[]
  contact: Contact | null
}

export interface DraftedCustomerReply {
  reply: string
  needsHuman: boolean
  reason?: string
  /** A pipeline status the AI thinks this contact should move to (e.g. "booked" after a successful booking). Caller decides whether to apply it. */
  suggestedStatus?: ContactStatus
  model: string
  costUsd: number
}

const MAX_HISTORY_MESSAGES = 10
const MAX_REPLY_LENGTH = 1500
const MAX_REASON_LENGTH = 300
const MAX_RETRIES = 1 // one regeneration attempt on parse failure, matching generate-content.ts.
const MAX_SERVICES_IN_PROMPT = 6
const MAX_FAQ_IN_PROMPT = 6
const MAX_DESCRIPTION_CHARS_IN_PROMPT = 400

const VALID_CONTACT_STATUSES: readonly ContactStatus[] = ["lead", "contacted", "booked", "customer"]

// Voice rules (owner direction, 2026-07-29): replies must read like the shop
// owner texting back from their phone between customers — not "AI customer
// support." Concretely this means short and matched to the customer's own
// length/energy, no em dashes/semicolons/bullet lists, no corporate stock
// phrases ("I'd be happy to assist you", "As an AI"), contractions always,
// and natural texting touches (occasional lowercase sentence starts, sparing
// exclamation points, casual glue words like "yep"/"for sure"/"no worries").
// Explicitly NOT deliberate typos/bad grammar — the owner wants raw and
// human, not sloppy. Emoji only mirrors the customer (max one, never leads).
// Language mirroring (owner direction, 2026-07-30): reply in the same
// language AND script the customer used, including romanized/transliterated
// languages (e.g. romanized Nepali/Hindi) — never translate into English or
// switch to native script, and never comment on the switch. This is a single
// STYLE_GUIDE line (not duplicated) so it also reaches src/lib/ai/reply-assist.ts's
// suggestReplies/rewriteDraft, which both import STYLE_GUIDE from here.
// Romanized-spelling fidelity (owner direction, 2026-07-30 — real failures
// testing on the owner's own account): a follow-up STYLE_GUIDE line makes
// the mirroring concrete — copy the customer's own romanization spellings
// instead of inventing new ones, treat punctuation-free romanized texting as
// still asking real questions, and never fake understanding of a genuinely
// unclear romanized phrase.
// Attachment awareness (owner direction, 2026-07-30 — Feature B): a third
// STYLE_GUIDE line covers photo/video/reel/etc. DMs — react to the image
// description when one is available (see attachmentToPromptContent below),
// and be honest (never a fixed canned line) when one isn't.
// This sits UNDER the org's saved Business Brain tone: tone still governs
// formality/personality, this just forces the delivery to read like a person,
// not a bot. The escalation contract and output JSON shape are untouched.
export const STYLE_GUIDE = [
  "How you write: short, casual, warm, like the shop owner texting back between customers, not a corporate support bot.",
  "Always reply in the same language AND script the customer used. This includes romanized/transliterated languages: if the customer writes Nepali, Hindi, or any language using English letters (e.g. \"k cha yaar, price kati ho?\"), reply in that same romanized style — natural, like a local friend texting — not in English and not in native script. Mixed language (code-switching) is normal — mirror the mix. Only use English when the customer does. Never announce or comment on the language or script you're replying in.",
  "When replying in a romanized language (Nepali, Hindi, etc. typed in English letters), copy the customer's own spellings exactly — learn their romanization from this conversation and reuse it (they write \"xau\", you write \"xau\", not \"xu\"; they use \"x\" for that sound, you use \"x\" too) instead of inventing your own. Romanized texting usually skips question marks, so read intent from context — \"khana khayeu\" is still a question with no \"?\". If a romanized word or phrase is genuinely unclear, don't guess or fake understanding — reply in a way that works either way, or casually ask what they meant, in their language and style.",
  "Match the customer's length and energy — a one-line question gets a one or two line answer, don't over-explain or pad it out.",
  'No em dashes, no semicolons, no bullet lists, and no stock phrases like "I\'d be happy to assist you" or "As an AI". Write plain sentences with commas, and always use contractions ("we\'re", "you\'ll", "that\'s").',
  'Text like a real person would: it\'s fine to start a sentence lowercase sometimes, use an exclamation point here and there (sparingly), and skip formal sign-offs. Casual words like "yep", "for sure", or "no worries" are welcome when they fit the shop\'s tone.',
  "Never add typos or bad grammar on purpose — keep it clean, just relaxed and human, not sloppy.",
  "Only use an emoji if the customer used one first in their message, and never more than one.",
  "If a customer's message is a photo, video, reel, or other attachment: when you're told what's in it, react to that naturally, like you actually saw it. When you're told you can't see/watch/hear it, be upfront and chill about that in your own words — vary the phrasing, match the account's tone (playful for a personal account, professional for a business) — instead of one fixed canned line, e.g. just ask what it's about. Never claim to have seen media you weren't shown a description of.",
  'Example of the voice — Q: "do you do birthday cakes?" A: "we do! $45 custom, just need 48h notice. want me to pencil you in for a Saturday pickup?"',
].join(" ")

// Smart escalation (Commander update, owner-approved plan, 2026-08-01):
// needsHuman used to fire on "not confident" — the AI was escalating out of
// mere uncertainty, which meant real conversations kept getting cut off
// instead of the AI just saying "not sure, but..." and continuing. This
// replaces that with a tight, named trigger set (explicit human request,
// sustained frustration, high-stakes/sensitive topics, or a request that's
// looped 3+ times) and makes uncertainty explicitly NOT a trigger. It also
// changes what `reply` means when needsHuman is true: previously the model
// could write almost anything since a human was about to take over; now the
// reply is what actually gets SENT to the customer (see the three channel
// routes), so it must be a real, warm, in-voice line that defers just that
// one topic — the AI keeps holding the rest of the conversation either way.
export const ESCALATION_GUIDE = [
  "Only set needsHuman true when one of these actually applies: the customer explicitly asks for a real person, or asks if you're a bot and wants a human; the customer shows sustained frustration or anger across two or more of their own messages, not just one sharp word; the topic is high-stakes or sensitive — a money dispute, a refund the business info above doesn't clearly cover, anything legal or medical, a request for someone's private information, or a commitment on the owner's behalf that the business info doesn't authorize (bookings the info above already covers are yours to handle); or the same unresolved request has now come up 3 or more times without landing.",
  "Not knowing something, or a question being unclear, is NEVER by itself a reason to set needsHuman — say so casually and/or ask one short clarifying question, and keep the conversation going.",
  'When you do set needsHuman true, `reply` must still be a real, warm, in-voice message to the customer that defers THAT topic to the owner personally — never blank, never system-sounding, and never worded the same way twice. Vary it naturally (for example: "let me flag this one for the owner, they\'ll pick it up themselves" or "that one\'s for the owner to weigh in on, I\'ll get them looped in") — you\'re handing off one topic, not walking away from the conversation.',
].join(" ")

/**
 * Extra prompt lines derived from `ai_always_on` (business_brain) and this
 * conversation's rolling memory (`ai_memory` — see
 * src/lib/ai/conversation-memory.ts). Shared by both buildSystemPrompt
 * branches below.
 */
function buildContextualLines(brain: BusinessBrain | null, conversation: Conversation, messages: Message[]): string[] {
  const lines: string[] = []

  if (brain?.ai_always_on) {
    lines.push(
      "Always-on mode is on for this business: never fully hand the conversation off — even when flagging a topic for the owner, keep engaging with everything else; the conversation is yours to hold."
    )
  }

  lines.push(...buildMemoryPromptLines(parseConversationMemory(conversation.ai_memory), messages))

  return lines
}

/** Builds a tight (~450 token) system prompt from the Business Brain — hours, services, prices, faq, tone — plus the texting-voice rules above. */
function buildSystemPrompt(brain: BusinessBrain | null, conversation: Conversation, messages: Message[]): string {
  const intro = brain
    ? `You are the front-desk assistant for ${brain.business_name ?? "a local business"}${
        brain.category ? `, a ${brain.category}` : ""
      }, answering customer messages (chat, SMS, DM, or email).`
    : "You are the front-desk assistant for a local small business, answering customer messages (chat, SMS, DM, or email)."

  const contextualLines = buildContextualLines(brain, conversation, messages)

  if (!brain) {
    return [
      intro,
      STYLE_GUIDE,
      ESCALATION_GUIDE,
      "Try to answer, qualify, or book the customer whenever you reasonably can.",
      ...contextualLines,
    ].join(" ")
  }

  const hoursLines = Object.entries(brain.hours ?? {})
    .map(([day, window]) => {
      if (!window) return null
      if (window.closed) return `${day}: closed`
      return `${day}: ${window.open}-${window.close}`
    })
    .filter((line): line is string => Boolean(line))

  const services = (brain.services ?? [])
    .slice(0, MAX_SERVICES_IN_PROMPT)
    .map((service: BusinessService) => (service.price ? `${service.name} (${service.price})` : service.name))
    .filter(Boolean)
    .join(", ")

  const faq = (brain.faq ?? [])
    .slice(0, MAX_FAQ_IN_PROMPT)
    .map((entry) => `Q: ${entry.question} A: ${entry.answer}`)
    .join(" | ")

  const description = brain.description?.trim().slice(0, MAX_DESCRIPTION_CHARS_IN_PROMPT)

  const lines = [
    intro,
    brain.tone ? `Brand voice: ${brain.tone}.` : null,
    STYLE_GUIDE,
    description ? `About the business: ${description}` : null,
    hoursLines.length > 0 ? `Hours: ${hoursLines.join(", ")}.` : null,
    services ? `Services/prices: ${services}.` : null,
    faq ? `FAQ: ${faq}` : null,
    "Answer as the business, in first person plural (\"we\"). Try to answer, qualify, or book the customer whenever the Business Brain above gives you enough to do so confidently.",
    ESCALATION_GUIDE,
    ...contextualLines,
  ].filter((line): line is string => Boolean(line))

  return lines.join(" ")
}

/**
 * Shape of `messages.metadata.attachment` as persisted by
 * src/app/api/webhooks/instagram/route.ts (see src/lib/social/instagram-attachments.ts
 * for the `type` values). `description` is only present once
 * src/lib/ai/describe-image.ts has successfully described an image
 * attachment — its absence means "not described" (vision skipped, failed, or
 * the attachment isn't an image), not "empty description."
 */
export interface StoredAttachmentMetadata {
  type?: string
  url?: string | null
  title?: string | null
  description?: string
}

/**
 * Turns a stored attachment's metadata into what the model should see
 * instead of a raw placeholder — an honest, in-voice stand-in for media the
 * model can't actually open, or the real description when vision succeeded
 * (image only; see describeImageAttachment's caps). Pure, exported for unit
 * tests. Paired with the attachment STYLE_GUIDE line above, which tells the
 * model how to react to each case.
 */
export function attachmentToPromptContent(attachment: StoredAttachmentMetadata): string {
  const description = attachment.description?.trim()

  switch (attachment.type) {
    case "image":
      return description ? `[sent a photo: ${description}]` : "[sent a photo you can't see]"
    case "reel":
      return "[sent a reel you can't watch]"
    case "video":
      return "[sent a video you can't watch]"
    case "audio":
      return "[sent a voice message you can't hear]"
    case "share":
      return "[sent a shared post you can't see]"
    case "story_mention":
      return "[sent a story mention you can't see]"
    default:
      return "[sent an attachment you can't see]"
  }
}

/** Every known "attachment-only" placeholder body (e.g. "[photo]") — used to tell apart a real customer-typed caption from the placeholder body an attachment-only message was stored with. */
const ATTACHMENT_PLACEHOLDER_BODIES = new Set<string>(Object.values(ATTACHMENT_PLACEHOLDER_BY_KIND))

/**
 * Resolves one stored message's content for the model: attachment context
 * (via attachmentToPromptContent) when the message carries
 * `metadata.attachment`, combined with any real customer-typed caption that
 * came alongside it (a caption's stored `body` is real text, never one of
 * the attachment placeholder strings — see ATTACHMENT_PLACEHOLDER_BODIES).
 * Falls back to the plain stored body for every ordinary text message. Pure,
 * exported for unit tests.
 */
export function messageToPromptContent(message: Pick<Message, "body" | "metadata">): string {
  const attachment = message.metadata?.attachment as StoredAttachmentMetadata | undefined
  if (!attachment || typeof attachment !== "object" || typeof attachment.type !== "string") {
    return message.body ?? ""
  }

  const attachmentPhrase = attachmentToPromptContent(attachment)
  const body = message.body?.trim()
  const isPlaceholderOnly = !body || ATTACHMENT_PLACEHOLDER_BODIES.has(body)

  return isPlaceholderOnly ? attachmentPhrase : `${body} ${attachmentPhrase}`
}

/** Maps the last N stored messages to chat turns (inbound = the customer, outbound = the business/AI). */
function formatHistory(messages: Message[]): ChatMessage[] {
  return messages
    .filter((message) => message.kind === "message" && message.body?.trim())
    .slice(-MAX_HISTORY_MESSAGES)
    .map((message) => ({
      role: message.direction === "inbound" ? "user" : "assistant",
      content: messageToPromptContent(message),
    }))
}

function buildInstructionMessage(contact: Contact | null, channel: Conversation["channel"]): ChatMessage {
  const contactLine = contact
    ? `Customer on file: ${contact.name ?? "unknown name"}${contact.phone ? `, phone ${contact.phone}` : ""}${
        contact.email ? `, email ${contact.email}` : ""
      }, pipeline status "${contact.status}".`
    : "No contact record on file yet for this customer."

  return {
    role: "user",
    content: [
      `Channel: ${channel}. ${contactLine}`,
      "Draft the next reply to the customer's most recent message above.",
      "Respond with ONLY strict JSON, no markdown code fences, no commentary before or after — exactly this shape:",
      '{"reply": string, "needsHuman": boolean, "reason": string (required if needsHuman is true, omit or empty string otherwise), "suggestedStatus": one of "lead"|"contacted"|"booked"|"customer" (omit if no change)}',
    ].join("\n"),
  }
}

interface ParsedReplyJson {
  reply: string
  needsHuman: boolean
  reason?: string
  suggestedStatus?: ContactStatus
}

/** Defensively extracts + validates the model's JSON reply. Returns null on any shape/length problem. */
function parseReplyJson(raw: string): ParsedReplyJson | null {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(match[0])
  } catch {
    return null
  }

  if (!parsed || typeof parsed !== "object") return null
  const obj = parsed as Record<string, unknown>

  const reply = typeof obj.reply === "string" ? obj.reply.trim() : ""
  const needsHuman = obj.needsHuman === true
  const reasonRaw = typeof obj.reason === "string" ? obj.reason.trim() : ""
  const suggestedStatusRaw = typeof obj.suggestedStatus === "string" ? obj.suggestedStatus : undefined

  if (!reply || reply.length > MAX_REPLY_LENGTH) return null
  // A needsHuman flag with no reason is a malformed response — a real
  // escalation must say why, per the AI-transparency rules (design brief).
  if (needsHuman && !reasonRaw) return null

  const suggestedStatus =
    suggestedStatusRaw && (VALID_CONTACT_STATUSES as string[]).includes(suggestedStatusRaw)
      ? (suggestedStatusRaw as ContactStatus)
      : undefined

  return {
    reply,
    needsHuman,
    reason: reasonRaw ? reasonRaw.slice(0, MAX_REASON_LENGTH) : undefined,
    suggestedStatus,
  }
}

/**
 * Drafts the next customer-facing reply for a conversation via the model
 * router's PII-safe "customer_reply" job (Claude Haiku 4.5 — see the module
 * header). Returns null when not configured, there's no inbound message yet
 * to reply to, or the model can't produce usable JSON after one retry — the
 * caller should fall back to a canned demo draft. Throws AllowanceDeniedError
 * when the org is out of `ai_replies` quota (see src/lib/ai/router.ts).
 */
export async function draftCustomerReply(input: DraftCustomerReplyInput): Promise<DraftedCustomerReply | null> {
  if (!isOpenRouterConfigured() || !isSupabaseConfigured()) return null

  const hasInboundMessage = input.messages.some((message) => message.direction === "inbound" && message.body?.trim())
  if (!hasInboundMessage) return null

  const baseMessages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(input.businessBrain, input.conversation, input.messages) },
    ...formatHistory(input.messages),
    buildInstructionMessage(input.contact, input.conversation.channel),
  ]

  const retryMessage: ChatMessage = {
    role: "user",
    content:
      "Your last reply was not valid JSON matching the requested shape. Respond again with ONLY the strict JSON object — nothing else.",
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const messages = attempt === 0 ? baseMessages : [...baseMessages, retryMessage]

    const result = await runTextJob({
      orgId: input.orgId,
      job: "customer_reply",
      messages,
      maxTokens: 400,
      temperature: 0.5,
    })

    const parsed = parseReplyJson(result.text)
    if (parsed) {
      return { ...parsed, model: result.model, costUsd: result.costUsd }
    }
  }

  return null
}
