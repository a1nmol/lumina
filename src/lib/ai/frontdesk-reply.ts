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
import { getAiRepliesUsageFraction } from "@/lib/usage"
import type {
  BusinessBrain,
  BusinessService,
  Contact,
  ContactStatus,
  Conversation,
  Message,
} from "@/lib/types"

import {
  buildMemoryPromptLines,
  formatPersonMemoryForPrompt,
  parseConversationMemory,
  parsePersonMemory,
  type PersonMemory,
} from "./conversation-memory"
import type { ChatMessage } from "./openrouter"
import { isOpenRouterConfigured } from "./openrouter"
import { runTextJob } from "./router"
import { fetchStyleExamples, renderStyleExamplesBlock } from "./style-examples"

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
  /**
   * Set to "close" when this reply was drafted as the graceful wind-down's
   * final sign-off (see windDownStage below — org is at/over the
   * WIND_DOWN_CLOSE_THRESHOLD of its `ai_replies` allowance). Callers
   * (the three channel routes) must tag the persisted outbound message's
   * metadata with `{ wind_down: "close" }` and set the conversation's
   * ai_state to "escalated" after sending — that tag is also what
   * draftCustomerReply itself checks next time to skip drafting silently
   * instead of repeating the sign-off on every subsequent inbound message.
   */
  windDown?: "close"
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
// Anti-repetition + real-knowledge rules (Commander update wave B2,
// owner-approved plan, 2026-08-01): four more STYLE_GUIDE lines — a banned
// assistant-speak list (paired with the per-reply "banned openers" block
// draftCustomerReply/draftWhisperMessage inject from the last few AI replies
// in THIS conversation, see extractBannedOpeners below), a curiosity cap so
// the AI stops ending every message with a question, a note that humor
// should mirror the other person rather than force a bit, and a "real
// knowledge" rule that pushes back on the AI over-escalating: being smart
// and actually answering things IS the job, only genuinely owner-only info
// gets deferred. Shared with reply-assist.ts's suggestReplies/rewriteDraft
// via the same STYLE_GUIDE import.
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
  "Calibrate how familiar you sound to how long you've actually known this person (see the relationship line below, when there is one): someone brand new gets charming but careful — warm, never overfamiliar, and never a callback to shared history you don't actually have. A returning regular gets warm, familiar energy — natural callbacks and references to running topics you genuinely remember. Never fake a memory or a shared history you weren't given.",
  'Never use stock assistant-speak: no "As an AI", "I hope this helps", "feel free to reach out", "Is there anything else", "I\'ll pass this along", or any other formulaic hedge. The "the owner will see this later" idea may come up at most once per conversation, and phrase it fresh each time — never the same sentence twice.',
  "Don't end every message with a question — ask at most one question every 2-3 exchanges. Plenty of replies should just land the answer and stop.",
  "Match the other person's sense of humor, don't force a bit or crack a joke that isn't already in the room.",
  "When someone asks something you genuinely know — a recommendation, a general fact, how something works — just answer it well and confidently. Being helpful and smart IS the job. Only defer what truly needs the owner: their personal plans/commitments, private info, or something the business info above doesn't cover.",
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
 * Relationship awareness (Commander update wave B1, owner-approved plan,
 * 2026-08-01): a cheap, no-model-call line derived from data already on
 * hand — contact.created_at (first seen) + contact.status, plus the
 * person-memory's own `relationship` line when one exists (it usually says
 * more, and more accurately, than a raw signup date + pipeline status ever
 * could). Paired with the STYLE_GUIDE "calibrate familiarity" rule above.
 * Returns null when there's no contact at all to ground this in.
 */
function buildRelationshipLine(contact: Contact | null, personMemory: PersonMemory | null): string | null {
  if (!contact) return null

  const firstSeen = new Date(contact.created_at)
  const since = Number.isNaN(firstSeen.getTime())
    ? null
    : firstSeen.toLocaleDateString("en-US", { month: "long", year: "numeric" })

  const parts = [
    since ? `you've known this person since ${since}` : null,
    `their pipeline status is "${contact.status}"`,
    personMemory?.relationship ? `how they relate to you: ${personMemory.relationship}` : null,
  ].filter((part): part is string => Boolean(part))

  if (parts.length === 0) return null
  return `Relationship: ${parts.join("; ")}.`
}

