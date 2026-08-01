import "server-only"

// Rolling conversation memory — the Commander update's "the AI remembers this
// person" seam (owner-approved plan, 2026-08-01; supabase/migrations/0015).
// A conversation's `ai_memory` column carries a compact, model-maintained
// summary of everything said so far, refreshed every few messages (see
// shouldUpdateMemory below) — including while the AI is silent (ai_mode
// 'off', or mid-escalation) so a resumed conversation never starts from
// scratch. Consumed by src/lib/ai/frontdesk-reply.ts and
// src/lib/ai/reply-assist.ts (prompt injection) and rendered, read-only, by
// the Inbox thread view.
//
// Routes through the shared model router's "conversation_memory" job
// (src/lib/ai/router.ts) — cheap PAID candidates only, never a free tier:
// the messages it summarizes are real customer content (MASTER_PLAN.md §5's
// PII rule), the same reason customer_reply/vision_describe are pinned off
// free tiers.
//
// The pure helpers below (parse/should-update/cap/format) have zero I/O and
// are unit tested directly. updateConversationMemory is the only function
// here that touches Supabase/OpenRouter — every channel route calls it
// fire-and-forget (`void updateConversationMemory(...).catch(...)`) and must
// never await it on the reply path.

import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin"
import type { Message } from "@/lib/types"

import { INTRO_SESSION_GAP_MS } from "./intro"
import type { ChatMessage } from "./openrouter"
import { isOpenRouterConfigured } from "./openrouter"
import { runTextJob } from "./router"

export interface ConversationMemory {
  /** Short durable details about this specific person or what they want — never generic small talk. */
  facts: string[]
  /** Anything asked or promised that's still unresolved. */
  open_threads: string[]
  /** One short line on their tone and the relationship so far. */
  vibe: string
  /** 3-4 plain sentences telling the whole story of the conversation so far. */
  summary: string
  updated_at: string
  /** How many (kind: "message") rows existed in this conversation when this memory was generated — the offset shouldUpdateMemory/updateConversationMemory use to find "what's new since last time." */
  message_count: number
}

// ---------------------------------------------------------------------------
// Pure helpers — no I/O, safe to unit test directly.
// ---------------------------------------------------------------------------

/**
 * Defensively parses a stored (or freshly model-produced) memory value into
 * a well-typed ConversationMemory, or null when there's nothing usable at
 * all — never throws. Missing/malformed individual fields fall back to safe
 * empties rather than failing the whole parse, since a partially-good memory
 * is still better than none; a value with NOTHING usable (no facts, no
 * open_threads, no vibe, no summary) is treated as "no memory" so callers
 * don't render/inject an empty shell.
 */
export function parseConversationMemory(json: unknown): ConversationMemory | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null
  const obj = json as Record<string, unknown>

  const facts = Array.isArray(obj.facts)
    ? obj.facts.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : []
  const open_threads = Array.isArray(obj.open_threads)
    ? obj.open_threads.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : []
  const vibe = typeof obj.vibe === "string" ? obj.vibe.trim() : ""
  const summary = typeof obj.summary === "string" ? obj.summary.trim() : ""

  const updatedAtCandidate = typeof obj.updated_at === "string" ? obj.updated_at : null
  const updated_at =
    updatedAtCandidate && !Number.isNaN(new Date(updatedAtCandidate).getTime())
      ? updatedAtCandidate
      : new Date(0).toISOString()

  const message_count =
    typeof obj.message_count === "number" && Number.isFinite(obj.message_count) && obj.message_count >= 0
      ? Math.floor(obj.message_count)
      : 0

  if (facts.length === 0 && open_threads.length === 0 && !vibe && !summary) return null

  return { facts, open_threads, vibe, summary, updated_at, message_count }
}

const MEMORY_FIRST_UPDATE_THRESHOLD = 6
const MEMORY_UPDATE_INTERVAL = 7

/**
 * True when it's time to refresh a conversation's memory: no memory yet and
 * the thread has reached 6 (kind: "message") messages, or at least 7 more
 * messages have landed since the memory currently on file was generated.
 */
export function shouldUpdateMemory(memory: ConversationMemory | null, totalMessageCount: number): boolean {
  if (!memory) return totalMessageCount >= MEMORY_FIRST_UPDATE_THRESHOLD
  return totalMessageCount - memory.message_count >= MEMORY_UPDATE_INTERVAL
}

const MAX_FACTS = 8
const MAX_FACT_LENGTH = 120
const MAX_OPEN_THREADS = 8
const MAX_OPEN_THREAD_LENGTH = 120
const MAX_VIBE_LENGTH = 160
const MAX_SUMMARY_LENGTH = 600

/**
 * Caps a freshly model-produced memory down to storable sizes (facts ≤ 8
 * items/≤120 chars each, summary ≤ 600 chars, plus the same defensive caps on
 * open_threads/vibe) and stamps updated_at/message_count. Applied once, right
 * before persisting — memory already on file was capped at write time, so
 * parseConversationMemory doesn't re-cap on every read.
 */
