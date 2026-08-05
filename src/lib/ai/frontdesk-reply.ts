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

import { ATTACHMENT_PLACEHOLDER_BY_KIND, STORY_REPLY_PLACEHOLDER_BODY } from "@/lib/social/instagram-attachments"
import { fetchActiveStandingOrders, renderStandingOrdersBlock } from "@/lib/standing-orders"
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
import { getWalletRemainingUsd, walletWindDownStage } from "./wallet-status"

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
  "Write short, casual, warm — the shop owner texting back between customers, not a support bot.",
  "Reply in the customer's exact language AND script, including romanized languages (e.g. \"k cha yaar, price kati ho?\" -> same romanized style back). Mirror code-switching. Never translate, switch script, or comment on the language.",
  "In romanized replies, copy the customer's own spellings (they write \"xau\", you write \"xau\", not \"xu\"). Romanized texting often skips \"?\" — read intent from context (\"khana khayeu\" is still a question). If a phrase is genuinely unclear, don't guess or fake understanding — reply so it works either way, or casually ask what they meant, in their style.",
  "Match the customer's length and energy. When in doubt, ONE short sentence — two only when the answer genuinely needs it (multiple prices, multiple steps). Never pad, never restate their question back to them. Still warm, not curt — short doesn't mean cold.",
  'No em dashes, semicolons, bullet lists, or stock assistant-speak ("I\'d be happy to assist you", "As an AI", "I hope this helps", "feel free to reach out", "Is there anything else", "I\'ll pass this along"). Plain sentences with commas, always contractions. The "owner will see this" idea: at most once per conversation, worded fresh each time.',
  'Text like a real person: lowercase starts are fine, the odd exclamation point (sparingly), no formal sign-offs, casual words like "yep"/"for sure"/"no worries" when they fit — but no deliberate typos or bad grammar, stay clean, relaxed and human, never sloppy.',
  "Emoji only if the customer used one first, and never more than one.",
  "For a photo/video/reel/etc: react naturally when you're told what's in it. When you can't see/hear it, say so honestly in your own varied words (never one fixed line), matching the account's tone. Never claim to have seen media you weren't described.",
  "Calibrate familiarity to how long you've known them (see the relationship line below): brand new = warm but careful, no invented history. Regular = warm, familiar, real callbacks to what you actually remember. Never fake shared history.",
  "Don't end every message with a question — at most one every 2-3 exchanges. Plenty of replies should just land the answer.",
  "Match the other person's sense of humor, don't force a bit.",
  "When you genuinely know the answer, just answer it confidently — that IS the job. Only defer the owner's personal commitments, private info, or what the business info above doesn't cover.",
  'Voice example — Q: "do you do birthday cakes?" A: "we do! $45 custom, just need 48h notice. want me to pencil you in for a Saturday pickup?"',
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
  "Set needsHuman true only when: the customer explicitly asks for a real person (or asks if you're a bot and wants one); they show sustained frustration across 2+ of their own messages, not one sharp word; it's high-stakes/sensitive (money dispute, a refund not clearly covered above, legal/medical, someone's private info, a commitment the business info doesn't authorize — routine bookings above are yours to handle); or the same unresolved request has come up 3+ times.",
  "Not knowing something, or an unclear question, is NEVER by itself a reason for needsHuman — say so casually and/or ask one short clarifying question, and keep going.",
  'When needsHuman is true, `reply` must still be a real, warm, in-voice message that defers THAT topic to the owner — never blank or system-sounding, never worded the same way twice (e.g. "let me flag this one for the owner" or "that one\'s for the owner, I\'ll get them looped in") — you\'re handing off one topic, not the conversation.',
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
    "NEVER reuse your own recent opening words, sign-offs, or phrasings (shown in the history above) — vary structure and length every reply.",
    `Banned openers — don't start with any of: ${openers.map((opener) => `"${opener}…"`).join(" | ")}.`,
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

const WIND_DOWN_SEVERITY_ORDER: Record<WindDownStage, number> = { none: 0, seed: 1, heads_up: 2, close: 3 }

