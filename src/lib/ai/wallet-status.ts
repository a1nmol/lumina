import "server-only"

// OpenRouter ACCOUNT WALLET status (Outlast wave — never-go-dark hotfix,
// 2026-08-02 outage). The graceful wind-down ladder in ./frontdesk-reply.ts
// (windDownStage) only watches the PER-ORG monthly allowance
// (getAiRepliesUsageFraction) — it has no idea the platform's own OpenRouter
// wallet is about to hit $0. That's exactly what happened live: the wallet
// ran dry, every candidate model 402'd, and customers got ghosted mid-
// conversation with zero warning, because the ladder never saw it coming.
//
// This module gives draftCustomerReply (and follow-ups.ts) a second,
// independent signal — how much is left in the account wallet, not the org's
// slice of it — so the SAME graceful directives fire even when an org is
// nowhere near its own allowance. See frontdesk-reply.ts's
// maxWindDownStage, which takes the more urgent of the two stages.
//
// The credits fetch itself used to live in src/lib/watchdog.ts (a 6h/daily
// cron check). It's extracted here, unchanged in behavior, so BOTH the cron
// and the hot reply path share one implementation — watchdog.ts now imports
// fetchOpenRouterRemainingCredits from here instead of duplicating it.
//
// Hot-path cost: draftCustomerReply runs on every single inbound message
// across every channel, so this can't add a network round-trip per reply. A
// simple module-level cache (value + fetchedAt, 10-minute TTL) means at most
// one extra fetch per warm lambda instance per 10 minutes — effectively free
// on the request path it actually gates.

const OPENROUTER_CREDITS_URL = "https://openrouter.ai/api/v1/credits"

interface OpenRouterCreditsResponse {
  data?: { total_credits?: number; total_usage?: number }
}

/**
 * Fetches the OpenRouter account's remaining credits directly (no cache —
 * see getWalletRemainingUsd below for the cached, hot-path-safe version).
 * Defensive by design: any network/parse failure just logs and returns
 * null — this never throws, so it can never itself take down a caller.
 */
export async function fetchOpenRouterRemainingCredits(): Promise<number | null> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return null

  try {
    const res = await fetch(OPENROUTER_CREDITS_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    })
    if (!res.ok) {
      console.error(`[wallet-status] OpenRouter credits fetch failed (${res.status})`)
      return null
    }
    const json = (await res.json()) as OpenRouterCreditsResponse
    const totalCredits = json.data?.total_credits
    const totalUsage = json.data?.total_usage
    if (typeof totalCredits !== "number" || typeof totalUsage !== "number") {
      console.error("[wallet-status] OpenRouter credits response missing expected fields")
      return null
    }
    return totalCredits - totalUsage
  } catch (error) {
    console.error("[wallet-status] OpenRouter credits fetch threw", error)
    return null
  }
}

// --- Hot-path cache -----------------------------------------------------------

export const WALLET_CACHE_TTL_MS = 10 * 60 * 1000

interface WalletCacheEntry {
  value: number | null
  fetchedAt: number
}

/** True iff a cache entry fetched at `fetchedAt` is still fresh at `now`, given `ttlMs`. Pure, exported for unit tests — the only piece of the cache worth testing without a network mock. */
export function isWalletCacheFresh(fetchedAt: number, now: number, ttlMs: number = WALLET_CACHE_TTL_MS): boolean {
  return now - fetchedAt < ttlMs
}

let cache: WalletCacheEntry | null = null

/** Test-only escape hatch so wallet-status.test.ts can reset module state between cases. Not exported from the package's public surface conceptually — just a plain export other test files shouldn't reach for. */
export function __resetWalletCacheForTests(): void {
  cache = null
}

/**
 * Cached, hot-path-safe read of the account wallet's remaining credits.
 * Serves the last fetched value for WALLET_CACHE_TTL_MS (10 minutes) before
 * refetching — draftCustomerReply calls this on every reply, so this keeps
 * the added cost at effectively one extra request per warm lambda instance
 * per 10 minutes. Null on any failure/unconfigured (never throws), matching
 * fetchOpenRouterRemainingCredits.
 */
export async function getWalletRemainingUsd(now: number = Date.now()): Promise<number | null> {
  if (cache && isWalletCacheFresh(cache.fetchedAt, now)) {
    return cache.value
  }

  // No in-flight coalescing by design: two concurrent callers racing a stale
  // cache both fetch once — bounded to the TTL boundary, idempotent GET,
  // accepted over promise-memoization complexity.
  const value = await fetchOpenRouterRemainingCredits()
  cache = { value, fetchedAt: now }
  return value
}

// --- Wallet wind-down thresholds ------------------------------------------

// Deliberately tighter than watchdog.ts's OPENROUTER_CREDITS_LOW_USD/EMPTY_USD
// (which page an admin at $3 / $0.25) — these gate what the CUSTOMER sees, so
// they need enough runway for the seed -> heads_up -> close cues to actually
// land across a live conversation before the wallet hits true $0 and every
// candidate model starts 402'ing outright.
export const WALLET_SEED_THRESHOLD_USD = 1.0
export const WALLET_HEADS_UP_THRESHOLD_USD = 0.6
export const WALLET_CLOSE_THRESHOLD_USD = 0.4

/**
 * Stages of the graceful, wallet-aware wind-down — same shape as
 * frontdesk-reply.ts's WindDownStage (kept as a plain, independent string
 * union here rather than importing that type, so this module has zero
 * dependency on frontdesk-reply.ts and there's no import cycle to reason
 * about). Pure: no I/O, no clock — safe to unit test directly with plain
 * numbers, mirroring windDownStage's own test shape.
 */
export type WalletWindDownStage = "none" | "seed" | "heads_up" | "close"

/**
 * Maps the account wallet's remaining USD (null = unconfigured/unknown) to a
 * wind-down stage. Pure, exported for unit tests.
 */
export function walletWindDownStage(remainingUsd: number | null): WalletWindDownStage {
  if (remainingUsd === null) return "none"
  if (remainingUsd <= WALLET_CLOSE_THRESHOLD_USD) return "close"
  if (remainingUsd <= WALLET_HEADS_UP_THRESHOLD_USD) return "heads_up"
  if (remainingUsd <= WALLET_SEED_THRESHOLD_USD) return "seed"
  return "none"
}
