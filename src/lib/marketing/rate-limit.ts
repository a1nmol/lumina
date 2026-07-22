import "server-only"

// Minimal in-memory rate limiter for the public, unauthenticated early-
// access form (src/app/(marketing)/actions.ts#saveEarlyAccessLead). Same
// shape and the same "acceptable at invite-only test scale" tradeoff as
// src/app/api/frontdesk/_shared.ts's checkRateLimit (process-local, resets
// on cold start, not shared across serverless instances) — kept as a
// separate small module rather than importing from api/frontdesk/_shared.ts
// since that file lives under the API route tree for HTTP-layer concerns
// specific to those two routes, not a general-purpose shared utility.

interface RateLimitEntry {
  count: number
  windowStart: number
}

const rateLimitBuckets = new Map<string, RateLimitEntry>()
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 5

/** True if `key` (e.g. an IP address) is still under the 5-submissions-per-minute cap. */
export function checkMarketingRateLimit(key: string): boolean {
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
