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
// Wave B1 (owner-approved plan, 2026-08-01; supabase/migrations/0016) adds a
// SECOND, longer-lived memory in the SAME model call: PersonMemory, stored on
// contacts.ai_memory. Where ConversationMemory is scoped to one thread,
// PersonMemory follows the PERSON across every conversation they've ever had
// with this business (who they are, how they relate to the business, running
// topics) — see the "Person-level memory" section below. Both memories are
// produced by one combined-JSON prompt (buildMemorySystemPrompt) so this
// costs exactly what the wave-A conversation-only refresh already cost.
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
  return `Memory of this person: ${parts.join("; ")}.`
}

// ---------------------------------------------------------------------------
// Person-level memory (Commander update wave B1, migration 0016
// contacts.ai_memory) — unlike ConversationMemory above (scoped to one
// conversation thread), this is a longer-lived memory of the PERSON that
// outlives any single conversation: who they are, how they relate to this
// account, and what topics keep coming up with them across every channel
// they've messaged on. Computed in the SAME model call as the conversation
// memory refresh (see buildMemorySystemPrompt/updateConversationMemory below)
// — no extra request, no extra cost. Consumed by frontdesk-reply.ts's
// buildSystemPrompt and reply-assist.ts's suggestReplies, exactly like
// ConversationMemory is.
// ---------------------------------------------------------------------------

export interface PersonMemory {
  /** Durable facts about WHO this person is that outlive a single conversation — name details, what they do, preferences, running life events. Never generic small talk. */
  facts: string[]
  /** One line on how this person relates to this business: new? a regular? a friend? a client? */
  relationship: string
  /** Running topics that come up with this person across time, not just in one thread. */
  topics: string[]
  updated_at: string
}

/**
 * Defensively parses a stored (or freshly model-produced) value into a
 * well-typed PersonMemory, or null when there's nothing usable — mirrors
 * parseConversationMemory's contract exactly (never throws, missing/
 * malformed fields fall back to safe empties, an entirely-empty result is
 * "no memory" rather than an empty shell).
 */
export function parsePersonMemory(json: unknown): PersonMemory | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null
  const obj = json as Record<string, unknown>

  const facts = Array.isArray(obj.facts)
    ? obj.facts.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : []
  const topics = Array.isArray(obj.topics)
    ? obj.topics.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : []
  const relationship = typeof obj.relationship === "string" ? obj.relationship.trim() : ""

  const updatedAtCandidate = typeof obj.updated_at === "string" ? obj.updated_at : null
  const updated_at =
    updatedAtCandidate && !Number.isNaN(new Date(updatedAtCandidate).getTime())
      ? updatedAtCandidate
      : new Date(0).toISOString()

  if (facts.length === 0 && topics.length === 0 && !relationship) return null

  return { facts, relationship, topics, updated_at }
}

const MAX_PERSON_FACTS = 10
const MAX_PERSON_FACT_LENGTH = 140
const MAX_PERSON_TOPICS = 5
const MAX_PERSON_TOPIC_LENGTH = 80
const MAX_PERSON_RELATIONSHIP_LENGTH = 200

/** Caps a freshly model-produced person memory down to storable sizes (facts ≤10/≤140 chars, topics ≤5/≤80 chars, relationship ≤200 chars) and stamps updated_at. Applied once, right before persisting — mirrors capConversationMemory. */
export function capPersonMemory(memory: PersonMemory, now: number = Date.now()): PersonMemory {
  return {
    facts: memory.facts.slice(0, MAX_PERSON_FACTS).map((fact) => fact.slice(0, MAX_PERSON_FACT_LENGTH)),
    relationship: memory.relationship.slice(0, MAX_PERSON_RELATIONSHIP_LENGTH),
    topics: memory.topics.slice(0, MAX_PERSON_TOPICS).map((topic) => topic.slice(0, MAX_PERSON_TOPIC_LENGTH)),
    updated_at: new Date(now).toISOString(),
  }
}

