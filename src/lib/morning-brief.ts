import "server-only"

// Morning brief (Outlast wave 2, Part B) — a daily, plain-language summary
// email of the last 24h per org: how many messages came in/out, how many the
// AI handled on its own, which conversations still need the owner, which
// VIPs messaged, and a few open threads worth a follow-up. Scheduled via
// src/app/api/cron/morning-brief/route.ts (12:30 UTC, see vercel.json) and
// deduped through the SAME watchdog_alerts ledger the ops watchdog uses (kind
// "morning_brief" — see src/lib/watchdog.ts) so a manual cron poke can't
// double-send the same day's brief.
//
// Split like src/lib/watchdog.ts: PURE formatting (briefHasActivity,
// formatBriefSubject, deriveBriefLines) with zero I/O, unit-tested directly;
// and IMPURE gathering (buildMorningBrief + its per-section helpers) that
// reads Supabase via the service-role admin client — this runs from a cron
// route with no user session, mirroring src/lib/watchdog.ts's own checks.

import { parseConversationMemory } from "@/lib/ai/conversation-memory"
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin"
import type { ConversationAiState, ConversationChannel } from "@/lib/types"

const BRIEF_WINDOW_MS = 24 * 60 * 60 * 1000
const MAX_NEEDS_OWNER = 5
const MAX_VIP_MESSAGES = 5
const MAX_OPEN_THREADS = 3
/** How many of the org's most-recently-active conversations to scan for a usable open_thread before giving up — most won't have one, so this is scanned, not all returned. */
const OPEN_THREAD_CANDIDATE_LIMIT = 25
const MAX_PREVIEW_LENGTH = 140

export interface MorningBriefCounts {
  inboundCount: number
  outboundCount: number
  aiHandledOutboundCount: number
}

/** A conversation the owner still needs to look at — unread AND either escalated or sitting as an unreviewed AI draft. */
export interface MorningBriefNeedsOwnerItem {
  conversationId: string
  contactName: string | null
  reason: Extract<ConversationAiState, "escalated" | "ai_draft">
}

/** A VIP contact (contacts.is_vip) who messaged in the last 24h. */
export interface MorningBriefVipItem {
  conversationId: string
  contactName: string | null
  channel: ConversationChannel
  preview: string | null
}

/** One open thread pulled from a conversation's rolling ai_memory.open_threads. */
export interface MorningBriefOpenThread {
  conversationId: string
  contactName: string | null
  thread: string
}

export interface MorningBriefData {
  counts: MorningBriefCounts
  needsOwner: MorningBriefNeedsOwnerItem[]
  vipMessages: MorningBriefVipItem[]
  openThreads: MorningBriefOpenThread[]
}

export const EMPTY_MORNING_BRIEF: MorningBriefData = {
  counts: { inboundCount: 0, outboundCount: 0, aiHandledOutboundCount: 0 },
  needsOwner: [],
  vipMessages: [],
  openThreads: [],
}

// ---------------------------------------------------------------------------
// Pure formatting — no I/O, unit-tested directly (morning-brief.test.ts).
// ---------------------------------------------------------------------------

/** True when there was any inbound or outbound message in the window — the brief's skip rule: a silent 24h gets no email at all. */
export function briefHasActivity(counts: MorningBriefCounts): boolean {
  return counts.inboundCount + counts.outboundCount > 0
}

/** e.g. "Your Lumina brief: 18 messages, 3 need you" (or without the second clause when nothing needs the owner). */
export function formatBriefSubject(counts: MorningBriefCounts, needsOwnerCount: number): string {
  const total = counts.inboundCount + counts.outboundCount
  const messageWord = total === 1 ? "message" : "messages"
  if (needsOwnerCount === 0) return `Your Lumina brief: ${total} ${messageWord}`
  const needWord = needsOwnerCount === 1 ? "needs" : "need"
  return `Your Lumina brief: ${total} ${messageWord}, ${needsOwnerCount} ${needWord} you`
}

const NEEDS_OWNER_REASON_LABEL: Record<MorningBriefNeedsOwnerItem["reason"], string> = {
  escalated: "the AI couldn't handle this one, it's flagged for you",
  ai_draft: "the AI drafted a reply that's waiting on your review",
}

export interface FormattedBriefSections {
  summaryLine: string
  needsYouLines: string[]
  vipLines: string[]
  openThreadLines: string[]
}