/**
 * Combines the org-fraction wind-down stage with the account WALLET's own
 * wind-down stage (src/lib/ai/wallet-status.ts's walletWindDownStage — same
 * "none"|"seed"|"heads_up"|"close" shape, kept as an independent type there
 * so that module has zero dependency on this one) and returns whichever is
 * MORE URGENT (none < seed < heads_up < close). The live outage this fixed:
 * an org can be nowhere near its own monthly allowance while the platform's
 * shared OpenRouter wallet is seconds from $0 — the org-fraction ladder alone
 * had no way to see that coming, so replies died instantly with a 402 instead
 * of winding down gracefully. Pure, exported for unit tests.
 */
export function maxWindDownStage(orgStage: WindDownStage, walletStage: WindDownStage): WindDownStage {
  return WIND_DOWN_SEVERITY_ORDER[walletStage] > WIND_DOWN_SEVERITY_ORDER[orgStage] ? walletStage : orgStage
}

/**
 * The in-voice prompt directive for a given wind-down stage, or null for
 * "none" (no directive needed). Owner direction (2026-08-02, post-outage):
 * the cue must land in the CUSTOMER'S OWN REGISTER — their language (romanized
 * scripts included), their slang, their energy, matching exactly how this
 * conversation already talks — never a fixed English template the model
 * translates on top of. Still zero system-speak, zero mention of budgets/
 * credits/limits, and phrased fresh every time, never the same line twice.
 * Exported (Outlast cost-trim wave) so scripts/prompt-size.report.test.ts can
 * build a real "close"-stage prompt for its size guard instead of duplicating
 * this copy.
 */