export function capConversationMemory(
  memory: ConversationMemory,
  messageCount: number,
  now: number = Date.now()
): ConversationMemory {
  return {
    facts: memory.facts.slice(0, MAX_FACTS).map((fact) => fact.slice(0, MAX_FACT_LENGTH)),
    open_threads: memory.open_threads.slice(0, MAX_OPEN_THREADS).map((thread) => thread.slice(0, MAX_OPEN_THREAD_LENGTH)),
    vibe: memory.vibe.slice(0, MAX_VIBE_LENGTH),
    summary: memory.summary.slice(0, MAX_SUMMARY_LENGTH),
    updated_at: new Date(now).toISOString(),
    message_count: messageCount,
  }
}

/** The compact prompt block injected into both frontdesk-reply.ts and reply-assist.ts. Empty string when the memory carries nothing renderable. */
export function formatMemoryForPrompt(memory: ConversationMemory): string {
  const parts = [
    memory.facts.length > 0 ? `facts: ${memory.facts.join("; ")}` : null,
    memory.open_threads.length > 0 ? `unresolved: ${memory.open_threads.join("; ")}` : null,
    memory.vibe ? `vibe: ${memory.vibe}` : null,
    memory.summary ? `story so far: ${memory.summary}` : null,
  ].filter((part): part is string => Boolean(part))

  if (parts.length === 0) return ""
  return `What you remember from earlier with this person: ${parts.join("; ")}.`
}

/** The most recent AI-sent outbound message's timestamp (ms), or null when there isn't one. Mirrors src/lib/ai/intro.ts's own gap-detection logic, kept separate since this is a distinct "re-engage" concern, not the intro's "disclose once" concern. */
export function lastOutboundAiTimestamp(
  messages: Array<Pick<Message, "direction" | "ai_handled" | "created_at">>
): number | null {
  let latest: number | null = null
  for (const message of messages) {
    if (message.direction !== "outbound" || !message.ai_handled) continue
    const timestamp = new Date(message.created_at).getTime()
    if (Number.isNaN(timestamp)) continue
    if (latest === null || timestamp > latest) latest = timestamp
  }
  return latest
}

const REENGAGE_LINE =
  'It\'s been a while since you last replied here — re-engage naturally, like someone who\'s been present the whole time: reference what you remember when it\'s relevant, and never apologize for being away or say you "were away".'

/**
 * The 0-2 memory-related lines to append to a prompt: the "what you
 * remember" block (when memory exists) plus the re-engage line (only when
 * memory exists AND the most recent AI-sent message is older than the same
 * 2-hour freshness window intro.ts already uses). Shared by
 * frontdesk-reply.ts's buildSystemPrompt and reply-assist.ts's suggestions
 * prompt so the two never drift.
 */
export function buildMemoryPromptLines(
  memory: ConversationMemory | null,
  messages: Array<Pick<Message, "direction" | "ai_handled" | "created_at">>,
  now: number = Date.now()
): string[] {
  if (!memory) return []

  const lines: string[] = []
  const block = formatMemoryForPrompt(memory)
  if (block) lines.push(block)

  const lastAi = lastOutboundAiTimestamp(messages)
  if (lastAi !== null && now - lastAi > INTRO_SESSION_GAP_MS) {
    lines.push(REENGAGE_LINE)
  }

  return lines
}

// ---------------------------------------------------------------------------
// I/O — the only function in this module that touches Supabase/OpenRouter.
// ---------------------------------------------------------------------------

/** Defensive cap so an irregular trigger (backfill, manual call) can never balloon the prompt — normal operation stays well under this (shouldUpdateMemory fires every 6-7 messages). */
const MAX_MESSAGES_PER_MEMORY_UPDATE = 60
const MEMORY_MAX_TOKENS = 400
const MEMORY_TEMPERATURE = 0.3

function messageBodyForMemoryPrompt(message: Message): string {
  const body = message.body?.trim()
  if (body) return body
  const attachment = message.metadata?.attachment as { type?: unknown } | undefined
  const kind = attachment && typeof attachment.type === "string" ? attachment.type : null
  return kind ? `[sent a ${kind}]` : "[empty message]"
}

/** Maps stored messages to chat turns for the memory prompt. Deliberately simpler than frontdesk-reply.ts's messageToPromptContent (no vision-description lookup) to avoid importing that server-only module here — memory only needs enough context to summarize, not full attachment fidelity. */
function formatMessagesForMemoryPrompt(messages: Message[]): ChatMessage[] {
  return messages.map((message) => ({
    role: message.direction === "inbound" ? "user" : "assistant",
    content: messageBodyForMemoryPrompt(message),
  }))
}

