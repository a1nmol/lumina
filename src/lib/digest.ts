import "server-only"

// "While you were away" digest — Command Center receipt card
// (src/components/brand/receipt-card.tsx, brand-redesign-plan.md §7 "Gate
// 5"). Honest by construction: every row is a direct count over real data,
// and the whole card is withheld unless there's an actual previous visit to
// compare against AND at least one row is non-zero.

import { getOverviewStats } from "@/lib/analytics"
import { DEMO_WHILE_YOU_WERE_AWAY_ROWS } from "@/lib/demo"
import { countCallsSince, listConversations } from "@/lib/frontdesk"
import { getLastSeenIso } from "@/lib/last-seen"
import { getOrgSidebarContext } from "@/lib/org"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import type { ReceiptCardRow } from "@/components/brand/receipt-card"

/** getOverviewStats aggregates over a trailing N-day window rather than an
 * exact-timestamp range, so "since last visit" is approximated as the
 * smallest whole-day window that covers the gap (min 1 day, capped so a
 * long-dormant account doesn't trigger an unbounded query). Good enough for
 * a daily-cadence digest; a precise since-timestamp query is a fine future
 * upgrade once outcome volume justifies it (mirrors the loop-attribution
 * heuristic note in src/lib/analytics.ts). */
const MAX_LOOKBACK_DAYS = 30

function daysSince(lastSeenMs: number): number {
  const elapsedMs = Date.now() - lastSeenMs
  return Math.min(MAX_LOOKBACK_DAYS, Math.max(1, Math.ceil(elapsedMs / (24 * 60 * 60 * 1000))))
}

/**
 * The Command Center's "while you were away" digest — a discriminated
 * result so the surface always exists (Redesign wave R4) instead of
 * vanishing on quiet days/new users:
 *   - "activity": real rows to itemize (the original receipt-list treatment).
 *   - "caught_up": nothing new (or no baseline yet, e.g. a brand-new user's
 *     first-ever visit) — a calm one-line "All caught up" variant, still
 *     rendered so the surface teaches itself to first-time users.
 *   - null: the org/user context genuinely isn't resolved yet (should
 *     self-heal on the next request via ensureOrgBootstrap in the app
 *     layout) — nothing honest to render either way, so this stays absent.
 */
export type WhileYouWereAwayDigest = { kind: "activity"; rows: ReceiptCardRow[] } | { kind: "caught_up" } | null

/**
 * Demo mode always returns the illustrative fixed activity set (so the
 * design is visible without a live org or visit history). Live mode returns
 * "caught_up" when there's no baseline (first-ever visit — no `last-seen`
 * cookie yet) or nothing new happened since the last visit; otherwise
 * "activity" with only the non-zero rows.
 */
export async function getWhileYouWereAwayDigest(): Promise<WhileYouWereAwayDigest> {
  if (!isSupabaseConfigured()) return { kind: "activity", rows: DEMO_WHILE_YOU_WERE_AWAY_ROWS }

  const context = await getOrgSidebarContext()
  if (!context) return null

  const lastSeenIso = await getLastSeenIso()
  if (!lastSeenIso) return { kind: "caught_up" }

  const lastSeenMs = new Date(lastSeenIso).getTime()
  if (Number.isNaN(lastSeenMs)) return { kind: "caught_up" }

  const [conversations, overview, newCallCount] = await Promise.all([
    listConversations(context.orgId, { unreadOnly: true }),
    getOverviewStats(context.orgId, daysSince(lastSeenMs)),
    countCallsSince(context.orgId, lastSeenIso),
  ])

  const newConversationCount = conversations.filter(
    (conversation) => conversation.last_message_at && new Date(conversation.last_message_at).getTime() > lastSeenMs
  ).length

  const rows: ReceiptCardRow[] = []
  if (newConversationCount > 0) {
    rows.push({
      label: `New conversation${newConversationCount === 1 ? "" : "s"}`,
      value: String(newConversationCount),
    })
  }
  if (overview.leads > 0) {
    rows.push({ label: `New lead${overview.leads === 1 ? "" : "s"}`, value: String(overview.leads) })
  }
  if (overview.bookings > 0) {
    rows.push({ label: `New booking${overview.bookings === 1 ? "" : "s"}`, value: String(overview.bookings) })
  }
  // AI Phone Receptionist (wave V2) — env-gated on RETELL_API_KEY upstream;
  // countCallsSince simply returns 0 rows for an org that's never taken a
  // call, so this row silently stays absent until voice is actually live.
  if (newCallCount > 0) {
    rows.push({ label: `New call${newCallCount === 1 ? "" : "s"}`, value: String(newCallCount) })
  }

  return rows.length > 0 ? { kind: "activity", rows } : { kind: "caught_up" }
}
