import "server-only"

// Inbox AI-assist pair — Suggested Replies + Tone Rewriter (Phase 2 Unified
// Inbox, MASTER_PLAN.md §4.C). Owner-approved research (2026-07-29): these
// NEVER auto-send — they only fill the composer's textarea, exactly like
// draftCustomerReply's "AI draft" already does. A human always presses Send.
//
// Both jobs route through the shared model router's "customer_reply" job
// (Claude Haiku 4.5 first — see src/lib/ai/router.ts MODEL_CANDIDATES), the
// same PII-safe route draftCustomerReply uses, because both prompts embed
// real customer message content. Do NOT repoint either call at a free-tier
// model (MASTER_PLAN.md §5).
//
// Both functions return null when OpenRouter/Supabase aren't configured, the
// conversation can't be found/has nothing to work from, or the model fails
// outright — callers (src/app/(app)/inbox/actions.ts) fall back to a demo/
// empty result rather than surfacing a hard error for what is a convenience
// feature. AllowanceDeniedError (spend guard / quota) is NOT swallowed —
// it propagates through runTextJob so the caller can surface a real
// "out of quota" state, matching draftCustomerReply.

import { isSupabaseConfigured } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"
import { getConversation } from "@/lib/frontdesk"
import type { BusinessBrain, Contact, Conversation, Message } from "@/lib/types"

import { getBusinessBrain } from "@/app/(app)/settings/brain/actions"

import type { ChatMessage } from "./openrouter"
import { isOpenRouterConfigured } from "./openrouter"
import { STYLE_GUIDE } from "./frontdesk-reply"
import { runTextJob } from "./router"

const MAX_HISTORY_MESSAGES = 10
const MAX_VOICE_ANCHORS = 3
const MAX_SUGGESTIONS = 3
const MAX_SUGGESTION_LENGTH = 200
const MAX_SERVICES_IN_PROMPT = 6
const MAX_FAQ_IN_PROMPT = 6
const MAX_DESCRIPTION_CHARS_IN_PROMPT = 400
const MAX_REWRITE_TEXT_LENGTH = 1000
const MAX_REWRITTEN_OUTPUT_LENGTH = 2000

// ---------------------------------------------------------------------------
// Shared helpers (mirrors the equivalent private helpers in frontdesk-reply.ts —
// that file's buildSystemPrompt/formatHistory aren't exported, per the scope
// this feature was built under, so the Business Brain grounding + history
// formatting are intentionally duplicated here rather than reaching in).
// ---------------------------------------------------------------------------

/** A compact set of grounding lines from the Business Brain — name/tone/description/hours/services/faq — reused by both the suggestions and rewrite prompts. */
function summarizeBusinessBrainForPrompt(brain: BusinessBrain | null): string[] {
  if (!brain) return []

  const hoursLines = Object.entries(brain.hours ?? {})
    .map(([day, window]) => {
      if (!window) return null
      if (window.closed) return `${day}: closed`
      return `${day}: ${window.open}-${window.close}`
    })
    .filter((line): line is string => Boolean(line))

  const services = (brain.services ?? [])
    .slice(0, MAX_SERVICES_IN_PROMPT)
    .map((service) => (service.price ? `${service.name} (${service.price})` : service.name))
    .filter(Boolean)
    .join(", ")

  const faq = (brain.faq ?? [])
    .slice(0, MAX_FAQ_IN_PROMPT)
    .map((entry) => `Q: ${entry.question} A: ${entry.answer}`)
    .join(" | ")

  const description = brain.description?.trim().slice(0, MAX_DESCRIPTION_CHARS_IN_PROMPT)

  return [
    brain.business_name ? `Business: ${brain.business_name}${brain.category ? `, a ${brain.category}` : ""}.` : null,
    brain.tone ? `Brand voice: ${brain.tone}.` : null,
    description ? `About the business: ${description}` : null,
    hoursLines.length > 0 ? `Hours: ${hoursLines.join(", ")}.` : null,
    services ? `Services/prices: ${services}.` : null,
    faq ? `FAQ: ${faq}` : null,
  ].filter((line): line is string => Boolean(line))
}

/** Maps the last N stored messages to chat turns (inbound = the customer, outbound = the business/AI). Mirrors frontdesk-reply.ts's formatHistory. */
function formatHistory(messages: Message[]): ChatMessage[] {
  return messages
    .filter((message) => message.kind === "message" && message.body?.trim())
    .slice(-MAX_HISTORY_MESSAGES)
    .map((message) => ({
      role: message.direction === "inbound" ? "user" : "assistant",
      content: message.body ?? "",
    }))
}

function buildContactLine(contact: Contact | null): string {
  return contact
    ? `Customer on file: ${contact.name ?? "unknown name"}${contact.phone ? `, phone ${contact.phone}` : ""}${
        contact.email ? `, email ${contact.email}` : ""
      }, pipeline status "${contact.status}".`
    : "No contact record on file yet for this customer."
}

