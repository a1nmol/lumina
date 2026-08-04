import { describe, expect, it } from "vitest"

import {
  OPENROUTER_CREDITS_EMPTY_USD,
  OPENROUTER_CREDITS_LOW_USD,
  TOKEN_EXPIRY_WARNING_DAYS,
  USAGE_CRITICAL_FRACTION,
  USAGE_WARN_FRACTION,
  WEBHOOK_SILENCE_THRESHOLD_MS,
  WEBHOOK_TRAFFIC_LOOKBACK_MS,
  classifyOpenRouterCredits,
  classifyTokenExpiry,
  classifyUsageBurn,
  classifyVoiceMinutesBurn,
  isWebhookSilent,
  shouldSendWatchdogAlert,
  trafficLookbackWindow,
} from "./watchdog"

// -----------------------------------------------------------------------------
// classifyOpenRouterCredits
// -----------------------------------------------------------------------------

describe("classifyOpenRouterCredits", () => {
  it("returns null when credits are healthy", () => {
    expect(classifyOpenRouterCredits(50)).toBeNull()
    expect(classifyOpenRouterCredits(OPENROUTER_CREDITS_LOW_USD)).toBeNull() // exactly at the boundary is still healthy (< not <=)
  })

  it("flags 'low' just under the low threshold", () => {
    expect(classifyOpenRouterCredits(OPENROUTER_CREDITS_LOW_USD - 0.01)).toEqual({
      kind: "openrouter_credits_low",
      severity: "warning",
    })
  })

  it("flags 'empty' at and below the empty threshold", () => {
    expect(classifyOpenRouterCredits(OPENROUTER_CREDITS_EMPTY_USD)).toEqual({
      kind: "openrouter_credits_empty",
      severity: "critical",
    })
    expect(classifyOpenRouterCredits(0)).toEqual({ kind: "openrouter_credits_empty", severity: "critical" })
    expect(classifyOpenRouterCredits(-1)).toEqual({ kind: "openrouter_credits_empty", severity: "critical" })
  })
})

// -----------------------------------------------------------------------------
// classifyUsageBurn
// -----------------------------------------------------------------------------

describe("classifyUsageBurn", () => {
  it("returns null below the warn threshold", () => {
    expect(classifyUsageBurn(0)).toBeNull()
    expect(classifyUsageBurn(0.5)).toBeNull()
    expect(classifyUsageBurn(USAGE_WARN_FRACTION - 0.01)).toBeNull()
  })

  it("flags usage_80 at and above the warn threshold, below critical", () => {
    expect(classifyUsageBurn(USAGE_WARN_FRACTION)).toEqual({ kind: "usage_80", severity: "warning" })
    expect(classifyUsageBurn(0.9)).toEqual({ kind: "usage_80", severity: "warning" })
  })

  it("flags usage_95 at and above the critical threshold", () => {
    expect(classifyUsageBurn(USAGE_CRITICAL_FRACTION)).toEqual({ kind: "usage_95", severity: "critical" })
    expect(classifyUsageBurn(1.2)).toEqual({ kind: "usage_95", severity: "critical" }) // can exceed 100% briefly (check-then-act race, see usage.ts)
  })
})

// -----------------------------------------------------------------------------
// classifyVoiceMinutesBurn
// -----------------------------------------------------------------------------

describe("classifyVoiceMinutesBurn", () => {
  it("returns null below the warn threshold", () => {
    expect(classifyVoiceMinutesBurn(0)).toBeNull()
    expect(classifyVoiceMinutesBurn(USAGE_WARN_FRACTION - 0.01)).toBeNull()
  })

  it("flags voice_minutes_80 at and above the warn threshold, with no critical tier", () => {
    expect(classifyVoiceMinutesBurn(USAGE_WARN_FRACTION)).toEqual({ kind: "voice_minutes_80", severity: "warning" })
    expect(classifyVoiceMinutesBurn(1.5)).toEqual({ kind: "voice_minutes_80", severity: "warning" })
  })
})

// -----------------------------------------------------------------------------
// classifyTokenExpiry
// -----------------------------------------------------------------------------

describe("classifyTokenExpiry", () => {
  const now = new Date("2026-08-01T00:00:00.000Z")

  it("returns null when there's plenty of runway", () => {
    const farFuture = new Date(now.getTime() + (TOKEN_EXPIRY_WARNING_DAYS + 5) * 24 * 60 * 60 * 1000)
    expect(classifyTokenExpiry(farFuture, now)).toBeNull()
  })

  it("flags token_expiring within the warning window", () => {
    const soon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
    const result = classifyTokenExpiry(soon, now)
    expect(result?.kind).toBe("token_expiring")
    expect(result?.severity).toBe("warning")
    expect(result?.daysLeft).toBe(3)
  })

  it("flags token_expired once the expiry has passed", () => {
    const past = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)
    const result = classifyTokenExpiry(past, now)
    expect(result?.kind).toBe("token_expired")
    expect(result?.severity).toBe("critical")
    expect(result?.daysLeft).toBe(-2)
  })

  it("flags token_expired exactly at the boundary (expires right now)", () => {
    const result = classifyTokenExpiry(now, now)
    expect(result?.kind).toBe("token_expired")
  })
})

