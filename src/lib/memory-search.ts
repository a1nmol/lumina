import "server-only"

// Natural-language memory search (Outlast wave 5, Part A) — "who asked about
// haircut prices last month?" answered over this org's own inbox history: a
// cheap keyword prefilter (no model call) narrows the whole org down to a
// handful of candidate conversations, then ONE "memory_search" router job
// (src/lib/ai/router.ts — cheap PAID candidates only, mirrors
// conversation_memory's chain exactly) turns those candidates into a short,
// plain-English answer. Called from an authed server action (see
// src/app/(app)/inbox/actions.ts#searchInbox), NOT a webhook — uses the
// RLS-scoped client, same convention as src/lib/frontdesk.ts.
//
// The keyword prefilter always runs and always returns something (or []) —
// the model pass is additive: when it's unavailable, fails, or produces
// nothing usable, callers still have real, ranked keyword results to show.
// PII rule (MASTER_PLAN.md §5): the candidate context handed to the model is
// built from real customer message bodies + conversation memories, so this
// job is pinned off free tiers, exactly like conversation_memory and
// customer_reply.

import { parseConversationMemory } from "@/lib/ai/conversation-memory"
import type { ChatMessage } from "@/lib/ai/openrouter"
import { isOpenRouterConfigured } from "@/lib/ai/openrouter"
import { runTextJob } from "@/lib/ai/router"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"
import type { ConversationChannel } from "@/lib/types"

// ---------------------------------------------------------------------------
// Term extraction — pure, no I/O. Deliberately does NOT stem (romanized
// languages like romanized Nepali/Hindi have no reliable English stemmer and
// stemming would mangle them) — see STYLE_GUIDE's language-mirroring rules
// elsewhere in this codebase for why romanized fidelity matters here too.
// ---------------------------------------------------------------------------

// A tiny, deliberately conservative English stopword list — just common
// function words that add noise to an ILIKE prefilter, not a linguistics
// project. Left untouched: short romanized-language function words (many
// overlap with real content words in other languages) so this stays
// romanized-friendly, per spec.
const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "am", "be", "been", "being",
  "of", "in", "on", "at", "to", "for", "with", "about", "against", "between",
  "into", "through", "during", "before", "after", "above", "below", "from",
  "up", "down", "out", "off", "over", "under", "again", "further", "then", "once",
  "and", "or", "but", "if", "because", "as", "until", "while", "this", "that",
  "these", "those", "i", "me", "my", "we", "our", "you", "your", "he", "she", "it",
  "its", "they", "them", "their", "who", "what", "which", "when", "where", "why",
  "how", "all", "any", "both", "each", "few", "more", "most", "other", "some",
  "such", "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very",
  "can", "will", "just", "should", "now", "did", "does", "do", "has", "have",
  "had", "having", "did", "does",
])

/**
 * Lowercases and splits a search query into keyword terms (stopwords and
 * single-character tokens dropped, deduped, order-preserving), then appends
 * the raw trimmed/lowercased query itself as a final term — so a multi-word
 * phrase match is still attempted even when every individual word is common.
 * Pure, exported for unit tests. Returns [] for an empty/whitespace-only
 * query.
 */