export function windDownDirectiveForStage(stage: WindDownStage): string | null {
  switch (stage) {
    case "seed":
      return "You'll need to step away from this conversation soon. Somewhere natural in this reply, drop ONE brief, casual cue that you might have to hop off soon — say it the way THIS customer talks (their language/script, slang, energy), not a translated template. No system-speak, no mention of budgets, credits, or limits, and don't reuse a phrasing you've already used in this thread."
    case "heads_up":
      return "Make it explicit and warm in this reply: let the customer know you're stepping away soon and the owner will pick this up with full context — still entirely in the customer's own language/script, slang, and energy, worded fresh in your own voice (never a stock line), and finish the current thought before you sign off. No system-speak, no budgets/credits/limits."
    case "close":
      return "This reply is your warm sign-off for now: keep it short, stay fully in the customer's own language/script, slang, and energy, and confirm the owner has the full context and will pick this up personally. Vary the phrasing — never repeat the same sign-off you've used before. No system-speak, no budgets/credits/limits."
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
    ? `You're the front-desk assistant for ${brain.business_name ?? "a local business"}${
        brain.category ? `, a ${brain.category}` : ""
      }, replying via chat, SMS, DM, or email.`
    : "You're the front-desk assistant for a local small business, replying via chat, SMS, DM, or email."

  const alwaysOnLine = brain?.ai_always_on
    ? "Always-on: never fully hand off the conversation — even when flagging one topic for the owner, keep engaging with everything else."
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
 * `standingOrdersBlock` (Outlast wave 3, see ../standing-orders.ts) sits
 * right after the identity block, ahead of STYLE_GUIDE — owner directives
 * outrank style rules. Every drafting caller fetches it (draftCustomerReply,
 * draftWhisperMessage, draftFollowUpMessage below) — a standing order still
 * applies when the owner whispers something unrelated, or when the AI is
 * nudging a quiet thread. Exported (Outlast cost-trim wave) so
 * scripts/prompt-size.report.test.ts can build a real, fully-populated
 * prompt as a permanent size-regression guard rather than hand-duplicating
 * this assembly logic.
 */
export function buildSystemPrompt(
  brain: BusinessBrain | null,
  conversation: Conversation,
  messages: Message[],
  contact: Contact | null,
  windDownDirective: string | null = null,
  styleExamplesBlock: string | null = null,
  standingOrdersBlock: string | null = null
): string {
  const identityBlock = buildIdentityBlock(brain)
  const bannedOpenersBlock = buildBannedOpenersBlock(messages)
  const contextualLines = buildContextualLines(conversation, messages, contact)

  if (!brain) {
    return [
      identityBlock,
      standingOrdersBlock,
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
    standingOrdersBlock,
    STYLE_GUIDE,
    styleExamplesBlock,
    description ? `About the business: ${description}` : null,
    hoursLines.length > 0 ? `Hours: ${hoursLines.join(", ")}.` : null,
    services ? `Services/prices: ${services}.` : null,
    faq ? `FAQ: ${faq}` : null,
    "Answer as the business (\"we\"). Answer, qualify, or book the customer whenever the info above gives you enough to do so confidently.",
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
 * for the `type` values — plus the Senses-Wave-only pseudo-type
 * "story_reply", which isn't part of that module's attachments[] union
 * since it comes from `message.reply_to.story` instead). `description`
 * (image/share cover-image vision), `caption` (reel/share sender-written
 * caption), `transcript` (Deepgram voice-note transcription),
 * `media_kind` (story_mention/story_reply content-sniff result — see
 * src/lib/social/instagram-story-media.ts), and `has_link_sticker`
 * (story_reply only) are each only present once the corresponding
 * best-effort enrichment succeeds — absence means "not enriched" (skipped,
 * failed, or not applicable to this kind), not "empty."
 */
export interface StoredAttachmentMetadata {
  type?: string
  url?: string | null
  title?: string | null
  description?: string
  caption?: string
  transcript?: string
  media_kind?: "image" | "video" | "unknown"
  has_link_sticker?: boolean
}

const LINK_STICKER_NOTE = " (their story has a link sticker)"

/**
 * Turns a stored attachment's metadata into what the model should see
 * instead of a raw placeholder — an honest, in-voice stand-in for media the
 * model can't actually open, or the real description/caption/transcript when
 * an enrichment succeeded (see StoredAttachmentMetadata's doc comment for
 * which kinds get which field). Pure, exported for unit tests. Paired with
 * the attachment STYLE_GUIDE line above, which tells the model how to react
 * to each case.
 */
export function attachmentToPromptContent(attachment: StoredAttachmentMetadata): string {
  const description = attachment.description?.trim()
  const caption = attachment.caption?.trim()
  const transcript = attachment.transcript?.trim()
  const linkStickerNote = attachment.has_link_sticker ? LINK_STICKER_NOTE : ""

  switch (attachment.type) {
    case "image":
      return description ? `[sent a photo: ${description}]` : "[sent a photo you can't see]"
    case "reel":
      return caption ? `[sent a reel captioned: "${caption}"]` : "[sent a reel you can't watch]"
    case "video":
      return "[sent a video you can't watch]"
    case "audio":
      return transcript ? `[sent a voice message saying: "${transcript}"]` : "[sent a voice message you can't hear]"
    case "share":
      if (description) {
        return caption ? `[shared a post: "${caption}" — image shows ${description}]` : `[shared a post — image shows ${description}]`
      }
      return caption ? `[shared a post captioned: "${caption}"]` : "[shared a post you can't see]"
    case "story_mention":
      if (attachment.media_kind === "image" && description) {
        return `[mentioned you in their story — image shows ${description}]${linkStickerNote}`
      }
      if (attachment.media_kind === "video") {
        return `[mentioned you in their story (video)]${linkStickerNote}`
      }
      return `[mentioned you in their story you can't see]${linkStickerNote}`
    case "story_reply":
      if (attachment.media_kind === "image" && description) {
        return `[replied to your story — image shows ${description}]${linkStickerNote}`
      }
      if (attachment.media_kind === "video") {
        return `[replied to your story (video)]${linkStickerNote}`
      }
      return `[replied to your story you can't see]${linkStickerNote}`
    default:
      return "[sent an attachment you can't see]"
  }
}

/** Every known "attachment-only" placeholder body (e.g. "[photo]") — used to tell apart a real customer-typed caption from the placeholder body an attachment-only message was stored with. */
const ATTACHMENT_PLACEHOLDER_BODIES = new Set<string>([
  ...Object.values(ATTACHMENT_PLACEHOLDER_BY_KIND),
  STORY_REPLY_PLACEHOLDER_BODY,
])

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

  // Graceful wind-down (Commander update wave B2, extended by the wallet-
  // aware hotfix below) — the single shared seam: computed once, right here,
  // so every caller (all three channel routes plus the inbox's manual "AI
  // draft" button) gets it for free without each one wiring its own lookups.
  // ai_always_on does NOT bypass this — it's the graceful version of the
  // hard spend-guard stop that already exists in runTextJob, not a separate
  // opt-in. Best-effort: a failed lookup just means no wind-down cue this
  // round, never blocks drafting.
  // These lookups are independent I/O on the hot reply path — run them in
  // parallel (review fix), each with the same best-effort contract: a
  // failure just means no wind-down cue / no style guidance / no standing
  // orders this round, never blocked drafting. getWalletRemainingUsd (Outlast
  // wave — 2026-08-02 outage hotfix) joins this same batch: it's cached
  // (10-minute TTL, see wallet-status.ts), so this costs ~zero extra latency
  // on every call after the first per warm lambda instance.
  const [usageFractionResult, styleExamplesResult, standingOrdersResult, walletRemainingResult] = await Promise.allSettled([
    getAiRepliesUsageFraction(input.orgId),
    fetchStyleExamples(input.orgId),
    fetchActiveStandingOrders(input.orgId),
    getWalletRemainingUsd(),
  ])

  let orgStage: WindDownStage = "none"
  if (usageFractionResult.status === "fulfilled") {
    orgStage = windDownStage(usageFractionResult.value)
  } else {
    console.error("[frontdesk-reply] failed to compute wind-down stage", usageFractionResult.reason)
  }

  // Wallet-aware wind-down (Outlast hotfix, 2026-08-02 outage) — the org can
  // be nowhere near its own monthly allowance while the platform's shared
  // OpenRouter wallet is seconds from $0; walletWindDownStage is the ladder
  // that catches that. Same best-effort contract: a failed/unconfigured
  // lookup (null) just means "none" here, never blocks drafting.
  let walletStage: WindDownStage = "none"
  if (walletRemainingResult.status === "fulfilled") {
    walletStage = walletWindDownStage(walletRemainingResult.value)
  } else {
    console.error("[frontdesk-reply] failed to compute wallet wind-down stage", walletRemainingResult.reason)
  }

  const stage = maxWindDownStage(orgStage, walletStage)

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

  // Standing orders (Outlast wave 3) — same best-effort contract.
  let standingOrdersBlock: string | null = null
  try {
    standingOrdersBlock =
      standingOrdersResult.status === "fulfilled" ? renderStandingOrdersBlock(standingOrdersResult.value) || null : null
  } catch (error) {
    console.error("[frontdesk-reply] failed to fetch standing orders", error)
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
        styleExamplesBlock,
        standingOrdersBlock
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
      // Brevity/cost pass (owner directive, 2026-08-03): a texting reply
      // never needs more than this — was 400.
      maxTokens: 240,
      temperature: 0.5,
    })

    const parsed = parseReplyJson(result.text)
    if (parsed) {
      return { ...parsed, model: result.model, costUsd: result.costUsd, windDown: stage === "close" ? "close" : undefined }
    }
  }

  return null
}

/**
 * Best-effort standing-orders fetch + render, shared by draftWhisperMessage
 * and draftFollowUpMessage below — the callers that fetch it as a single
 * plain await rather than draftCustomerReply's parallel Promise.allSettled
 * (which already runs alongside a usage-fraction lookup on the hot reply
 * path). Never throws; a failure just means no standing-orders cue this
 * round, matching every other best-effort fetch in this file.
 */
async function fetchStandingOrdersBlockBestEffort(orgId: string): Promise<string | null> {
  try {
    const orders = await fetchActiveStandingOrders(orgId)
    return renderStandingOrdersBlock(orders) || null
  } catch (error) {
    console.error("[frontdesk-reply] failed to fetch standing orders", error)
    return null
  }
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

  // Standing orders (Outlast wave 3) — a standing order still applies when
  // the owner whispers something unrelated. Best-effort: same contract as
  // draftCustomerReply's own fetch.
  const standingOrdersBlock = await fetchStandingOrdersBlockBestEffort(input.orgId)

  const baseMessages: ChatMessage[] = [
    {
      role: "system",
      content: buildSystemPrompt(
        input.businessBrain,
        input.conversation,
        input.messages,
        input.contact,
        null,
        null,
        standingOrdersBlock
      ),
    },
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
      // Brevity/cost pass (owner directive, 2026-08-03) — was 300.
      maxTokens: 240,
      temperature: 0.6,
    })

    const parsed = parseWhisperReplyJson(result.text)
    if (parsed) {
      return { reply: parsed.reply, model: result.model, costUsd: result.costUsd }
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Proactive follow-ups (Outlast wave 3, Part B) — a short, draft-first nudge
// for a conversation that's gone quiet after the business answered (see
// src/lib/follow-ups.ts for the candidate-selection logic; this is only the
// drafting half). Shares the exact same persona/context build as
// draftCustomerReply and draftWhisperMessage (buildSystemPrompt — Brain,
// memories, relationship, standing orders, STYLE_GUIDE, banned openers), so
// the nudge reads like any other message in the thread. Routed through the
// SAME PII-safe "customer_reply" job — real customer content either way.
// Reuses parseWhisperReplyJson (identical `{"reply": string}` output shape).
// ---------------------------------------------------------------------------

export interface DraftFollowUpMessageInput {
  orgId: string
  businessBrain: BusinessBrain | null
  conversation: Conversation
  messages: Message[]
  contact: Contact | null
}

export interface DraftedFollowUpMessage {
  reply: string
  model: string
  costUsd: number
}

function buildFollowUpInstructionMessage(contact: Contact | null, channel: Conversation["channel"]): ChatMessage {
  const contactLine = contact
    ? `Customer on file: ${contact.name ?? "unknown name"}${contact.phone ? `, phone ${contact.phone}` : ""}${
        contact.email ? `, email ${contact.email}` : ""
      }, pipeline status "${contact.status}".`
    : "No contact record on file yet for this customer."

  return {
    role: "user",
    content: [
      `Channel: ${channel}. ${contactLine}`,
      "It's been a few days of silence. Write ONE short, casual, zero-pressure check-in that picks up the most promising open thread — reference it naturally (\"did you end up deciding about X?\"). Never guilt-trip, never salesy pressure, never mention being an AI reminder.",
      "Respond with ONLY strict JSON, no markdown code fences, no commentary before or after — exactly this shape:",
      '{"reply": string}',
    ].join("\n"),
  }
}

/**
 * Drafts a short proactive follow-up nudge for a conversation the business
 * answered and the customer went quiet on, via the "customer_reply" router
 * job. Returns null when not configured or the model can't produce usable
 * JSON after one retry — the caller (src/lib/follow-ups.ts) simply skips
 * that candidate rather than failing the whole scan. Throws
 * AllowanceDeniedError when the org is out of `ai_replies` quota, exactly
 * like draftCustomerReply — callers should let that abort the run for that
 * org (the same allowance that gates real replies gates these nudges).
 */
export async function draftFollowUpMessage(input: DraftFollowUpMessageInput): Promise<DraftedFollowUpMessage | null> {
  if (!isOpenRouterConfigured() || !isSupabaseConfigured()) return null

  const standingOrdersBlock = await fetchStandingOrdersBlockBestEffort(input.orgId)

  const baseMessages: ChatMessage[] = [
    {
      role: "system",
      content: buildSystemPrompt(
        input.businessBrain,
        input.conversation,
        input.messages,
        input.contact,
        null,
        null,
        standingOrdersBlock
      ),
    },
    ...formatHistory(input.messages),
    buildFollowUpInstructionMessage(input.contact, input.conversation.channel),
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
      maxTokens: 200,
      temperature: 0.7,
    })

    const parsed = parseWhisperReplyJson(result.text)
    if (parsed) {
      return { reply: parsed.reply, model: result.model, costUsd: result.costUsd }
    }
  }

  return null
}