/**
 * Extra prompt lines derived from this conversation's rolling memory
 * (`ai_memory` — see src/lib/ai/conversation-memory.ts), the contact's
 * longer-lived person memory, and the relationship line above. Shared by both
 * buildSystemPrompt branches below. (The `ai_always_on` line used to live
 * here too — Commander update wave B2 moved it into buildIdentityBlock so it
 * sits with the rest of the persona, near the top of the prompt, instead of
 * the very end.)
 */
function buildContextualLines(
  conversation: Conversation,
  messages: Message[],
  contact: Contact | null
): string[] {
  const lines: string[] = []

  lines.push(...buildMemoryPromptLines(parseConversationMemory(conversation.ai_memory), messages))

  const personMemory = contact ? parsePersonMemory(contact.ai_memory) : null
  if (personMemory) {
    const block = formatPersonMemoryForPrompt(personMemory)
    if (block) lines.push(block)
  }

  const relationshipLine = buildRelationshipLine(contact, personMemory)
  if (relationshipLine) lines.push(relationshipLine)

  return lines
}

const MAX_BANNED_OPENERS = 5
const BANNED_OPENER_WORD_COUNT = 8

/**
 * Anti-repetition engine, part 1 (Commander update wave B2): the first ~8
 * words of each of the AI's last 5 outbound replies IN THIS CONVERSATION,
 * oldest of the five first — the literal "banned openers" list
 * buildBannedOpenersBlock below turns into a prompt instruction. Pure, no
 * I/O, exported for unit tests. Deliberately conversation-scoped (not
 * account-wide): the history passed in is already just this thread's
 * messages, and a brand-new conversation should never be constrained by
 * phrasing used with someone else.
 */
export function extractBannedOpeners(messages: Message[]): string[] {
  return messages
    .filter(
      (message): message is Message & { body: string } =>
        message.kind === "message" && message.direction === "outbound" && message.ai_handled && Boolean(message.body?.trim())
    )
    .slice(-MAX_BANNED_OPENERS)
    .map((message) => message.body.trim().split(/\s+/).slice(0, BANNED_OPENER_WORD_COUNT).join(" "))
}

/**
 * Anti-repetition engine, part 2: turns extractBannedOpeners' list into the
 * explicit ban instruction — the model already sees these same messages in
 * the chat history (formatHistory below), so this block's whole job is
 * naming the rule, not re-supplying content. Null when there's no AI reply
 * history yet to ban anything from.
 */
function buildBannedOpenersBlock(messages: Message[]): string | null {
  const openers = extractBannedOpeners(messages)
  if (openers.length === 0) return null

  return [
    "Your own recent messages in this conversation are shown in the history above.",
    "NEVER reuse their opening words, sign-offs, or distinctive phrasings — every reply must open differently and vary sentence structure and length.",
    `Banned openers — do not start your new reply with any of these: ${openers.map((opener) => `"${opener}…"`).join(" | ")}.`,
  ].join(" ")
}

/** Stages of the graceful, budget-aware wind-down (Commander update wave B2) — see getAiRepliesUsageFraction (src/lib/usage.ts) for the fraction this maps from. Pure, exported for unit tests. */
export type WindDownStage = "none" | "seed" | "heads_up" | "close"

const WIND_DOWN_SEED_THRESHOLD = 0.8
const WIND_DOWN_HEADS_UP_THRESHOLD = 0.9
const WIND_DOWN_CLOSE_THRESHOLD = 0.97

/**
 * Maps an org's `ai_replies` usage-to-limit fraction (null = unlimited/not
 * configured) to a wind-down stage. Pure: no I/O, no clock, safe to unit
 * test directly with plain numbers.
 */