export function extractSearchTerms(query: string): string[] {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return []

  const words = trimmed
    .split(/[^\p{L}\p{N}']+/u)
    .map((word) => word.trim())
    .filter((word) => word.length > 1 && !STOPWORDS.has(word))

  const terms = Array.from(new Set(words))
  if (!terms.includes(trimmed)) terms.push(trimmed)
  return terms
}

/**
 * Escapes ILIKE wildcards (`%`, `_`) and the `.or()` filter-string separator
 * (`,`) in a search term before it's interpolated into a filter — mirrors
 * src/lib/frontdesk.ts's escapeIlikeTerm exactly (same proven convention,
 * kept local here since that one isn't exported). Backslash-escaping (not
 * stripping) preserves the term's literal characters instead of silently
 * mangling them. Pure, exported for unit tests.
 */
export function sanitizeIlikeTerm(term: string): string {
  // Parens included (review fix): PostgREST's .or() grammar treats unescaped
  // ( ) as structural, so a term like "(closed)" could break the filter.
  return term.trim().replace(/[%_,()]/g, (match) => `\\${match}`)
}

/**
 * Merges several ranked lists of conversation ids (earlier lists rank
 * higher — see searchCandidates' message/name/memory priority order),
 * dedupes, and caps at `limit`, preserving first-seen order. Pure, exported
 * for unit tests — the actual matching/ranking (message body hit > contact
 * name hit > memory-text hit) lives in searchCandidates, this is just the
 * merge/dedupe/cap mechanics.
 */
export function dedupeAndCapConversationIds(rankedIdLists: string[][], limit: number): string[] {
  if (limit <= 0) return []

  const orderedIds: string[] = []
  const seen = new Set<string>()

  for (const list of rankedIdLists) {
    for (const id of list) {
      if (seen.has(id)) continue
      seen.add(id)
      orderedIds.push(id)
      if (orderedIds.length >= limit) return orderedIds
    }
  }

  return orderedIds
}

// ---------------------------------------------------------------------------
// Candidate search — keyword prefilter, no model call.
// ---------------------------------------------------------------------------

export interface MemorySearchSnippet {
  body: string
  createdAt: string
}

export interface MemorySearchCandidate {
  conversationId: string
  contactId: string | null
  contactName: string | null
  channel: ConversationChannel
  /** From the conversation's rolling ai_memory, when present. */
  memorySummary: string | null
  memoryFacts: string[]
  /** Up to MAX_SNIPPETS_PER_CANDIDATE matching message bodies, newest first, each truncated. */
  snippets: MemorySearchSnippet[]
}

const MESSAGE_PREFILTER_LIMIT = 40
// Conversations with a non-null ai_memory, fetched recent-first, then
// filtered in JS for term matches (see the module header — the PostgREST
// cast-filter syntax for `ai_memory::text.ilike.*` is unverified against a
// live project in this environment, so this takes the spec's offered
// fallback rather than shipping unverified filter syntax). Fine at pilot
// scale; revisit with a real cast filter (or a text-search index) once an
// org's memory-bearing conversation count grows past a few hundred.
const RECENT_MEMORY_CONVERSATIONS_LIMIT = 150
const MAX_CONTACT_NAME_MATCHES = 20
const MAX_CANDIDATES = 25
const MAX_SNIPPETS_PER_CANDIDATE = 3
const SNIPPET_MAX_LENGTH = 120

function truncateSnippet(body: string): string {
  const trimmed = body.trim()
  return trimmed.length > SNIPPET_MAX_LENGTH ? `${trimmed.slice(0, SNIPPET_MAX_LENGTH - 1)}…` : trimmed
}

function buildOrIlikeFilter(column: string, terms: string[]): string {
  return terms.map((term) => `${column}.ilike.%${term}%`).join(",")
}

/**
 * Keyword prefilter over this org's inbox: (a) messages whose body matches
 * any term, (b) contacts whose name matches any term (pulling in their most
 * recent conversation), (c) conversations whose stored ai_memory JSON
 * mentions any term (fetched recent-first, filtered in JS — see the
 * RECENT_MEMORY_CONVERSATIONS_LIMIT comment). Deduped by conversation, capped
 * at `limit`, ranked with direct message hits first (the strongest signal),
 * then name hits, then memory-only hits. Never throws — any single query
 * failure is logged and that source simply contributes nothing, since the
 * other two sources may still produce usable candidates.
 */
export async function searchCandidates(
  orgId: string,
  terms: string[],
  limit: number = MAX_CANDIDATES
): Promise<MemorySearchCandidate[]> {
  if (!isSupabaseConfigured() || terms.length === 0) return []

  const sanitizedTerms = Array.from(new Set(terms.map(sanitizeIlikeTerm).filter((term) => term.length > 0)))
  if (sanitizedTerms.length === 0) return []

  const supabase = await createClient()

  // (a) Direct message-body matches — the strongest signal.
  const messageRows: Array<{ conversation_id: string; body: string | null; created_at: string }> = []
  try {
    const { data, error } = await supabase
      .from("messages")
      .select("conversation_id, body, created_at")
      .eq("org_id", orgId)
      .eq("kind", "message")
      .or(buildOrIlikeFilter("body", sanitizedTerms))
      .order("created_at", { ascending: false })
      .limit(MESSAGE_PREFILTER_LIMIT)

    if (error) throw error
    if (data) messageRows.push(...data)
  } catch (error) {
    console.error("[memory-search] message prefilter failed", error)
  }

  // (b) Contact-name matches -> their conversations.
  const nameMatchedConversationIds: string[] = []
  try {
    const { data: contactRows, error: contactError } = await supabase
      .from("contacts")
      .select("id")
      .eq("org_id", orgId)
      .or(buildOrIlikeFilter("name", sanitizedTerms))
      .limit(MAX_CONTACT_NAME_MATCHES)

    if (contactError) throw contactError
    const contactIds = (contactRows ?? []).map((row) => row.id)

    if (contactIds.length > 0) {
      const { data: convRows, error: convError } = await supabase
        .from("conversations")
        .select("id")
        .eq("org_id", orgId)
        .in("contact_id", contactIds)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(MAX_CANDIDATES)

      if (convError) throw convError
      nameMatchedConversationIds.push(...(convRows ?? []).map((row) => row.id))
    }
  } catch (error) {
    console.error("[memory-search] contact-name prefilter failed", error)
  }

  // (c) ai_memory text matches, filtered in JS (see module header).
  const memoryMatchedConversationIds: string[] = []
  try {
    const { data: memoryRows, error: memoryError } = await supabase
      .from("conversations")
      .select("id, ai_memory")
      .eq("org_id", orgId)
      .not("ai_memory", "is", null)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(RECENT_MEMORY_CONVERSATIONS_LIMIT)

    if (memoryError) throw memoryError

    // Raw terms here, not sanitizedTerms (review fix): the backslash
    // escaping is ILIKE syntax, meaningless for a plain JS substring check —
    // "100% off" must still match memory text.
    const rawTerms = terms.map((term) => term.trim().toLowerCase()).filter((term) => term.length > 0)
    for (const row of memoryRows ?? []) {
      const haystack = JSON.stringify(row.ai_memory ?? {}).toLowerCase()
      if (rawTerms.some((term) => haystack.includes(term))) {
        memoryMatchedConversationIds.push(row.id)
      }
    }
  } catch (error) {
    console.error("[memory-search] ai_memory prefilter failed", error)
  }

  const orderedIds = dedupeAndCapConversationIds(
    [messageRows.map((row) => row.conversation_id), nameMatchedConversationIds, memoryMatchedConversationIds],
    limit
  )

  if (orderedIds.length === 0) return []

  const [{ data: conversationRows, error: conversationError }] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, contact_id, channel, ai_memory")
      .eq("org_id", orgId)
      .in("id", orderedIds),
  ])

  if (conversationError) {
    console.error("[memory-search] failed to load candidate conversations", conversationError.message)
    return []
  }

  const contactIds = Array.from(
    new Set((conversationRows ?? []).map((row) => row.contact_id).filter((id): id is string => Boolean(id)))
  )

  let contactNameById = new Map<string, string | null>()
  if (contactIds.length > 0) {
    const { data: contactRows, error: contactsError } = await supabase
      .from("contacts")
      .select("id, name")
      .eq("org_id", orgId)
      .in("id", contactIds)

    if (contactsError) {
      console.error("[memory-search] failed to load candidate contacts", contactsError.message)
    } else {
      contactNameById = new Map((contactRows ?? []).map((row) => [row.id, row.name ?? null]))
    }
  }

  const conversationById = new Map((conversationRows ?? []).map((row) => [row.id, row]))

  return orderedIds
    .map((conversationId): MemorySearchCandidate | null => {
      const conversation = conversationById.get(conversationId)
      if (!conversation) return null

      const memory = parseConversationMemory(conversation.ai_memory)
      const snippets = messageRows
        .filter((row) => row.conversation_id === conversationId && row.body?.trim())
        .slice(0, MAX_SNIPPETS_PER_CANDIDATE)
        .map((row) => ({ body: truncateSnippet(row.body ?? ""), createdAt: row.created_at }))

      return {
        conversationId,
        contactId: conversation.contact_id ?? null,
        contactName: conversation.contact_id ? (contactNameById.get(conversation.contact_id) ?? null) : null,
        channel: conversation.channel,
        memorySummary: memory?.summary || null,
        memoryFacts: memory?.facts ?? [],
        snippets,
      }
    })
    .filter((candidate): candidate is MemorySearchCandidate => candidate !== null)
}