/** The compact prompt block injected into both frontdesk-reply.ts and reply-assist.ts, framed as remembered context about the PERSON (not this one thread). Empty string when the memory carries nothing renderable. */
export function formatPersonMemoryForPrompt(memory: PersonMemory): string {
  const parts = [
    memory.facts.length > 0 ? `facts: ${memory.facts.join("; ")}` : null,
    memory.relationship ? `relationship: ${memory.relationship}` : null,
    memory.topics.length > 0 ? `running topics: ${memory.topics.join("; ")}` : null,
  ].filter((part): part is string => Boolean(part))

  if (parts.length === 0) return ""
  return `Known about this person: ${parts.join("; ")}.`
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
// Bumped from 400 (Commander update wave B1): one model call now produces
// BOTH the conversation memory and the person memory in a single combined
// JSON response (see buildMemorySystemPrompt/parseCombinedMemoryResponse
// below) — same request, same cost, just a bigger response shape.
const MEMORY_MAX_TOKENS = 550
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

/**
 * Builds the ONE system prompt that asks the model for both memories in a
 * single response (Commander update wave B1 — no second LLM call): the
 * rolling per-thread ConversationMemory (unchanged fields/behavior) plus the
 * longer-lived per-person PersonMemory (migration 0016 contacts.ai_memory),
 * given whatever prior memories are on file for each.
 */
function buildMemorySystemPrompt(
  priorConversationMemory: ConversationMemory | null,
  priorPersonMemory: PersonMemory | null
): string {
  const lines = [
    "You maintain two linked memories for a local small business's FrontDesk AI, so a reply drafted later — in this thread or a brand new one — can pick up naturally: a rolling memory of THIS conversation, and a longer-lived memory of the PERSON that carries across every conversation they've ever had with this business.",
    "conversation.facts: short durable details about what's happening in THIS conversation specifically (an order, a date, a recurring ask) — never generic small talk.",
    "conversation.open_threads: anything asked or promised in this conversation that is still unresolved right now.",
    "conversation.vibe: one short line on their tone in this conversation.",
    "conversation.summary: 3-4 plain sentences telling the whole story of this conversation so far.",
    "person.facts: durable facts about WHO this person is that outlive this single conversation — name details, what they do, preferences, running life events (a kid's name, a recurring order, an upcoming event). Never generic small talk, and never something that's only true for this one conversation.",
    "person.relationship: one short line on how this person relates to this business overall — for example a brand new lead, a regular, a friend of the owner, or a longtime client.",
    "person.topics: running topics that come up with this person across time, not just in this one thread.",
  ]

  if (priorConversationMemory) {
    lines.push(
      `Update this prior CONVERSATION memory, don't just discard it — fold the new messages below into it. Prior facts: ${
        priorConversationMemory.facts.join("; ") || "none yet"
      }. Prior open_threads: ${priorConversationMemory.open_threads.join("; ") || "none"}. Prior vibe: ${
        priorConversationMemory.vibe || "unknown"
      }. Prior summary: ${priorConversationMemory.summary || "none yet"}.`
    )
  }

  if (priorPersonMemory) {
    lines.push(
      `Update this prior PERSON memory the same way — fold in anything new, keep what's still true, drop what's been superseded. Prior facts: ${
        priorPersonMemory.facts.join("; ") || "none yet"
      }. Prior relationship: ${priorPersonMemory.relationship || "unknown"}. Prior topics: ${
        priorPersonMemory.topics.join("; ") || "none yet"
      }.`
    )
  }

  lines.push(
    'Respond with ONLY strict JSON, no markdown code fences, no commentary before or after — exactly this shape: {"conversation": {"facts": string[], "open_threads": string[], "vibe": string, "summary": string}, "person": {"facts": string[], "relationship": string, "topics": string[]}}'
  )

  return lines.join(" ")
}

export interface CombinedMemoryParseResult {
  conversation: ConversationMemory | null
  person: PersonMemory | null
}

/**
 * Finds + parses the model's combined `{conversation, person}` JSON response
 * defensively — never throws. Also accepts (and logs a warning for) the
 * OLDER flat `{facts, open_threads, vibe, summary}` shape from before this
 * combined prompt existed, treating it as conversation-only with no person
 * data recoverable from it, so a stray/cached response in that shape still
 * degrades gracefully instead of losing the whole update. Pure, exported for
 * unit tests.
 */
export function parseCombinedMemoryResponse(raw: string): CombinedMemoryParseResult {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return { conversation: null, person: null }

  let parsed: unknown
  try {
    parsed = JSON.parse(match[0])
  } catch {
    return { conversation: null, person: null }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { conversation: null, person: null }
  const obj = parsed as Record<string, unknown>

  const isNestedObject = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === "object" && !Array.isArray(value)

  if (isNestedObject(obj.conversation) || isNestedObject(obj.person)) {
    return {
      conversation: parseConversationMemory(obj.conversation ?? null),
      person: parsePersonMemory(obj.person ?? null),
    }
  }

  console.warn(
    "[conversation-memory] model returned the old flat memory shape (no conversation/person nesting) — falling back to conversation-only, no person memory recovered"
  )
  return { conversation: parseConversationMemory(obj), person: null }
}

export interface UpdateConversationMemoryInput {
  orgId: string
  conversationId: string
}

/**
 * Refreshes a conversation's rolling memory AND (Commander update wave B1)
 * the contact's longer-lived person memory, in one combined model call:
 * loads the prior conversation memory + prior person memory + full message
 * history, asks the "conversation_memory" router job to fold whatever's new
 * since the prior memory's message_count into an updated {conversation,
 * person} pair, caps each, and persists conversation -> conversations.ai_memory
 * (unchanged) and person -> contacts.ai_memory (new — skipped silently when
 * this conversation has no contact_id, and left untouched when the model's
 * response carries no usable person data at all). Fire-and-forget by design —
 * every caller does `void updateConversationMemory(...).catch(log)` and must
 * never await this on a customer-facing reply path. Never throws; every
 * failure (not configured, quota denied, model failure, bad JSON, a write
 * error) is logged and swallowed, since memory is a convenience layer, never
 * a blocker.
 */
export async function updateConversationMemory(input: UpdateConversationMemoryInput): Promise<void> {
  if (!isOpenRouterConfigured() || !isSupabaseConfigured()) return

  const admin = createAdminClient()

  const [{ data: conversationRow, error: conversationError }, { data: messageRows, error: messagesError }] =
    await Promise.all([
      admin
        .from("conversations")
        .select("ai_memory, contact_id")
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

  const priorConversationMemory = parseConversationMemory(conversationRow?.ai_memory ?? null)

  // Double-fire guard (review): two rapid inbound messages can both pass the
  // trigger-site shouldUpdateMemory check against stale state. Re-checking
  // here against the freshly-read memory means the loser of that race
  // returns before paying for a model call.
  if (!shouldUpdateMemory(priorConversationMemory, messages.length)) return

  const newMessages = (priorConversationMemory ? messages.slice(priorConversationMemory.message_count) : messages).slice(
    -MAX_MESSAGES_PER_MEMORY_UPDATE
  )
  if (newMessages.length === 0) return

  const contactId = conversationRow?.contact_id ?? null

  // Best-effort — a failure loading the contact's prior person memory must
  // never block the conversation-memory refresh; it just means this round
  // proceeds as if there were no prior person memory on file.
  let priorPersonMemory: PersonMemory | null = null
  if (contactId) {
    const { data: contactRow, error: contactError } = await admin
      .from("contacts")
      .select("ai_memory")
      .eq("id", contactId)
      .eq("org_id", input.orgId)
      .maybeSingle()

    if (contactError) {
      console.error("[conversation-memory] failed to load contact for person memory", contactError.message)
    } else {
      priorPersonMemory = parsePersonMemory(contactRow?.ai_memory ?? null)
    }
  }

  let result: Awaited<ReturnType<typeof runTextJob>>
  try {
    result = await runTextJob({
      orgId: input.orgId,
      job: "conversation_memory",
      messages: [
        { role: "system", content: buildMemorySystemPrompt(priorConversationMemory, priorPersonMemory) },
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

  const parsedMemory = parseCombinedMemoryResponse(result.text)
  if (!parsedMemory.conversation) {
    console.error("[conversation-memory] model returned unparseable memory JSON, skipping update")
    return
  }

  const cappedConversation = capConversationMemory(parsedMemory.conversation, messages.length)

  const { error: updateError } = await admin
    .from("conversations")
    // ConversationMemory has no index signature, so it isn't structurally
    // assignable to the jsonb column's Record<string, unknown> — it IS a
    // plain, JSON-serializable object, so this cast is safe.
    .update({ ai_memory: cappedConversation as unknown as Record<string, unknown> })
    .eq("id", input.conversationId)
    .eq("org_id", input.orgId)

  if (updateError) {
    console.error("[conversation-memory] failed to persist ai_memory", updateError.message)
  }

  if (contactId && parsedMemory.person) {
    const cappedPerson = capPersonMemory(parsedMemory.person)

    const { error: contactUpdateError } = await admin
      .from("contacts")
      .update({ ai_memory: cappedPerson as unknown as Record<string, unknown> })
      .eq("id", contactId)
      .eq("org_id", input.orgId)

    if (contactUpdateError) {
      console.error("[conversation-memory] failed to persist contact ai_memory", contactUpdateError.message)
    }
  }
}
