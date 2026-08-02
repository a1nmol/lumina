import "server-only"

// Proactive follow-ups (Outlast wave 3, Part B) — a short, draft-first nudge
// for a conversation the business answered and the customer went quiet on.
// Folded into the SAME daily invocation as the morning-brief cron
// (src/app/api/cron/morning-brief/route.ts calls runFollowUpScan() after it
// sends briefs) rather than getting its own Vercel Cron entry — Vercel's
// Hobby plan caps a project at 2 cron jobs, and watchdog + morning-brief
// already use both slots (see vercel.json). Kept in its own module so the
// two stay decoupled in code even though they share a schedule.
//
// Split like src/lib/watchdog.ts and src/lib/morning-brief.ts: PURE
// candidate-selection logic (isFollowUpCandidate, capFollowUpCandidates,
// hasFollowUpsPausedToken) with zero I/O, unit-tested directly in
// follow-ups.test.ts; and IMPURE gathering/drafting/persisting
// (runFollowUpScan + its helpers) that reads/writes Supabase via the
// service-role admin client — this runs from a cron route with no user
// session, mirroring watchdog.ts/morning-brief.ts.
//
// DRAFT-FIRST, always: nothing here ever sends a message. A drafted nudge is
// persisted as an internal note (kind "note", never delivered to the
// customer) and the conversation is flipped to ai_state "ai_draft" so it
// surfaces in the Inbox exactly like any other AI draft awaiting review —
// see draftFollowUpForConversation below.

import { parseConversationMemory } from "@/lib/ai/conversation-memory"
import { AllowanceDeniedError } from "@/lib/ai/errors"
import { draftFollowUpMessage, windDownStage } from "@/lib/ai/frontdesk-reply"
import { isOpenRouterConfigured } from "@/lib/ai/openrouter"
import { fetchActiveStandingOrders } from "@/lib/standing-orders"
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin"
import { getAiRepliesUsageFraction } from "@/lib/usage"
import type { BusinessBrain, Contact, Conversation, ConversationAiMode, Message, MessageDirection } from "@/lib/types"

// ===========================================================================
// 1. Pure decision logic
// ===========================================================================

const DAY_MS = 24 * 60 * 60 * 1000

/** A quiet thread must be at least this old before a follow-up nudges it — long enough that the silence is real, not just a slow afternoon. */
export const FOLLOW_UP_MIN_AGE_MS = 2 * DAY_MS
/** ...and no older than this — past a week, a fresh nudge reads as random rather than a natural check-in. */
export const FOLLOW_UP_MAX_AGE_MS = 7 * DAY_MS
/** Minimum gap before the SAME conversation can be nudged again. */
export const FOLLOW_UP_RENUDGE_GAP_MS = 14 * DAY_MS
/** Hard cap on drafted nudges per org per scan run. */
export const MAX_FOLLOW_UPS_PER_ORG_PER_RUN = 3
/** Literal opt-out token — the interim control until a dedicated toggle column exists (see src/app/(app)/settings/standing-orders-card.tsx's helper copy). */
export const NO_FOLLOW_UPS_TOKEN = "[no-followups]"

export interface FollowUpCandidateInput {
  aiMode: ConversationAiMode
  contactIsVip: boolean
  /** True when the conversation's rolling ai_memory carries at least one non-empty open_threads entry. */
  hasOpenThreads: boolean
  /** The direction of the most recent (kind: "message") row in this conversation. */
  lastMessageDirection: MessageDirection
  lastMessageAt: Date
  lastFollowUpAt: Date | null
  now: Date
}

/**
 * True iff a conversation qualifies for a proactive follow-up nudge:
 * ai_mode "auto" (the owner opted this thread into AI autonomy), not a VIP
 * contact (VIPs never get an unattended AI action), a parseable non-empty
 * open_threads to actually nudge about, the business's own last message
 * (never nudge someone the owner/AI still owes a reply to), quiet for
 * 2-7 days, and not re-nudged within FOLLOW_UP_RENUDGE_GAP_MS of the last
 * nudge. Pure, no I/O — exported for unit tests.
 */