// ---------------------------------------------------------------------------
// Model pass — turns candidates into a short plain-English answer.
// ---------------------------------------------------------------------------

const MAX_ANSWER_LENGTH = 500
const MAX_RETRIES = 1

function formatDateForPrompt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function buildCandidateBlock(candidate: MemorySearchCandidate): string {
  const parts = [
    `conversation_id: ${candidate.conversationId}`,
    `contact: ${candidate.contactName ?? "unknown name"}`,
    `channel: ${candidate.channel}`,
  ]

  if (candidate.memorySummary) parts.push(`memory: ${candidate.memorySummary}`)
  if (candidate.memoryFacts.length > 0) parts.push(`facts: ${candidate.memoryFacts.join("; ")}`)
  if (candidate.snippets.length > 0) {
    parts.push(
      `messages: ${candidate.snippets.map((snippet) => `"${snippet.body}" (${formatDateForPrompt(snippet.createdAt)})`).join(" | ")}`
    )
  }

  return parts.join(" — ")
}

function buildSearchSystemPrompt(): string {
  return [
    "You help a local business owner search their own past customer conversations.",
    "You're given a list of candidate conversations (contact name, channel, remembered facts/summary when available, and any matching message snippets with dates) plus the owner's own search question.",
    "Answer the owner's question directly in 1-3 short, plain sentences — name real people and real dates when the candidates give you them. Never invent a name, date, or detail that isn't actually present below.",
    "If none of the candidates actually answer the question, say so plainly instead of guessing or picking the closest-sounding one.",
    'Respond with ONLY strict JSON, no markdown code fences, no commentary before or after — exactly this shape: {"answer": string, "conversation_ids": string[] (the conversation_id values, copied exactly from the candidates below, that are actually relevant to your answer — can be empty)}',
  ].join(" ")
}