// -----------------------------------------------------------------------------
// shouldSendWatchdogAlert (dedupe window logic)
// -----------------------------------------------------------------------------

describe("shouldSendWatchdogAlert", () => {
  const now = new Date("2026-08-01T12:00:00.000Z")

  it("always sends when there's no prior send", () => {
    expect(shouldSendWatchdogAlert(null, now, "usage_80")).toBe(true)
  })

  it("suppresses a resend within the 24h window for most kinds", () => {
    const twentyHoursAgo = new Date(now.getTime() - 20 * 60 * 60 * 1000)
    expect(shouldSendWatchdogAlert(twentyHoursAgo, now, "usage_80")).toBe(false)
    expect(shouldSendWatchdogAlert(twentyHoursAgo, now, "openrouter_credits_empty")).toBe(false)
    expect(shouldSendWatchdogAlert(twentyHoursAgo, now, "webhook_silent")).toBe(false)
  })

  it("allows a resend once 24h has passed for most kinds", () => {
    const twentyFiveHoursAgo = new Date(now.getTime() - 25 * 60 * 60 * 1000)
    expect(shouldSendWatchdogAlert(twentyFiveHoursAgo, now, "usage_95")).toBe(true)
    expect(shouldSendWatchdogAlert(twentyFiveHoursAgo, now, "token_expired")).toBe(true)
  })

  it("uses a longer 48h window specifically for token_expiring", () => {
    const twentyFiveHoursAgo = new Date(now.getTime() - 25 * 60 * 60 * 1000)
    // Would resend under the default 24h window, but token_expiring's window is 48h.
    expect(shouldSendWatchdogAlert(twentyFiveHoursAgo, now, "token_expiring")).toBe(false)

    const fortyNineHoursAgo = new Date(now.getTime() - 49 * 60 * 60 * 1000)
    expect(shouldSendWatchdogAlert(fortyNineHoursAgo, now, "token_expiring")).toBe(true)
  })
})

// -----------------------------------------------------------------------------
// Webhook liveness
// -----------------------------------------------------------------------------

describe("isWebhookSilent", () => {
  const now = new Date("2026-08-01T00:00:00.000Z")

  it("is never silent when the last receipt is within the threshold, even with prior traffic", () => {
    const recent = new Date(now.getTime() - (WEBHOOK_SILENCE_THRESHOLD_MS - 60_000))
    expect(isWebhookSilent({ now, lastInstagramReceiptAt: recent, hadTrafficBeforeSilenceWindow: true })).toBe(false)
  })

  it("does not alert a quiet account (no prior traffic) even after a long silence", () => {
    const longAgo = new Date(now.getTime() - WEBHOOK_SILENCE_THRESHOLD_MS - 60_000)
    expect(isWebhookSilent({ now, lastInstagramReceiptAt: longAgo, hadTrafficBeforeSilenceWindow: false })).toBe(false)
  })

  it("alerts once silence exceeds the threshold AND the org had traffic right before it", () => {
    const longAgo = new Date(now.getTime() - WEBHOOK_SILENCE_THRESHOLD_MS - 60_000)
    expect(isWebhookSilent({ now, lastInstagramReceiptAt: longAgo, hadTrafficBeforeSilenceWindow: true })).toBe(true)
  })

  it("treats 'no receipt ever recorded' as maximally silent, still gated by the traffic condition", () => {
    expect(isWebhookSilent({ now, lastInstagramReceiptAt: null, hadTrafficBeforeSilenceWindow: false })).toBe(false)
    expect(isWebhookSilent({ now, lastInstagramReceiptAt: null, hadTrafficBeforeSilenceWindow: true })).toBe(true)
  })

  it("is not silent exactly at the threshold boundary (strictly greater-than-or-equal alerts, not under)", () => {
    const exactlyAtThreshold = new Date(now.getTime() - WEBHOOK_SILENCE_THRESHOLD_MS)
    expect(isWebhookSilent({ now, lastInstagramReceiptAt: exactlyAtThreshold, hadTrafficBeforeSilenceWindow: true })).toBe(true)
  })
})

describe("trafficLookbackWindow", () => {
  it("spans exactly the 7 days immediately before the silence window start", () => {
    const silenceStart = new Date("2026-08-01T00:00:00.000Z")
    const { from, to } = trafficLookbackWindow(silenceStart)
    expect(to).toEqual(silenceStart)
    expect(silenceStart.getTime() - from.getTime()).toBe(WEBHOOK_TRAFFIC_LOOKBACK_MS)
  })
})