export function windDownStage(fraction: number | null): WindDownStage {
  if (fraction === null) return "none"
  if (fraction >= WIND_DOWN_CLOSE_THRESHOLD) return "close"
  if (fraction >= WIND_DOWN_HEADS_UP_THRESHOLD) return "heads_up"
  if (fraction >= WIND_DOWN_SEED_THRESHOLD) return "seed"
  return "none"
}

/** The in-voice prompt directive for a given wind-down stage, or null for "none" (no directive needed). */
function windDownDirectiveForStage(stage: WindDownStage): string | null {
  switch (stage) {
    case "seed":
      return "You'll need to step away from this conversation soon. Somewhere natural in this reply, drop ONE brief, casual cue that you might have to hop off soon — no system-speak, no mention of budgets or limits."
    case "heads_up":
      return "Make it explicit and warm in this reply: let the customer know you're stepping away soon, that the owner will have the full context when they pick it up, and finish the current thought before you do."
    case "close":
      return "This reply is your warm sign-off for now: keep it short, stay in your voice, and confirm the owner has the full context and will pick this up personally."
    default:
      return null
  }
}

/**
 * Identity/persona block (Commander update wave B2): who the account is,
 * its brand voice, and the always-on commitment — the parts of the prompt
 * that establish WHO is talking, kept together and FIRST, ahead of every
 * operational detail (hours, services, FAQ, escalation rules). Persona
 * placement dominates adherence — a model told who it is before it's told
 * what to do stays in character far more reliably than the reverse.
 */
function buildIdentityBlock(brain: BusinessBrain | null): string {
  const intro = brain
    ? `You are the front-desk assistant for ${brain.business_name ?? "a local business"}${
        brain.category ? `, a ${brain.category}` : ""
      }, answering customer messages (chat, SMS, DM, or email).`
    : "You are the front-desk assistant for a local small business, answering customer messages (chat, SMS, DM, or email)."

  const alwaysOnLine = brain?.ai_always_on
    ? "Always-on mode is on for this business: never fully hand the conversation off — even when flagging a topic for the owner, keep engaging with everything else; the conversation is yours to hold."
    : null

  return [intro, brain?.tone ? `Brand voice: ${brain.tone}.` : null, alwaysOnLine].filter(Boolean).join(" ")
}

/**
 * Builds a tight system prompt from the Business Brain — hours, services,
 * prices, faq, tone — plus the texting-voice rules above. Ordered so
 * identity/persona (buildIdentityBlock) comes FIRST, then how-to-write
 * (STYLE_GUIDE), then operational business details, then escalation +
 * anti-repetition + wind-down + memory context (see buildIdentityBlock's own
 * comment for why persona-first matters). `windDownDirective` is computed by
 * the caller (draftCustomerReply) since it requires an async usage lookup
 * this function can't perform itself. `styleExamplesBlock` (Outlast wave 2
 * edit-learning, see ./style-examples.ts) is likewise computed by the caller
 * — draftCustomerReply fetches it, draftWhisperMessage doesn't (a whisper is
 * the owner's own words being composed, not a reply the AI is drafting
 * unattended, so it's not part of that scope) and simply omits it.
 */
