import "server-only"

// Minimal rate limiter for the public, unauthenticated early-access form
// (src/app/(marketing)/actions.ts#saveEarlyAccessLead). Thin wrapper around
// the shared core (src/lib/rate-limit.ts) — see that module's header for the
// process-local/cold-start tradeoffs (same ones src/app/api/frontdesk/
// _shared.ts's checkRateLimit accepts). Kept as its own small module rather
// than importing api/frontdesk/_shared.ts directly since that file lives
// under the API route tree for HTTP-layer concerns specific to those two
// routes, not a general-purpose shared utility.

import { createRateLimiter } from "@/lib/rate-limit"

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 5

const limiter = createRateLimiter(RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX)

/** True if `key` (e.g. an IP address) is still under the 5-submissions-per-minute cap. */
export function checkMarketingRateLimit(key: string): boolean {
  return limiter.check(key)
}
