// Shared display formatting for `calls` rows (AI Phone Receptionist,
// migration 0020) — used by both the Inbox's call-header strip
// (src/components/inbox/call-header.tsx) and the contact profile's activity
// timeline (src/app/(app)/contacts/[id]/activity-timeline.tsx) so the two
// surfaces describe the same call the same way. Pure, zero I/O — safe to
// import from client components, unit-tested directly in
// call-display.test.ts.

import type { Call } from "@/lib/types"

/** "3:07" style duration — null input (call still in progress / never connected) renders as an em dash by the caller, not here (this stays a pure formatter, no display-string opinions beyond the number itself). */
export function formatCallDuration(durationSecs: number | null): string | null {
  if (durationSecs === null || !Number.isFinite(durationSecs) || durationSecs < 0) return null
  const minutes = Math.floor(durationSecs / 60)
  const seconds = Math.round(durationSecs % 60)
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

export type CallOutcomeTone = "success" | "warning" | "neutral"

export interface CallOutcomeMeta {
  label: string
  tone: CallOutcomeTone
}

/**
 * Retell's `outcome` column is either the two normalized values this
 * codebase writes ("successful" / "unsuccessful" — see
 * src/app/api/webhooks/retell/route.ts) or a raw Retell disconnection
 * reason string (e.g. "dial_busy", "user_hangup") when call_analysis didn't
 * resolve a clean success/fail. Humanizes the fallback case rather than
 * showing a raw snake_case string.
 */
export function callOutcomeMeta(outcome: string | null): CallOutcomeMeta {
  if (outcome === "successful") return { label: "Successful", tone: "success" }
  if (outcome === "unsuccessful") return { label: "Unsuccessful", tone: "warning" }
  if (!outcome || !outcome.trim()) return { label: "Outcome unknown", tone: "neutral" }

  const humanized = outcome
    .trim()
    .replace(/_/g, " ")
    .replace(/^./, (char) => char.toUpperCase())
  return { label: humanized, tone: "neutral" }
}

/** The most recent call in a list (calls are ordered most-recent-first by getCallsForConversation, but this stays defensive rather than assuming caller order). */
export function latestCall(calls: Call[]): Call | null {
  if (calls.length === 0) return null
  return [...calls].sort((a, b) => {
    const aTime = a.started_at ? new Date(a.started_at).getTime() : 0
    const bTime = b.started_at ? new Date(b.started_at).getTime() : 0
    return bTime - aTime
  })[0]
}