function buildSystemPrompt(
  brain: BusinessBrain | null,
  conversation: Conversation,
  messages: Message[],
  contact: Contact | null,
  windDownDirective: string | null = null,
  styleExamplesBlock: string | null = null
): string {
  const identityBlock = buildIdentityBlock(brain)
  const bannedOpenersBlock = buildBannedOpenersBlock(messages)
  const contextualLines = buildContextualLines(conversation, messages, contact)

  if (!brain) {
    return [
      identityBlock,
      STYLE_GUIDE,
      styleExamplesBlock,
      ESCALATION_GUIDE,
      "Try to answer, qualify, or book the customer whenever you reasonably can.",
      bannedOpenersBlock,
      windDownDirective,
      ...contextualLines,
    ]
      .filter((line): line is string => Boolean(line))
      .join(" ")
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
    identityBlock,
    STYLE_GUIDE,
    styleExamplesBlock,
    description ? `About the business: ${description}` : null,
    hoursLines.length > 0 ? `Hours: ${hoursLines.join(", ")}.` : null,
    services ? `Services/prices: ${services}.` : null,
    faq ? `FAQ: ${faq}` : null,
    "Answer as the business, in first person plural (\"we\"). Try to answer, qualify, or book the customer whenever the Business Brain above gives you enough to do so confidently.",
    ESCALATION_GUIDE,
    bannedOpenersBlock,
    windDownDirective,
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
 * True when the most recent outbound AI-sent (kind "message", ai_handled)
 * message in this conversation already carries the wind-down "close" tag
 * (see DraftedCustomerReply.windDown's doc comment) — dedupes the sign-off so
 * it's said once per close, not repeated on every subsequent inbound message.
 * Whisper sends (metadata.whisper) are skipped when looking for the tag
 * (review fix): an owner whispering into an already-closed thread must not
 * reset the dedupe and trigger a second sign-off on the next inbound.
 */
function lastOutboundAiMessageIsWoundDown(messages: Message[]): boolean {
  const latestOutboundAi = [...messages]
    .reverse()
    .find(
      (message) =>
        message.kind === "message" &&
        message.direction === "outbound" &&
        message.ai_handled &&
        message.metadata?.whisper !== true
    )
  return latestOutboundAi?.metadata?.wind_down === "close"
}

/**
 * Drafts the next customer-facing reply for a conversation via the model
 * router's PII-safe "customer_reply" job (Claude Haiku 4.5 — see the module
 * header). Returns null when not configured, there's no inbound message yet
 * to reply to, the model can't produce usable JSON after one retry, or the
 * conversation has already sent its wind-down close sign-off and is still
 * over the close threshold (see below) — the caller should fall back to a
 * canned demo draft (or, for the wind-down case, simply send nothing; the
 * thread is already flagged). Throws AllowanceDeniedError when the org is
 * out of `ai_replies` quota (see src/lib/ai/router.ts).
 */
export async function draftCustomerReply(input: DraftCustomerReplyInput): Promise<DraftedCustomerReply | null> {
  if (!isOpenRouterConfigured() || !isSupabaseConfigured()) return null

  const hasInboundMessage = input.messages.some((message) => message.direction === "inbound" && message.body?.trim())
  if (!hasInboundMessage) return null

  // Graceful wind-down (Commander update wave B2) — the single shared seam:
  // computed once, right here, so every caller (all three channel routes
  // plus the inbox's manual "AI draft" button) gets it for free without each
  // one wiring its own ai_replies usage lookup. ai_always_on does NOT bypass
  // this — it's the graceful version of the hard spend-guard stop that
  // already exists in runTextJob, not a separate opt-in. Best-effort: a
  // failed usage lookup just means no wind-down cue this round, never blocks
  // drafting.
  // Both lookups are independent DB reads on the hot reply path — run them
  // in parallel (review fix), each with the same best-effort contract: a
  // failure just means no wind-down cue / no style guidance this round,
  // never blocked drafting.
  const [usageFractionResult, styleExamplesResult] = await Promise.allSettled([
    getAiRepliesUsageFraction(input.orgId),
    fetchStyleExamples(input.orgId),
  ])

  let stage: WindDownStage = "none"
  if (usageFractionResult.status === "fulfilled") {
    stage = windDownStage(usageFractionResult.value)
  } else {
    console.error("[frontdesk-reply] failed to compute wind-down stage", usageFractionResult.reason)
  }

  if (stage === "close" && lastOutboundAiMessageIsWoundDown(input.messages)) {
    return null
  }

  const windDownDirective = windDownDirectiveForStage(stage)

  // Edit-learning (Outlast wave 2) — same best-effort contract
  // (fetchStyleExamples itself already never throws, but this stays
  // defensive against a future change there).
  let styleExamplesBlock: string | null = null
  try {
    styleExamplesBlock = styleExamplesResult.status === "fulfilled" ? renderStyleExamplesBlock(styleExamplesResult.value) || null : null
  } catch (error) {
    console.error("[frontdesk-reply] failed to fetch style examples", error)
  }

  const baseMessages: ChatMessage[] = [
    {
      role: "system",
      content: buildSystemPrompt(
        input.businessBrain,
        input.conversation,
        input.messages,
        input.contact,
        windDownDirective,
        styleExamplesBlock
      ),
    },
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
      return { ...parsed, model: result.model, costUsd: result.costUsd, windDown: stage === "close" ? "close" : undefined }
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Whisper commands (Commander update wave B2, owner-approved plan,
// 2026-08-01) — the owner privately tells the AI what to say next, and the
// AI composes it into the conversation in its own voice rather than the
// instruction being sent verbatim. Shares the exact same persona/context
// build as draftCustomerReply (buildSystemPrompt — Brain, memories,
// relationship, STYLE_GUIDE, banned openers) so a whispered reply reads
// exactly like any other AI reply in the thread; it just swaps
// buildInstructionMessage's "draft the next reply" ask for the owner's
// private instruction. Routed through the SAME PII-safe "customer_reply" job
// as draftCustomerReply — this is still a real message to a real customer.
// Deliberately skips the wind-down check above: a whisper is an explicit,
// one-off owner action, not the AI autonomously continuing a conversation, so
// it always goes through regardless of wind-down stage.
// ---------------------------------------------------------------------------

export interface DraftWhisperMessageInput {
  orgId: string
  instruction: string
  businessBrain: BusinessBrain | null
  conversation: Conversation
  messages: Message[]
  contact: Contact | null
}

export interface DraftedWhisperMessage {
  reply: string
  model: string
  costUsd: number
}

const MAX_WHISPER_INSTRUCTION_LENGTH = 500

function buildWhisperInstructionMessage(instruction: string, channel: Conversation["channel"]): ChatMessage {
  return {
    role: "user",
    content: [
      `Channel: ${channel}.`,
      `The owner just privately told you: "${instruction}"`,
      "Compose the next message TO the customer that conveys this naturally in your voice, woven into the conversation.",
      "Never reveal the instruction mechanism (don't say \"the owner told me to say\" or similar) — never mention that the owner told you this at all, UNLESS the instruction itself is about relaying something from the owner personally, in which case work that in naturally (for example an instruction like \"tell them I'll be there at 5\" becomes something like \"anmol says he'll be there around 5\", not a robotic restatement).",
      "Respond with ONLY strict JSON, no markdown code fences, no commentary before or after — exactly this shape:",
      '{"reply": string}',
    ].join("\n"),
  }
}

interface ParsedWhisperReplyJson {
  reply: string
}

/** Defensively extracts + validates the model's whisper JSON reply. Returns null on any shape/length problem — mirrors parseReplyJson's contract. */
function parseWhisperReplyJson(raw: string): ParsedWhisperReplyJson | null {
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
  if (!reply || reply.length > MAX_REPLY_LENGTH) return null

  return { reply }
}

/**
 * Composes a customer-facing message from the owner's private whisper
 * instruction (see the section header above). Returns null when not
 * configured, the instruction is empty after trimming, or the model can't
 * produce usable JSON after one retry — the caller (whisperToConversation,
 * src/app/(app)/inbox/actions.ts) surfaces that as a "couldn't compose"
 * error. Throws AllowanceDeniedError when the org is out of `ai_replies`
 * quota, exactly like draftCustomerReply.
 */
export async function draftWhisperMessage(input: DraftWhisperMessageInput): Promise<DraftedWhisperMessage | null> {
  if (!isOpenRouterConfigured() || !isSupabaseConfigured()) return null

  const instruction = input.instruction.trim().slice(0, MAX_WHISPER_INSTRUCTION_LENGTH)
  if (!instruction) return null

  const baseMessages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(input.businessBrain, input.conversation, input.messages, input.contact) },
    ...formatHistory(input.messages),
    buildWhisperInstructionMessage(instruction, input.conversation.channel),
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
      maxTokens: 300,
      temperature: 0.6,
    })

    const parsed = parseWhisperReplyJson(result.text)
    if (parsed) {
      return { reply: parsed.reply, model: result.model, costUsd: result.costUsd }
    }
  }

  return null
}
