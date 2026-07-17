import "server-only"

// Small validation + rate-limit helpers shared by the two public FrontDesk
// routes (chat, missed-call). Colocated here rather than in src/lib/** —
// these are HTTP-layer concerns (request shape, abuse limiting) specific to
// these two public, unauthenticated endpoints, not general business logic.

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

interface RateLimitEntry {
  count: number
  windowStart: number
}

/**
 * Process-local in-memory rate limit. Resets on cold start/redeploy and
 * isn't shared across serverless instances — acceptable for the invite-only
 * test phase per MASTER_PLAN.md §3 ("cost obsession... at test scale"). A
 * durable per-org/per-visitor limiter (e.g. a Postgres or Redis counter)
 * is the natural upgrade once this runs on multiple instances.
 */
const rateLimitBuckets = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 10

/** True if `key` (e.g. `${orgSlug}:${visitorId}`) is still under the 10-messages-per-minute cap. */
export function checkRateLimit(key: string): boolean {
  const now = Date.now()
  const entry = rateLimitBuckets.get(key)

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitBuckets.set(key, { count: 1, windowStart: now })
    return true
  }

  if (entry.count >= RATE_LIMIT_MAX) return false

  entry.count += 1
  return true
}

/** Opportunistic cleanup so the map doesn't grow unbounded across a long-lived process. */
export function sweepStaleRateLimitBuckets(): void {
  const now = Date.now()
  for (const [key, entry] of rateLimitBuckets) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) rateLimitBuckets.delete(key)
  }
}
