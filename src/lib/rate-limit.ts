import "server-only"

// Generic, process-local in-memory rate limiter shared by every public,
// unauthenticated write endpoint in the app — the early-access form
// (src/lib/marketing/rate-limit.ts) and the two public FrontDesk routes
// (src/app/api/frontdesk/_shared.ts, kept as thin re-exports so those
// routes' imports don't churn). One implementation, one set of tradeoffs
// documented once instead of twice:
//
// Process-local, resets on cold start/redeploy, and isn't shared across
// serverless instances — acceptable for the invite-only test phase per
// MASTER_PLAN.md §3 ("cost obsession... at test scale"). A durable
// per-org/per-visitor limiter (e.g. a Postgres or Redis counter) is the
// natural upgrade once this runs on multiple instances.

interface RateLimitEntry {
  count: number
  windowStart: number
}

export interface RateLimiter {
  /**
   * True if `key` is still under the cap for this window; false once the
   * cap is hit. Opportunistically sweeps stale buckets on every call (see
   * `sweep`) so callers never have to remember to do it themselves.
   */
  check(key: string): boolean
  /** Drops buckets whose window has fully elapsed, so the map doesn't grow unbounded across a long-lived process. Called automatically by `check`; exposed for callers that want to sweep independent of a check (e.g. on every request, before validating). */
  sweep(): void
}

/** Builds an isolated rate limiter with its own bucket map, window, and cap. */
export function createRateLimiter(windowMs: number, max: number): RateLimiter {
  const buckets = new Map<string, RateLimitEntry>()

  function sweep(): void {
    const now = Date.now()
    for (const [key, entry] of buckets) {
      if (now - entry.windowStart > windowMs) buckets.delete(key)
    }
  }

  function check(key: string): boolean {
    // Sweep on every check (not just once per request) — cheap (O(live
    // buckets)) and guarantees the map never outlives a caller that forgets
    // to sweep explicitly.
    sweep()

    const now = Date.now()
    const entry = buckets.get(key)

    if (!entry || now - entry.windowStart > windowMs) {
      buckets.set(key, { count: 1, windowStart: now })
      return true
    }

    if (entry.count >= max) return false

    entry.count += 1
    return true
  }

  return { check, sweep }
}