/**
 * The org's last few (owner-typed, non-AI) outbound messages across ALL
 * conversations — few-shot voice anchors so suggestions sound like this
 * specific business, not a generic assistant. Owner-approved research
 * (2026-07-29): this is the single highest-leverage lever against generic
 * AI phrasing. Returns [] (never throws) on any query error or when there's
 * no history yet — callers must treat this section as optional.
 */
async function fetchVoiceAnchors(orgId: string): Promise<string[]> {
  if (!isSupabaseConfigured()) return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("messages")
    .select("body")
    .eq("org_id", orgId)
    .eq("direction", "outbound")
    .eq("kind", "message")
    .eq("ai_handled", false)
    .order("created_at", { ascending: false })
    .limit(MAX_VOICE_ANCHORS)

  if (error || !data) return []

  return data
    .map((row) => (typeof row.body === "string" ? row.body.trim() : ""))
    .filter((body): body is string => body.length > 0)
}

// ---------------------------------------------------------------------------
// Feature 1 — Suggested replies (3 quick-tap options)
// ---------------------------------------------------------------------------

export interface SuggestRepliesInput {
  orgId: string
  conversationId: string
}

export interface SuggestedReplies {
  suggestions: string[]
  model: string
  costUsd: number
}

function buildSuggestionsSystemPrompt(brain: BusinessBrain | null, voiceAnchors: string[]): string {
  const intro = brain?.business_name
    ? `You are helping the front-desk team at ${brain.business_name}${
        brain.category ? `, a ${brain.category}` : ""
      } draft quick reply options for a customer message (chat, SMS, DM, or email).`
    : "You are helping the front-desk team at a local small business draft quick reply options for a customer message (chat, SMS, DM, or email)."

  const lines = [
    intro,
    STYLE_GUIDE,
    ...summarizeBusinessBrainForPrompt(brain),
    "Produce exactly 3 short alternative replies to the customer's most recent message: one that directly answers it, one that asks a clarifying question, and one that gives a warm redirect (for example offering to check and follow up, or pointing them to book or call). Each of the 3 must take a genuinely different approach, not just reworded versions of the same reply.",
    `Each reply must be ${MAX_SUGGESTION_LENGTH} characters or less.`,
  ]

  if (voiceAnchors.length > 0) {
    lines.push(
      `Here is how this business's owner actually writes when replying in their own voice — match this style closely: ${voiceAnchors
        .map((anchor) => `"${anchor}"`)
        .join(" / ")}`
    )
  }

  lines.push(
    'Respond with ONLY strict JSON, no markdown code fences, no commentary before or after — exactly this shape: {"suggestions": [string, string, string]}'
  )

  return lines.join(" ")
}

function buildSuggestInstructionMessage(contact: Contact | null, channel: Conversation["channel"]): ChatMessage {
  return {
    role: "user",
    content: [
      `Channel: ${channel}. ${buildContactLine(contact)}`,
      "Suggest 3 alternative replies to the customer's most recent message above, per the instructions in the system message.",
    ].join(" "),
  }
}

/** Defensively extracts + validates the model's suggestions JSON. Returns [] (never throws) on any shape/length problem, rather than failing the whole call. */
function parseSuggestionsJson(raw: string): string[] {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(match[0])
  } catch {
    return []
  }

  if (!parsed || typeof parsed !== "object") return []
  const rawSuggestions = (parsed as Record<string, unknown>).suggestions
  if (!Array.isArray(rawSuggestions)) return []

  const suggestions: string[] = []
  for (const item of rawSuggestions) {
    if (typeof item !== "string") continue
    const trimmed = item.trim()
    if (!trimmed || trimmed.length > MAX_SUGGESTION_LENGTH) continue
    suggestions.push(trimmed)
    if (suggestions.length >= MAX_SUGGESTIONS) break
  }

  return suggestions
}

/**
 * Suggests up to 3 quick-tap reply options for a conversation's most recent
 * customer message, via the "customer_reply" router job. Returns null when
 * not configured, the conversation can't be found, or there's no inbound
 * message yet to reply to. A parse failure on the model's response returns
 * an empty `suggestions` array (the call still happened and was metered)
 * rather than throwing. Throws AllowanceDeniedError when the org is out of
 * `ai_replies` quota.
 */