/** Turns a MorningBriefData into plain-language lines for the email body. Pure, no I/O. */
export function deriveBriefLines(data: MorningBriefData): FormattedBriefSections {
  const total = data.counts.inboundCount + data.counts.outboundCount
  const summaryLine =
    data.counts.aiHandledOutboundCount > 0
      ? `${total} message${total === 1 ? "" : "s"} came through in the last 24 hours, and the AI handled ${data.counts.aiHandledOutboundCount} of them on its own.`
      : `${total} message${total === 1 ? "" : "s"} came through in the last 24 hours.`

  const needsYouLines = data.needsOwner.map(
    (item) => `${item.contactName?.trim() || "A customer"} — ${NEEDS_OWNER_REASON_LABEL[item.reason]}`
  )

  const vipLines = data.vipMessages.map((item) => {
    const who = item.contactName?.trim() || "A VIP contact"
    return item.preview ? `${who} — "${item.preview}"` : `${who} messaged you`
  })

  const openThreadLines = data.openThreads.map(
    (item) => `${item.contactName?.trim() || "Someone"} — ${item.thread}`
  )

  return { summaryLine, needsYouLines, vipLines, openThreadLines }
}

// ---------------------------------------------------------------------------
// Gathering — impure, Supabase reads via the admin client (this runs from a
// cron route with no user session — see src/app/api/cron/morning-brief/route.ts).
// ---------------------------------------------------------------------------

type AdminClient = ReturnType<typeof createAdminClient>

function truncatePreview(body: string | null | undefined): string | null {
  const trimmed = body?.trim()
  if (!trimmed) return null
  return trimmed.length > MAX_PREVIEW_LENGTH ? `${trimmed.slice(0, MAX_PREVIEW_LENGTH)}…` : trimmed
}

async function fetchContactNames(
  admin: AdminClient,
  orgId: string,
  contactIds: string[]
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>()
  if (contactIds.length === 0) return map

  const { data, error } = await admin.from("contacts").select("id, name").eq("org_id", orgId).in("id", contactIds)
  if (error || !data) return map

  for (const row of data) map.set(row.id, row.name ?? null)
  return map
}

async function gatherCounts(admin: AdminClient, orgId: string, from: Date, to: Date): Promise<MorningBriefCounts> {
  const { data, error } = await admin
    .from("messages")
    .select("direction, ai_handled")
    .eq("org_id", orgId)
    .eq("kind", "message")
    .gte("created_at", from.toISOString())
    .lt("created_at", to.toISOString())

  if (error || !data) return { inboundCount: 0, outboundCount: 0, aiHandledOutboundCount: 0 }

  let inboundCount = 0
  let outboundCount = 0
  let aiHandledOutboundCount = 0
  for (const row of data) {
    if (row.direction === "inbound") {
      inboundCount++
    } else if (row.direction === "outbound") {
      outboundCount++
      if (row.ai_handled) aiHandledOutboundCount++
    }
  }
  return { inboundCount, outboundCount, aiHandledOutboundCount }
}

async function gatherNeedsOwner(admin: AdminClient, orgId: string): Promise<MorningBriefNeedsOwnerItem[]> {
  const { data, error } = await admin
    .from("conversations")
    .select("id, contact_id, ai_state")
    .eq("org_id", orgId)
    .in("ai_state", ["escalated", "ai_draft"])
    .eq("unread", true)
    .order("last_message_at", { ascending: false })
    .limit(MAX_NEEDS_OWNER)

  if (error || !data || data.length === 0) return []

  const contactIds = Array.from(new Set(data.map((row) => row.contact_id).filter((id): id is string => Boolean(id))))
  const namesById = await fetchContactNames(admin, orgId, contactIds)

  return data.map((row) => ({
    conversationId: row.id,
    contactName: row.contact_id ? (namesById.get(row.contact_id) ?? null) : null,
    reason: row.ai_state as MorningBriefNeedsOwnerItem["reason"],
  }))
}