function buildMemorySystemPrompt(priorMemory: ConversationMemory | null): string {
  const lines = [
    "You maintain a compact rolling memory of an ongoing customer conversation for a local small business's FrontDesk AI, so a reply drafted later can pick up right where things left off.",
    "facts: short durable details about this specific person or what they want (a name, a preference, an order, a date, a recurring ask) — never generic small talk.",
    "open_threads: anything asked or promised that is still unresolved right now.",
    "vibe: one short line on their tone and the relationship so far.",
    "summary: 3-4 plain sentences telling the whole story of this conversation so far.",
  ]

  if (priorMemory) {
    lines.push(
      `Update this prior memory, don't just discard it — fold the new messages below into it. Prior facts: ${
        priorMemory.facts.join("; ") || "none yet"
      }. Prior open_threads: ${priorMemory.open_threads.join("; ") || "none"}. Prior vibe: ${
        priorMemory.vibe || "unknown"
      }. Prior summary: ${priorMemory.summary || "none yet"}.`
    )
  }

  lines.push(
    'Respond with ONLY strict JSON, no markdown code fences, no commentary before or after — exactly this shape: {"facts": string[], "open_threads": string[], "vibe": string, "summary": string}'
  )

  return lines.join(" ")
}

/** Finds + parses the model's JSON memory response defensively. Returns null (caller logs + skips) on any shape/parse failure. */
function parseModelMemoryResponse(raw: string): ConversationMemory | null {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(match[0])
  } catch {
    return null
  }

  return parseConversationMemory(parsed)
}

export interface UpdateConversationMemoryInput {
  orgId: string
  conversationId: string
}

/**
 * Refreshes a conversation's rolling memory: loads the prior memory + full
 * message history, asks the "conversation_memory" router job to fold
 * whatever's new since the prior memory's message_count into an updated
 * summary, caps it, and persists it. Fire-and-forget by design — every
 * caller does `void updateConversationMemory(...).catch(log)` and must never
 * await this on a customer-facing reply path. Never throws; every failure
 * (not configured, quota denied, model failure, bad JSON, a write error) is
 * logged and swallowed, since memory is a convenience layer, never a
 * blocker.
 */
export async function updateConversationMemory(input: UpdateConversationMemoryInput): Promise<void> {
  if (!isOpenRouterConfigured() || !isSupabaseConfigured()) return

  const admin = createAdminClient()

  const [{ data: conversationRow, error: conversationError }, { data: messageRows, error: messagesError }] =
    await Promise.all([
      admin
        .from("conversations")
        .select("ai_memory")
        .eq("id", input.conversationId)
        .eq("org_id", input.orgId)
        .maybeSingle(),
      admin
        .from("messages")
        .select()
        .eq("org_id", input.orgId)
        .eq("conversation_id", input.conversationId)
        .order("created_at", { ascending: true }),
    ])

  if (conversationError) {
    console.error("[conversation-memory] failed to load conversation", conversationError.message)
    return
  }
  if (messagesError) {
    console.error("[conversation-memory] failed to load messages", messagesError.message)
    return
  }

  const messages = ((messageRows ?? []) as Message[]).filter((message) => message.kind === "message")
  if (messages.length === 0) return

  const priorMemory = parseConversationMemory(conversationRow?.ai_memory ?? null)

  // Double-fire guard (review): two rapid inbound messages can both pass the
  // trigger-site shouldUpdateMemory check against stale state. Re-checking
  // here against the freshly-read memory means the loser of that race
  // returns before paying for a model call.
  if (!shouldUpdateMemory(priorMemory, messages.length)) return

  const newMessages = (priorMemory ? messages.slice(priorMemory.message_count) : messages).slice(
    -MAX_MESSAGES_PER_MEMORY_UPDATE
  )
  if (newMessages.length === 0) return

  let result: Awaited<ReturnType<typeof runTextJob>>
  try {
    result = await runTextJob({
      orgId: input.orgId,
      job: "conversation_memory",
      messages: [
        { role: "system", content: buildMemorySystemPrompt(priorMemory) },
        ...formatMessagesForMemoryPrompt(newMessages),
        {
          role: "user",
          content: "Produce the updated memory now, per the instructions above — ONLY the strict JSON object.",
        },
      ],
      maxTokens: MEMORY_MAX_TOKENS,
      temperature: MEMORY_TEMPERATURE,
    })
  } catch (error) {
    // AllowanceDeniedError (spend guard) or any router/model failure — never
    // worth surfacing past a log line for a background convenience feature.
    console.error("[conversation-memory] runTextJob failed", error)
    return
  }

  const parsedMemory = parseModelMemoryResponse(result.text)
  if (!parsedMemory) {
    console.error("[conversation-memory] model returned unparseable memory JSON, skipping update")
    return
  }

  const capped = capConversationMemory(parsedMemory, messages.length)

  const { error: updateError } = await admin
    .from("conversations")
    // ConversationMemory has no index signature, so it isn't structurally
    // assignable to the jsonb column's Record<string, unknown> — it IS a
    // plain, JSON-serializable object, so this cast is safe.
    .update({ ai_memory: capped as unknown as Record<string, unknown> })
    .eq("id", input.conversationId)
    .eq("org_id", input.orgId)

  if (updateError) {
    console.error("[conversation-memory] failed to persist ai_memory", updateError.message)
  }
}