export function isFollowUpCandidate(input: FollowUpCandidateInput): boolean {
  if (input.aiMode !== "auto") return false
  if (input.contactIsVip) return false
  if (!input.hasOpenThreads) return false
  if (input.lastMessageDirection !== "outbound") return false

  const ageMs = input.now.getTime() - input.lastMessageAt.getTime()
  if (ageMs < FOLLOW_UP_MIN_AGE_MS || ageMs > FOLLOW_UP_MAX_AGE_MS) return false

  if (input.lastFollowUpAt) {
    const sinceLastFollowUpMs = input.now.getTime() - input.lastFollowUpAt.getTime()
    if (sinceLastFollowUpMs < FOLLOW_UP_RENUDGE_GAP_MS) return false
  }

  return true
}

/**
 * Caps an already-qualified, priority-ordered candidate list to the
 * per-org-per-run limit. Trivial, but kept as a named pure function (rather
 * than an inline `.slice`) so the cap itself has a single, unit-tested
 * source of truth callers and tests can both point at.
 */
export function capFollowUpCandidates<T>(candidates: T[]): T[] {
  return candidates.slice(0, MAX_FOLLOW_UPS_PER_ORG_PER_RUN)
}

/**
 * True when an org's active standing orders include the literal
 * "[no-followups]" opt-out token anywhere in their text — the interim
 * "pause suggested follow-ups" control until a dedicated toggle column
 * exists (documented in the settings card's helper copy). Pure, no I/O.
 */
export function hasFollowUpsPausedToken(standingOrderInstructions: string[]): boolean {
  // Case-insensitive (review fix): this is the ONLY opt-out for an
  // unattended AI behavior — "[No-Followups]" must pause it just as well.
  return standingOrderInstructions.some((instruction) =>
    instruction.toLowerCase().includes(NO_FOLLOW_UPS_TOKEN)
  )
}

// ===========================================================================
// 2. Orchestration (impure — network + Supabase)
// ===========================================================================

type AdminClient = ReturnType<typeof createAdminClient>

/** Pre-filter query limit — generous since the real qualifying set (after VIP/open-thread/direction checks) is almost always much smaller, and this only runs once a day. */
const CANDIDATE_QUERY_LIMIT = 50

interface CandidateRow {
  conversation: Conversation
  contactId: string | null
}

/** Loads conversations that pass the CHEAP filters a single SQL query can express (ai_mode, last_message_at window, re-nudge gap) — everything else (VIP, open threads, last-message direction) is checked in JS below against the smaller result set. */
async function loadCandidateConversations(admin: AdminClient, orgId: string, now: Date): Promise<CandidateRow[]> {
  const from = new Date(now.getTime() - FOLLOW_UP_MAX_AGE_MS)
  const to = new Date(now.getTime() - FOLLOW_UP_MIN_AGE_MS)
  const renudgeCutoff = new Date(now.getTime() - FOLLOW_UP_RENUDGE_GAP_MS)

  const { data, error } = await admin
    .from("conversations")
    .select()
    .eq("org_id", orgId)
    .eq("ai_mode", "auto")
    .gte("last_message_at", from.toISOString())
    .lte("last_message_at", to.toISOString())
    .or(`last_follow_up_at.is.null,last_follow_up_at.lt.${renudgeCutoff.toISOString()}`)
    .order("last_message_at", { ascending: true })
    .limit(CANDIDATE_QUERY_LIMIT)

  if (error || !data) {
    if (error) console.error("[follow-ups] failed to load candidate conversations", error.message)
    return []
  }

  return data.map((conversation) => ({ conversation, contactId: conversation.contact_id ?? null }))
}