async function gatherVipMessages(admin: AdminClient, orgId: string, from: Date, to: Date): Promise<MorningBriefVipItem[]> {
  const { data: vipContacts, error: vipError } = await admin
    .from("contacts")
    .select("id, name")
    .eq("org_id", orgId)
    .eq("is_vip", true)

  if (vipError || !vipContacts || vipContacts.length === 0) return []

  const vipContactIds = vipContacts.map((row) => row.id)
  const namesById = new Map(vipContacts.map((row) => [row.id, row.name ?? null] as const))

  const { data: conversations, error: conversationsError } = await admin
    .from("conversations")
    .select("id, contact_id, channel, last_message_at")
    .eq("org_id", orgId)
    .in("contact_id", vipContactIds)
    .gte("last_message_at", from.toISOString())
    .lt("last_message_at", to.toISOString())
    .order("last_message_at", { ascending: false })
    .limit(MAX_VIP_MESSAGES)

  if (conversationsError || !conversations || conversations.length === 0) return []

  const conversationIds = conversations.map((row) => row.id)
  const { data: messages } = await admin
    .from("messages")
    .select("conversation_id, body, created_at")
    .eq("org_id", orgId)
    .in("conversation_id", conversationIds)
    .eq("direction", "inbound")
    .gte("created_at", from.toISOString())
    .lt("created_at", to.toISOString())
    .order("created_at", { ascending: false })

  const previewByConversation = new Map<string, string>()
  for (const row of messages ?? []) {
    if (!previewByConversation.has(row.conversation_id) && row.body) {
      previewByConversation.set(row.conversation_id, row.body)
    }
  }

  return conversations.map((row) => ({
    conversationId: row.id,
    contactName: row.contact_id ? (namesById.get(row.contact_id) ?? null) : null,
    channel: row.channel as ConversationChannel,
    preview: truncatePreview(previewByConversation.get(row.id) ?? null),
  }))
}

async function gatherOpenThreads(admin: AdminClient, orgId: string): Promise<MorningBriefOpenThread[]> {
  const { data, error } = await admin
    .from("conversations")
    .select("id, contact_id, ai_memory")
    .eq("org_id", orgId)
    .order("last_message_at", { ascending: false })
    .limit(OPEN_THREAD_CANDIDATE_LIMIT)

  if (error || !data || data.length === 0) return []

  const withThreads: { id: string; contact_id: string | null; thread: string }[] = []
  for (const row of data) {
    if (withThreads.length >= MAX_OPEN_THREADS) break
    const memory = parseConversationMemory(row.ai_memory)
    const thread = memory?.open_threads?.[0]?.trim()
    if (thread) withThreads.push({ id: row.id, contact_id: row.contact_id ?? null, thread })
  }

  if (withThreads.length === 0) return []

  const contactIds = Array.from(new Set(withThreads.map((row) => row.contact_id).filter((id): id is string => Boolean(id))))
  const namesById = await fetchContactNames(admin, orgId, contactIds)

  return withThreads.map((row) => ({
    conversationId: row.id,
    contactName: row.contact_id ? (namesById.get(row.contact_id) ?? null) : null,
    thread: row.thread,
  }))
}

/**
 * Gathers the last 24h of activity for one org: message counts (in/out/AI-
 * handled), conversations needing the owner, VIP contact messages, and up to
 * 3 open threads pulled from conversations.ai_memory.open_threads. Best-
 * effort per section (Promise.allSettled) — one section's query failing
 * degrades that section to empty rather than failing the whole brief.
 * Returns EMPTY_MORNING_BRIEF when Supabase isn't configured.
 */
export async function buildMorningBrief(orgId: string, now: Date): Promise<MorningBriefData> {
  if (!isSupabaseConfigured()) return EMPTY_MORNING_BRIEF

  const admin = createAdminClient()
  const from = new Date(now.getTime() - BRIEF_WINDOW_MS)

  const settled = await Promise.allSettled([
    gatherCounts(admin, orgId, from, now),
    gatherNeedsOwner(admin, orgId),
    gatherVipMessages(admin, orgId, from, now),
    gatherOpenThreads(admin, orgId),
  ])

  const [countsResult, needsOwnerResult, vipResult, openThreadsResult] = settled

  if (countsResult.status === "rejected") console.error("[morning-brief] counts query crashed", countsResult.reason)
  if (needsOwnerResult.status === "rejected") console.error("[morning-brief] needs-owner query crashed", needsOwnerResult.reason)
  if (vipResult.status === "rejected") console.error("[morning-brief] VIP query crashed", vipResult.reason)
  if (openThreadsResult.status === "rejected") console.error("[morning-brief] open-threads query crashed", openThreadsResult.reason)

  return {
    counts: countsResult.status === "fulfilled" ? countsResult.value : EMPTY_MORNING_BRIEF.counts,
    needsOwner: needsOwnerResult.status === "fulfilled" ? needsOwnerResult.value : [],
    vipMessages: vipResult.status === "fulfilled" ? vipResult.value : [],
    openThreads: openThreadsResult.status === "fulfilled" ? openThreadsResult.value : [],
  }
}
