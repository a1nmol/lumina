import "server-only"

// Small validation + rate-limit helpers shared by the two public FrontDesk
// routes (chat, missed-call). Colocated here rather than in src/lib/** —
// these are HTTP-layer concerns (request shape, abuse limiting) specific to
// these two public, unauthenticated endpoints, not general business logic.
// The rate-limit primitives themselves are thin re-exports of the shared
// core (src/lib/rate-limit.ts, also used by src/lib/marketing/rate-limit.ts)
// so both public surfaces share one implementation — the names stay the
// same as before so callers (chat/route.ts) don't need to change.

import { createRateLimiter } from "@/lib/rate-limit"

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const MAX_MESSAGE_LENGTH = 1000
export const MIN_MESSAGE_LENGTH = 1
/** Lenient E.164-ish phone check — digits/spaces/dashes/parens, optional leading +, 7-20 chars. */
export const PHONE_RE = /^\+?[0-9()\-\s]{7,20}$/

export function isValidMessageBody(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= MIN_MESSAGE_LENGTH && value.trim().length <= MAX_MESSAGE_LENGTH
}

export function isValidVisitorId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value)
}

export function isValidPhone(value: unknown): value is string {
  return typeof value === "string" && PHONE_RE.test(value.trim())
}

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 10

const limiter = createRateLimiter(RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX)

/** True if `key` (e.g. `${orgSlug}:${visitorId}`) is still under the 10-messages-per-minute cap. Also sweeps stale buckets (see `sweepStaleRateLimitBuckets`) on every call. */
export function checkRateLimit(key: string): boolean {
  return limiter.check(key)
}

/** Thin re-export of the shared limiter's sweep — kept for callers (chat/route.ts) that sweep explicitly once per request; `checkRateLimit` above also sweeps on every call, so this is now belt-and-suspenders rather than load-bearing. */
export function sweepStaleRateLimitBuckets(): void {
  limiter.sweep()
}
