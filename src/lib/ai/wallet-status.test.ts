import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  WALLET_CACHE_TTL_MS,
  WALLET_CLOSE_THRESHOLD_USD,
  WALLET_HEADS_UP_THRESHOLD_USD,
  WALLET_SEED_THRESHOLD_USD,
  __resetWalletCacheForTests,
  fetchOpenRouterRemainingCredits,
  getWalletRemainingUsd,
  isWalletCacheFresh,
  walletWindDownStage,
} from "./wallet-status"

// -----------------------------------------------------------------------------
// walletWindDownStage — pure threshold mapping, mirrors frontdesk-reply.test.ts's
// windDownStage coverage shape.
// -----------------------------------------------------------------------------

describe("walletWindDownStage", () => {
  it("is 'none' for a null balance (unconfigured/unknown)", () => {
    expect(walletWindDownStage(null)).toBe("none")
  })

  it("is 'none' comfortably above the seed threshold", () => {
    expect(walletWindDownStage(50)).toBe("none")
    expect(walletWindDownStage(WALLET_SEED_THRESHOLD_USD + 0.01)).toBe("none")
  })

  it("is 'seed' at and below the seed threshold, above heads_up", () => {
    expect(walletWindDownStage(WALLET_SEED_THRESHOLD_USD)).toBe("seed")
    expect(walletWindDownStage(0.8)).toBe("seed")
    expect(walletWindDownStage(WALLET_HEADS_UP_THRESHOLD_USD + 0.01)).toBe("seed")
  })

  it("is 'heads_up' at and below the heads_up threshold, above close", () => {
    expect(walletWindDownStage(WALLET_HEADS_UP_THRESHOLD_USD)).toBe("heads_up")
    expect(walletWindDownStage(0.5)).toBe("heads_up")
    expect(walletWindDownStage(WALLET_CLOSE_THRESHOLD_USD + 0.01)).toBe("heads_up")
  })

  it("is 'close' at and below the close threshold, including zero and negative", () => {
    expect(walletWindDownStage(WALLET_CLOSE_THRESHOLD_USD)).toBe("close")
    expect(walletWindDownStage(0.1)).toBe("close")
    expect(walletWindDownStage(0)).toBe("close")
    expect(walletWindDownStage(-5)).toBe("close")
  })
})

// -----------------------------------------------------------------------------
// isWalletCacheFresh — pure TTL logic, extracted so the cache's decision rule
// is testable without a network mock.
// -----------------------------------------------------------------------------

describe("isWalletCacheFresh", () => {
  it("is fresh immediately after fetching", () => {
    expect(isWalletCacheFresh(1000, 1000)).toBe(true)
  })

  it("is fresh right up to (not including) the TTL boundary", () => {
    expect(isWalletCacheFresh(1000, 1000 + WALLET_CACHE_TTL_MS - 1)).toBe(true)
  })

  it("is stale at and beyond the TTL boundary", () => {
    expect(isWalletCacheFresh(1000, 1000 + WALLET_CACHE_TTL_MS)).toBe(false)
    expect(isWalletCacheFresh(1000, 1000 + WALLET_CACHE_TTL_MS + 1)).toBe(false)
  })

  it("respects a custom ttlMs override", () => {
    expect(isWalletCacheFresh(1000, 1500, 1000)).toBe(true)
    expect(isWalletCacheFresh(1000, 2500, 1000)).toBe(false)
  })
})

// -----------------------------------------------------------------------------
// fetchOpenRouterRemainingCredits — network fetch, mocked. Never throws.
// -----------------------------------------------------------------------------

describe("fetchOpenRouterRemainingCredits", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("returns null when OPENROUTER_API_KEY isn't configured", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "")
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)

    expect(await fetchOpenRouterRemainingCredits()).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("computes total_credits - total_usage on a healthy response", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key")
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ data: { total_credits: 10, total_usage: 7.5 } }) }))
    )

    expect(await fetchOpenRouterRemainingCredits()).toBe(2.5)
  })

  it("returns null on a non-ok response", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key")
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })))

    expect(await fetchOpenRouterRemainingCredits()).toBeNull()
  })

  it("returns null when the response is missing expected fields", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key")
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ data: {} }) })))

    expect(await fetchOpenRouterRemainingCredits()).toBeNull()
  })

  it("returns null when fetch throws", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key")
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down")
      })
    )

    expect(await fetchOpenRouterRemainingCredits()).toBeNull()
  })
})

// -----------------------------------------------------------------------------
// getWalletRemainingUsd — the cached, hot-path-safe wrapper.
// -----------------------------------------------------------------------------

describe("getWalletRemainingUsd", () => {
  beforeEach(() => {
    __resetWalletCacheForTests()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    __resetWalletCacheForTests()
  })

  it("fetches once and serves the cached value on subsequent calls within the TTL", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key")
    const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => ({ data: { total_credits: 5, total_usage: 4 } }) }))
    vi.stubGlobal("fetch", fetchSpy)

    const first = await getWalletRemainingUsd(1000)
    const second = await getWalletRemainingUsd(1000 + WALLET_CACHE_TTL_MS - 1)

    expect(first).toBe(1)
    expect(second).toBe(1)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it("refetches once the TTL has elapsed", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key")
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { total_credits: 5, total_usage: 4 } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { total_credits: 5, total_usage: 4.7 } }) })
    vi.stubGlobal("fetch", fetchSpy)

    const first = await getWalletRemainingUsd(1000)
    const second = await getWalletRemainingUsd(1000 + WALLET_CACHE_TTL_MS)

    expect(first).toBe(1)
    expect(second).toBeCloseTo(0.3)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it("caches a null (failed/unconfigured) result too, rather than retrying every call", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "")
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)

    expect(await getWalletRemainingUsd(1000)).toBeNull()
    expect(await getWalletRemainingUsd(1000 + 1)).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
