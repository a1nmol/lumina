// Pure helpers for the Instagram echo-event handler
// (src/app/api/webhooks/instagram/route.ts's handleEchoMessagingEvent) — no
// I/O, safe to unit test directly, mirrors the convention set by
// src/lib/social/instagram-attachments.ts and src/lib/ai/conversation-memory.ts's
// "pure helpers" section.
//
// Echoes (Meta's copy-back of an OUTBOUND message the connected account
// itself sent) need a THIRD dedupe layer beyond the message.mid check
// already used for inbound messages: a message WE just sent via the Graph
// API can have its echo arrive before our own insert (which now stores the
// send's message_id as metadata.instagram_mid, see
// src/lib/social/instagram-messaging.ts#SendInstagramMessageResult) has
// committed. isDuplicateOfRecentSend below is that race-window fallback —
// find a recent, not-yet-tagged outbound message with the exact same body
// and backfill its mid instead of inserting a duplicate row.

/** The subset of a `messages` row this helper needs — matches src/lib/types.ts#Message's shape for the fields used. */
export interface DedupeCandidateMessage {
  id: string
  direction: string
  /** Only kind "message" rows are dedupe candidates — internal notes (kind "note") are also direction "outbound" and could carry the exact same text the owner then really sends (review-caught: matching a note would silently drop the genuine echo AND mislabel the note as a delivered DM). */
  kind: string
  body: string | null
  created_at: string
  metadata: Record<string, unknown> | null
}

/** How recent an outbound message must be to be considered a possible race with an inbound echo of our own send. */
export const RECENT_SEND_DEDUPE_WINDOW_MS = 120_000

/**
 * Finds an existing OUTBOUND message in `messages` whose body exactly
 * matches `body` (after trimming), was created within
 * RECENT_SEND_DEDUPE_WINDOW_MS of `now`, and doesn't already carry an
 * `instagram_mid` — i.e. a message we very likely just sent ourselves,
 * whose mid hasn't been recorded yet. Returns null when there's no such
 * candidate (nothing to dedupe against, or the only matches already have a
 * mid — those are handled by the mid-based dedupe layer instead, never
 * double-matched here).
 *
 * Never matches inbound messages, blank bodies, or a message outside the
 * window (including one that's somehow in the future — a clock skew safety
 * check, not expected in practice).
 */
export function isDuplicateOfRecentSend(
  messages: DedupeCandidateMessage[],
  body: string,
  now: number
): DedupeCandidateMessage | null {
  const trimmedBody = body.trim()
  if (!trimmedBody) return null

  for (const message of messages) {
    if (message.direction !== "outbound") continue
    if (message.kind !== "message") continue // never match internal notes — see DedupeCandidateMessage.kind
    if ((message.body ?? "").trim() !== trimmedBody) continue

    const metadata = message.metadata ?? {}
    const existingMid = metadata.instagram_mid
    if (typeof existingMid === "string" && existingMid.trim()) continue // already reconciled — not this layer's job.

    const ageMs = now - new Date(message.created_at).getTime()
    if (ageMs < 0 || ageMs > RECENT_SEND_DEDUPE_WINDOW_MS) continue

    return message
  }

  return null
}