/** The direction of the most recent (kind: "message") row for each conversation id, in one batched query. Conversations with no message rows at all are simply absent from the returned map. */
async function loadLastMessageDirections(
  admin: AdminClient,
  orgId: string,
  conversationIds: string[]
): Promise<Map<string, MessageDirection>> {
  const map = new Map<string, MessageDirection>()
  if (conversationIds.length === 0) return map

  const { data, error } = await admin
    .from("messages")
    .select("conversation_id, direction, created_at")
    .eq("org_id", orgId)
    .eq("kind", "message")
    .in("conversation_id", conversationIds)
    .order("created_at", { ascending: false })

  if (error || !data) {
    if (error) console.error("[follow-ups] failed to load last-message directions", error.message)
    return map
  }

  // Rows arrive newest-first — the first time we see a conversation_id, that
  // IS its most recent message, so skip anything already recorded.
  for (const row of data) {
    if (!map.has(row.conversation_id)) {
      map.set(row.conversation_id, row.direction as MessageDirection)
    }
  }
  return map
}

async function loadVipContactIds(admin: AdminClient, orgId: string, contactIds: string[]): Promise<Set<string>> {
  const set = new Set<string>()
  if (contactIds.length === 0) return set

  const { data, error } = await admin
    .from("contacts")
    .select("id, is_vip")
    .eq("org_id", orgId)
    .in("id", contactIds)

  if (error || !data) {
    if (error) console.error("[follow-ups] failed to load contact VIP flags", error.message)
    return set
  }

  for (const row of data) {
    if (row.is_vip) set.add(row.id)
  }
  return set
}

/** Narrows the cheap-filtered candidate rows down to real follow-up candidates via isFollowUpCandidate, batching the extra lookups it needs (VIP flag, last-message direction, open threads already on the row). */
async function selectFollowUpCandidates(admin: AdminClient, orgId: string, now: Date): Promise<CandidateRow[]> {
  const rows = await loadCandidateConversations(admin, orgId, now)
  if (rows.length === 0) return []

  const conversationIds = rows.map((row) => row.conversation.id)
  const contactIds = Array.from(new Set(rows.map((row) => row.contactId).filter((id): id is string => Boolean(id))))

  const [directionsByConversation, vipContactIds] = await Promise.all([
    loadLastMessageDirections(admin, orgId, conversationIds),
    loadVipContactIds(admin, orgId, contactIds),
  ])

  const qualified = rows.filter((row) => {
    const memory = parseConversationMemory(row.conversation.ai_memory)
    const hasOpenThreads = Boolean(memory && memory.open_threads.length > 0)
    const lastMessageDirection = directionsByConversation.get(row.conversation.id)
    const lastMessageAt = row.conversation.last_message_at ? new Date(row.conversation.last_message_at) : null

    if (!lastMessageDirection || !lastMessageAt) return false

    return isFollowUpCandidate({
      aiMode: row.conversation.ai_mode,
      contactIsVip: row.contactId ? vipContactIds.has(row.contactId) : false,
      hasOpenThreads,
      lastMessageDirection,
      lastMessageAt,
      lastFollowUpAt: row.conversation.last_follow_up_at ? new Date(row.conversation.last_follow_up_at) : null,
      now,
    })
  })

  return capFollowUpCandidates(qualified)
}

