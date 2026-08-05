import { describe, expect, it } from "vitest"

import { callOutcomeMeta, formatCallDuration, latestCall } from "./call-display"
import type { Call } from "@/lib/types"

function makeCall(overrides: Partial<Call> = {}): Call {
  return {
    id: "call-1",
    org_id: "org-1",
    conversation_id: "conversation-1",
    retell_call_id: "retell-1",
    from_number: "+15550101001",
    to_number: "+15550202000",
    started_at: "2026-07-01T12:00:00.000Z",
    ended_at: "2026-07-01T12:02:00.000Z",
    duration_secs: 120,
    outcome: "successful",
    summary: null,
    cost_usd: 0.16,
    created_at: "2026-07-01T12:00:00.000Z",
    ...overrides,
  }
}

describe("formatCallDuration", () => {
  it("formats seconds as m:ss", () => {
    expect(formatCallDuration(0)).toBe("0:00")
    expect(formatCallDuration(7)).toBe("0:07")
    expect(formatCallDuration(65)).toBe("1:05")
    expect(formatCallDuration(3661)).toBe("61:01")
  })

  it("returns null for missing/invalid durations", () => {
    expect(formatCallDuration(null)).toBeNull()
    expect(formatCallDuration(-5)).toBeNull()
    expect(formatCallDuration(Number.NaN)).toBeNull()
  })
})

describe("callOutcomeMeta", () => {
  it("maps the two normalized outcomes", () => {
    expect(callOutcomeMeta("successful")).toEqual({ label: "Successful", tone: "success" })
    expect(callOutcomeMeta("unsuccessful")).toEqual({ label: "Unsuccessful", tone: "warning" })
  })

  it("humanizes a raw disconnection-reason fallback", () => {
    expect(callOutcomeMeta("dial_busy")).toEqual({ label: "Dial busy", tone: "neutral" })
    expect(callOutcomeMeta("user_hangup")).toEqual({ label: "User hangup", tone: "neutral" })
  })

  it("handles null/empty outcome", () => {
    expect(callOutcomeMeta(null)).toEqual({ label: "Outcome unknown", tone: "neutral" })
    expect(callOutcomeMeta("  ")).toEqual({ label: "Outcome unknown", tone: "neutral" })
  })
})

describe("latestCall", () => {
  it("returns null for an empty list", () => {
    expect(latestCall([])).toBeNull()
  })

  it("picks the call with the most recent started_at, regardless of input order", () => {
    const older = makeCall({ id: "call-older", started_at: "2026-07-01T09:00:00.000Z" })
    const newer = makeCall({ id: "call-newer", started_at: "2026-07-03T09:00:00.000Z" })
    expect(latestCall([older, newer])?.id).toBe("call-newer")
    expect(latestCall([newer, older])?.id).toBe("call-newer")
  })

  it("treats a null started_at as oldest", () => {
    const noStart = makeCall({ id: "call-no-start", started_at: null })
    const withStart = makeCall({ id: "call-with-start", started_at: "2026-07-01T09:00:00.000Z" })
    expect(latestCall([noStart, withStart])?.id).toBe("call-with-start")
  })
})
