import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createRateLimiter } from "./rate-limit"

// The process-local limiter guarding every public unauthenticated write
// endpoint (early-access form, public FrontDesk routes).

describe("createRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("allows up to the cap within a window", () => {
    const limiter = createRateLimiter(60_000, 3)
    expect(limiter.check("a")).toBe(true)
    expect(limiter.check("a")).toBe(true)
    expect(limiter.check("a")).toBe(true)
  })

  it("blocks the request that exceeds the cap", () => {
    const limiter = createRateLimiter(60_000, 2)
    limiter.check("a")
    limiter.check("a")
    expect(limiter.check("a")).toBe(false)
    expect(limiter.check("a")).toBe(false)
  })

  it("tracks keys independently", () => {
    const limiter = createRateLimiter(60_000, 1)
    expect(limiter.check("a")).toBe(true)
    expect(limiter.check("b")).toBe(true)
    expect(limiter.check("a")).toBe(false)
    expect(limiter.check("b")).toBe(false)
  })

  it("resets a key once its window has fully elapsed", () => {
    const limiter = createRateLimiter(60_000, 1)
    expect(limiter.check("a")).toBe(true)
    expect(limiter.check("a")).toBe(false)
    vi.advanceTimersByTime(60_001)
    expect(limiter.check("a")).toBe(true)
  })

  it("does not reset before the window elapses", () => {
    const limiter = createRateLimiter(60_000, 1)
    limiter.check("a")
    vi.advanceTimersByTime(59_999)
    expect(limiter.check("a")).toBe(false)
  })

  it("isolates limiter instances from each other", () => {
    const first = createRateLimiter(60_000, 1)
    const second = createRateLimiter(60_000, 1)
    expect(first.check("a")).toBe(true)
    expect(second.check("a")).toBe(true)
  })

  it("sweep drops stale buckets so a swept key starts a fresh window", () => {
    const limiter = createRateLimiter(1_000, 1)
    limiter.check("stale")
    vi.advanceTimersByTime(1_001)
    limiter.sweep()
    expect(limiter.check("stale")).toBe(true)
  })
})