export async function suggestReplies(input: SuggestRepliesInput): Promise<SuggestedReplies | null> {
  if (!isOpenRouterConfigured() || !isSupabaseConfigured()) return null

  const conversation = await getConversation(input.orgId, input.conversationId)
  if (!conversation) return null

  const hasInboundMessage = conversation.messages.some(
    (message) => message.direction === "inbound" && message.body?.trim()
  )
  if (!hasInboundMessage) return null

  const [businessBrain, voiceAnchors] = await Promise.all([getBusinessBrain(), fetchVoiceAnchors(input.orgId)])

  const messages: ChatMessage[] = [
    { role: "system", content: buildSuggestionsSystemPrompt(businessBrain, voiceAnchors) },
    ...formatHistory(conversation.messages),
    buildSuggestInstructionMessage(conversation.contact, conversation.channel),
  ]

  const result = await runTextJob({
    orgId: input.orgId,
    job: "customer_reply",
    messages,
    maxTokens: 500,
    temperature: 0.7,
  })

  return { suggestions: parseSuggestionsJson(result.text), model: result.model, costUsd: result.costUsd }
}

// ---------------------------------------------------------------------------
// Feature 2 — Tone rewriter
// ---------------------------------------------------------------------------

export type RewriteMode = "friendlier" | "shorter" | "more_formal" | "translate_es"

export interface RewriteDraftInput {
  orgId: string
  text: string
  mode: RewriteMode
}

export interface RewrittenDraft {
  text: string
  model: string
  costUsd: number
}

const REWRITE_MODE_INSTRUCTIONS: Record<RewriteMode, string> = {
  friendlier: "Rewrite the draft below to sound warmer and friendlier, while keeping the same meaning and roughly the same length.",
  shorter: "Rewrite the draft below to be noticeably shorter and more to the point, while keeping the core meaning.",
  more_formal:
    "Rewrite the draft below to sound a bit more formal and professional, while staying natural — not stiff or corporate.",
  translate_es:
    "Translate the draft below into natural, conversational Spanish appropriate for texting a customer. Return ONLY the Spanish version, not the English original.",
}

function buildRewriteSystemPrompt(brain: BusinessBrain | null): string {
  const lines = [
    "You are helping rewrite a local small business's draft reply to a customer before it gets sent.",
    STYLE_GUIDE,
    brain?.tone ? `Brand voice: ${brain.tone}.` : null,
    'You will be given an instruction and a draft reply. Apply the instruction and respond with ONLY the rewritten reply text — no surrounding quotes, no labels like "Rewritten reply:", no explanation, no markdown.',
  ].filter((line): line is string => Boolean(line))

  return lines.join(" ")
}

function buildRewriteInstructionMessage(text: string, mode: RewriteMode): ChatMessage {
  return {
    role: "user",
    content: [REWRITE_MODE_INSTRUCTIONS[mode], "Draft reply to rewrite:", text].join("\n\n"),
  }
}

const REWRITE_LABEL_PATTERN =
  /^(here(?:'s| is)\s+(?:the\s+)?)?(rewritten\s+(?:reply|text|version|draft)|rewrite|reply|translation|spanish version|spanish)\s*:\s*/i

/** Strips wrapping quotes/code fences and a leading label the model sometimes adds despite the "ONLY the rewritten text" instruction. */
function cleanRewrittenText(raw: string): string {
  let text = raw.trim()

  if (text.startsWith("```")) {
    text = text
      .replace(/^```[a-zA-Z]*\n?/, "")
      .replace(/```$/, "")
      .trim()
  }

  if (text.length > 1) {
    if (text.startsWith('"') && text.endsWith('"')) text = text.slice(1, -1).trim()
    else if (text.startsWith("'") && text.endsWith("'")) text = text.slice(1, -1).trim()
  }

  text = text.replace(REWRITE_LABEL_PATTERN, "").trim()

  return text
}

/**
 * Rewrites a draft reply per `mode` (friendlier / shorter / more formal /
 * Spanish translation) via the "customer_reply" router job — the draft may
 * embed real customer message content, so this must stay on the PII-safe
 * route. Returns null when not configured, the input is empty/too long, or
 * the model's response is empty after cleaning. Throws AllowanceDeniedError
 * when the org is out of `ai_replies` quota.
 */
export async function rewriteDraft(input: RewriteDraftInput): Promise<RewrittenDraft | null> {
  if (!isOpenRouterConfigured() || !isSupabaseConfigured()) return null

  const trimmed = input.text.trim()
  if (!trimmed || trimmed.length > MAX_REWRITE_TEXT_LENGTH) return null

  const businessBrain = await getBusinessBrain()

  const messages: ChatMessage[] = [
    { role: "system", content: buildRewriteSystemPrompt(businessBrain) },
    buildRewriteInstructionMessage(trimmed, input.mode),
  ]

  const result = await runTextJob({
    orgId: input.orgId,
    job: "customer_reply",
    messages,
    maxTokens: 500,
    temperature: 0.5,
  })

  const cleaned = cleanRewrittenText(result.text).slice(0, MAX_REWRITTEN_OUTPUT_LENGTH)
  if (!cleaned) return null

  return { text: cleaned, model: result.model, costUsd: result.costUsd }
}