/** Everything draftFollowUpMessage needs for one candidate — loaded in one shot per candidate (small set, at most MAX_FOLLOW_UPS_PER_ORG_PER_RUN per org). */
async function loadConversationContext(
  admin: AdminClient,
  orgId: string,
  conversationId: string,
  contactId: string | null
): Promise<{ messages: Message[]; contact: Contact | null }> {
  const [messagesResult, contactResult] = await Promise.all([
    admin.from("messages").select().eq("org_id", orgId).eq("conversation_id", conversationId).order("created_at", { ascending: true }),
    contactId
      ? admin.from("contacts").select().eq("org_id", orgId).eq("id", contactId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  if (messagesResult.error) {
    console.error("[follow-ups] failed to load messages for candidate conversation", messagesResult.error.message)
  }
  if (contactResult.error) {
    console.error("[follow-ups] failed to load contact for candidate conversation", contactResult.error.message)
  }

  return { messages: messagesResult.data ?? [], contact: contactResult.data ?? null }
}

/** Suggested-follow-up note metadata shape — read back by src/lib/morning-brief.ts's "Suggested follow-ups" section. */
interface FollowUpNoteMetadata {
  follow_up_suggestion: true
  draft: string
}

/** Drafts + persists ONE follow-up as a draft-first internal note (never sent to the customer): draftFollowUpMessage produces the nudge text, then it's stored as a kind "note" message and the conversation is flipped to ai_state "ai_draft" + unread true + last_follow_up_at now, so it surfaces in the Inbox exactly like any other unreviewed AI draft. Returns true iff a note was actually created. */
async function draftFollowUpForConversation(
  admin: AdminClient,
  orgId: string,
  businessBrain: BusinessBrain,
  conversation: Conversation,
  contactId: string | null
): Promise<boolean> {
  const { messages, contact } = await loadConversationContext(admin, orgId, conversation.id, contactId)

  const drafted = await draftFollowUpMessage({ orgId, businessBrain, conversation, messages, contact })
  if (!drafted) return false

  const now = new Date().toISOString()
  const metadata: FollowUpNoteMetadata = { follow_up_suggestion: true, draft: drafted.reply }

  const { error: noteError } = await admin.from("messages").insert({
    org_id: orgId,
    conversation_id: conversation.id,
    direction: "outbound",
    kind: "note",
    body: `Suggested follow-up: ${drafted.reply}`,
    ai_handled: true,
    model: drafted.model,
    cost_usd: drafted.costUsd,
    // FollowUpNoteMetadata has no index signature, so it isn't structurally
    // assignable to the jsonb column's Record<string, unknown> — it IS a
    // plain, JSON-serializable object, so this cast is safe (mirrors
    // src/lib/ai/conversation-memory.ts's updateConversationMemory).
    metadata: metadata as unknown as Record<string, unknown>,
  })

  if (noteError) {
    console.error("[follow-ups] failed to persist follow-up note", noteError.message)
    return false
  }

  // No `unread: true` here (review fix): unread feeds the Command Center's
  // "new conversations" digest count, and a drafted note is NOT customer
  // activity — inflating that count would read as "a customer messaged you"
  // when nobody did. Surfacing comes from ai_state "ai_draft" (draft badge)
  // + the last_message_at bump (thread sorts to the top) + the brief email.
  const { error: updateError } = await admin
    .from("conversations")
    .update({ ai_state: "ai_draft", last_follow_up_at: now, last_message_at: now })
    .eq("id", conversation.id)
    .eq("org_id", orgId)

  if (updateError) {
    console.error("[follow-ups] failed to update conversation after drafting follow-up", updateError.message)
    // The note is already on record even though the conversation flags
    // didn't update — still counts as "created" for the run's cap/count.
  }

  return true
}

async function loadBusinessBrain(admin: AdminClient, orgId: string): Promise<BusinessBrain | null> {
  const { data, error } = await admin.from("business_brain").select("*").eq("org_id", orgId).maybeSingle()
  if (error) {
    console.error("[follow-ups] failed to load business_brain", error.message)
    return null
  }
  return data
}

/** True when the org's active standing orders carry the "[no-followups]" opt-out token. */
async function isFollowUpsPausedForOrg(orgId: string, now: Date): Promise<boolean> {
  const orders = await fetchActiveStandingOrders(orgId, now)
  return hasFollowUpsPausedToken(orders.map((order) => order.instruction))
}

/**
 * Runs the proactive follow-up scan for ONE org: skips entirely unless
 * `frontdesk_auto_reply` is on (the org's own opt-in to AI autonomy) and the
 * org isn't wound down (windDownStage !== "none" — an org near/over its
 * ai_replies allowance shouldn't spend its remaining budget on unprompted
 * nudges) and hasn't paused follow-ups via the "[no-followups]" standing
 * order. Drafts up to MAX_FOLLOW_UPS_PER_ORG_PER_RUN nudges, each metered as
 * a normal "customer_reply" job (the same ai_replies allowance gates real
 * replies). An AllowanceDeniedError on any candidate stops this org's run
 * early (out of quota) but never throws past this function — one org's
 * quota exhaustion must never abort the whole cron run.
 */
interface OrgScanOutcome {
  /** True once this org passed every gate (frontdesk_auto_reply on, not wound down, not paused) and was actually queried for candidates — independent of whether any candidate qualified or drafted successfully. */
  eligible: boolean
  created: number
}

async function runFollowUpScanForOrg(admin: AdminClient, orgId: string, now: Date): Promise<OrgScanOutcome> {
  const businessBrain = await loadBusinessBrain(admin, orgId)
  if (!businessBrain || !businessBrain.frontdesk_auto_reply) return { eligible: false, created: 0 }

  let fraction: number | null
  try {
    fraction = await getAiRepliesUsageFraction(orgId)
  } catch (error) {
    console.error(`[follow-ups] usage-fraction lookup failed for org ${orgId}`, error)
    return { eligible: false, created: 0 }
  }
  if (windDownStage(fraction) !== "none") return { eligible: false, created: 0 }

  if (await isFollowUpsPausedForOrg(orgId, now)) return { eligible: false, created: 0 }

  const candidates = await selectFollowUpCandidates(admin, orgId, now)

  let created = 0
  for (const candidate of candidates) {
    try {
      const ok = await draftFollowUpForConversation(admin, orgId, businessBrain, candidate.conversation, candidate.contactId)
      if (ok) created++
    } catch (error) {
      if (error instanceof AllowanceDeniedError) {
        console.warn(`[follow-ups] org ${orgId} is out of ai_replies quota — stopping its follow-up scan early`)
        break
      }
      console.error(`[follow-ups] failed to draft follow-up for conversation ${candidate.conversation.id}`, error)
    }
  }

  return { eligible: true, created }
}

export interface FollowUpScanResult {
  /** Total nudges drafted (persisted as internal notes) across every org. */
  created: number
  /** Orgs actually scanned (frontdesk_auto_reply on, not wound down, not paused). */
  scannedOrgs: number
}

const EMPTY_RESULT: FollowUpScanResult = { created: 0, scannedOrgs: 0 }

/**
 * Runs the proactive follow-up scan for every org — called from
 * src/app/api/cron/morning-brief/route.ts's daily invocation (see this
 * module's header for why it isn't its own cron job). No-ops when Supabase
 * or OpenRouter isn't configured. Best-effort per org (a crash in one org's
 * scan is logged and skipped, never aborts the rest).
 */
export async function runFollowUpScan(now: Date = new Date()): Promise<FollowUpScanResult> {
  if (!isSupabaseConfigured() || !isOpenRouterConfigured()) return EMPTY_RESULT

  const admin = createAdminClient()

  const { data: orgs, error } = await admin.from("orgs").select("id")
  if (error) {
    console.error("[follow-ups] failed to load orgs", error.message)
    return EMPTY_RESULT
  }

  let created = 0
  let scannedOrgs = 0

  for (const org of orgs ?? []) {
    try {
      const outcome = await runFollowUpScanForOrg(admin, org.id, now)
      if (outcome.eligible) scannedOrgs++
      created += outcome.created
    } catch (error) {
      console.error(`[follow-ups] scan crashed for org ${org.id}`, error)
    }
  }

  return { created, scannedOrgs }
}