function buildSearchInstructionMessage(query: string, candidates: MemorySearchCandidate[]): ChatMessage {
  return {
    role: "user",
    content: [
      `Owner's search question: "${query}"`,
      "Candidate conversations:",
      ...candidates.map((candidate, index) => `[${index + 1}] ${buildCandidateBlock(candidate)}`),
    ].join("\n"),
  }
}

interface ParsedSearchAnswer {
  answer: string
  conversationIds: string[]
}

/** Defensively extracts + validates the model's search-answer JSON. Returns null on any shape/length problem — mirrors frontdesk-reply.ts's parseReplyJson contract. Pure, exported for unit tests. */
export function parseSearchAnswerJson(raw: string): ParsedSearchAnswer | null {
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

  const answer = typeof obj.answer === "string" ? obj.answer.trim() : ""
  if (!answer || answer.length > MAX_ANSWER_LENGTH) return null

  const conversationIds = Array.isArray(obj.conversation_ids)
    ? obj.conversation_ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    : []

  return { answer, conversationIds }
}

/**
 * Drops any conversation_ids the model returned that don't correspond to a
 * real candidate it was actually given (a hallucinated id) — the model is
 * only ever grounded in `validConversationIds`, so anything outside that set
 * is fabricated. Pure, exported for unit tests.
 */
export function validateConversationIds(conversationIds: string[], validConversationIds: Set<string>): string[] {
  return conversationIds.filter((id) => validConversationIds.has(id))
}

export interface MemorySearchResult {
  answer: string | null
  /** Subset of candidates' conversationIds the model considered actually relevant — hallucinated ids are dropped. Empty when there's no model answer. */
  conversationIds: string[]
  /** Always populated (when there are any keyword matches) regardless of whether the model answer succeeded. */
  candidates: MemorySearchCandidate[]
}

/**
 * The full memory-search pipeline: extract terms -> keyword-prefilter
 * candidates -> (when available) ask the "memory_search" router job for a
 * short plain-English answer grounded ONLY in those candidates. Returns
 * `{ answer: null, conversationIds: [], candidates: [] }` when there are no
 * keyword candidates at all. When OpenRouter/Supabase aren't configured, or
 * the model fails to produce usable JSON after one retry, `answer` is null
 * but `candidates` is still populated — callers should keep showing the
 * keyword results either way. Throws AllowanceDeniedError when the org is
 * out of `ai_replies` quota (propagated from runTextJob, matching every
 * other AI-backed inbox action) — the keyword prefilter above still ran and
 * its candidates are lost with it, since a spend-guard denial is a real stop
 * condition, not a soft degrade; callers should catch this the same way
 * draftReply/suggestReplies do.
 */
export async function answerSearch(orgId: string, query: string): Promise<MemorySearchResult> {
  const terms = extractSearchTerms(query)
  if (terms.length === 0) return { answer: null, conversationIds: [], candidates: [] }

  const candidates = await searchCandidates(orgId, terms)
  if (candidates.length === 0) return { answer: null, conversationIds: [], candidates: [] }

  if (!isOpenRouterConfigured() || !isSupabaseConfigured()) {
    return { answer: null, conversationIds: [], candidates }
  }

  const validConversationIds = new Set(candidates.map((candidate) => candidate.conversationId))

  const baseMessages: ChatMessage[] = [
    { role: "system", content: buildSearchSystemPrompt() },
    buildSearchInstructionMessage(query, candidates),
  ]

  const retryMessage: ChatMessage = {
    role: "user",
    content:
      "Your last reply was not valid JSON matching the requested shape. Respond again with ONLY the strict JSON object — nothing else.",
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const messages = attempt === 0 ? baseMessages : [...baseMessages, retryMessage]

    const result = await runTextJob({
      orgId,
      job: "memory_search",
      messages,
      maxTokens: 350,
      temperature: 0.3,
    })

    const parsed = parseSearchAnswerJson(result.text)
    if (parsed) {
      return {
        answer: parsed.answer,
        conversationIds: validateConversationIds(parsed.conversationIds, validConversationIds),
        candidates,
      }
    }
  }

  return { answer: null, conversationIds: [], candidates }
}
