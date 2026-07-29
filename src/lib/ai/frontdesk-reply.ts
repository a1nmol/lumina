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

import { isSupabaseConfigured } from "@/lib/supabase/config"
import type {
  BusinessBrain,
  BusinessService,
  Contact,
  ContactStatus,
  Conversation,
  Message,
} from "@/lib/types"

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
// This sits UNDER the org's saved Business Brain tone: tone still governs
// formality/personality, this just forces the delivery to read like a person,
// not a bot. The escalation contract and output JSON shape are untouched.
export const STYLE_GUIDE = [
  "How you write: short, casual, warm, like the shop owner texting back between customers, not a corporate support bot.",
  "Match the customer's length and energy — a one-line question gets a one or two line answer, don't over-explain or pad it out.",
  'No em dashes, no semicolons, no bullet lists, and no stock phrases like "I\'d be happy to assist you" or "As an AI". Write plain sentences with commas, and always use contractions ("we\'re", "you\'ll", "that\'s").',
  'Text like a real person would: it\'s fine to start a sentence lowercase sometimes, use an exclamation point here and there (sparingly), and skip formal sign-offs. Casual words like "yep", "for sure", or "no worries" are welcome when they fit the shop\'s tone.',
  "Never add typos or bad grammar on purpose — keep it clean, just relaxed and human, not sloppy.",
  "Only use an emoji if the customer used one first in their message, and never more than one.",
  'Example of the voice — Q: "do you do birthday cakes?" A: "we do! $45 custom, just need 48h notice. want me to pencil you in for a Saturday pickup?"',
].join(" ")

/** Builds a tight (~450 token) system prompt from the Business Brain — hours, services, prices, faq, tone — plus the texting-voice rules above. */
function buildSystemPrompt(brain: BusinessBrain | null): string {
  const intro = brain
    ? `You are the front-desk assistant for ${brain.business_name ?? "a local business"}${
        brain.category ? `, a ${brain.category}` : ""
      }, answering customer messages (chat, SMS, DM, or email).`
    : "You are the front-desk assistant for a local small business, answering customer messages (chat, SMS, DM, or email)."

  if (!brain) {
    return [
      intro,
      STYLE_GUIDE,
      "Try to answer, qualify, or book the customer whenever you reasonably can.",
      'If you are not confident you can answer correctly, or the request needs a human (unknown pricing/policy, a complaint, anything sensitive or urgent), set needsHuman true and say why.',
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
    "If you are NOT confident you can answer correctly — pricing/policy not covered above, a complaint, anything sensitive or urgent — set needsHuman true and explain why in one short phrase.",
  ].filter((line): line is string => Boolean(line))

  return lines.join(" ")
}

/** Maps the last N stored messages to chat turns (inbound = the customer, outbound = the business/AI). */
function formatHistory(messages: Message[]): ChatMessage[] {
  return messages
    .filter((message) => message.kind === "message" && message.body?.trim())
    .slice(-MAX_HISTORY_MESSAGES)
    .map((message) => ({
      role: message.direction === "inbound" ? "user" : "assistant",
      content: message.body ?? "",
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
    { role: "system", content: buildSystemPrompt(input.businessBrain) },
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
