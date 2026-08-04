import { createHmac } from "node:crypto"

import { describe, expect, it } from "vitest"

import {
  callDurationMinutes,
  estimateCallCostUsd,
  hasVoiceMinutesRemaining,
  mapPlainTranscriptToMessages,
  mapTranscriptToMessages,
  MAX_TRANSCRIPT_UTTERANCES,
  MAX_UTTERANCE_LENGTH,
  verifyRetellSignature,
} from "./webhook"

describe("verifyRetellSignature", () => {
  const apiKey = "test-key-123"
  const body = JSON.stringify({ event: "call_ended", call: { call_id: "abc" } })

  it("accepts a correctly signed body", () => {
    const signature = createHmac("sha256", apiKey).update(body, "utf8").digest("hex")
    expect(verifyRetellSignature(body, signature, apiKey)).toBe(true)
  })

  it("accepts a 'sha256=' prefixed signature", () => {
    const signature = createHmac("sha256", apiKey).update(body, "utf8").digest("hex")
    expect(verifyRetellSignature(body, `sha256=${signature}`, apiKey)).toBe(true)
  })

  it("rejects a wrong signature", () => {
    expect(verifyRetellSignature(body, "deadbeef", apiKey)).toBe(false)
  })

  it("rejects a missing signature header", () => {
    expect(verifyRetellSignature(body, null, apiKey)).toBe(false)
  })

  it("rejects when the body was tampered with", () => {
    const signature = createHmac("sha256", apiKey).update(body, "utf8").digest("hex")
    expect(verifyRetellSignature(body + "x", signature, apiKey)).toBe(false)
  })
})

describe("mapTranscriptToMessages", () => {
  it("maps agent turns to outbound ai_handled and user turns to inbound", () => {
    const mapped = mapTranscriptToMessages([
      { role: "agent", content: "Hi, thanks for calling!" },
      { role: "user", content: "Do you have any openings tomorrow?" },
    ])
    expect(mapped).toEqual([
      { direction: "outbound", body: "Hi, thanks for calling!", ai_handled: true },
      { direction: "inbound", body: "Do you have any openings tomorrow?", ai_handled: false },
    ])
  })

  it("accepts alternate field names (speaker/text)", () => {
    const mapped = mapTranscriptToMessages([{ speaker: "customer", text: "yes please" }])
    expect(mapped).toEqual([{ direction: "inbound", body: "yes please", ai_handled: false }])
  })

  it("returns [] for a missing/non-array transcript_object", () => {
    expect(mapTranscriptToMessages(undefined)).toEqual([])
    expect(mapTranscriptToMessages(null)).toEqual([])
  })

  it("skips entries with an unrecognized role or empty content", () => {
    const mapped = mapTranscriptToMessages([
      { role: "system", content: "internal note" },
      { role: "agent", content: "   " },
      { role: "user", content: "real question" },
    ])
    expect(mapped).toEqual([{ direction: "inbound", body: "real question", ai_handled: false }])
  })

  it("caps at MAX_TRANSCRIPT_UTTERANCES entries", () => {
    const long = Array.from({ length: MAX_TRANSCRIPT_UTTERANCES + 50 }, (_, i) => ({
      role: i % 2 === 0 ? "agent" : "user",
      content: `line ${i}`,
    }))
    expect(mapTranscriptToMessages(long)).toHaveLength(MAX_TRANSCRIPT_UTTERANCES)
  })

  it("truncates any single utterance to MAX_UTTERANCE_LENGTH", () => {
    const mapped = mapTranscriptToMessages([{ role: "user", content: "a".repeat(5000) }])
    expect(mapped[0].body).toHaveLength(MAX_UTTERANCE_LENGTH)
  })
})

describe("mapPlainTranscriptToMessages", () => {
  it("parses Agent:/User: prefixed lines", () => {
    const transcript = "Agent: hi there!\nUser: hey, are you open?\nAgent: yep, until 6pm"
    expect(mapPlainTranscriptToMessages(transcript)).toEqual([
      { direction: "outbound", body: "hi there!", ai_handled: true },
      { direction: "inbound", body: "hey, are you open?", ai_handled: false },
      { direction: "outbound", body: "yep, until 6pm", ai_handled: true },
    ])
  })

  it("returns [] for empty/missing input", () => {
    expect(mapPlainTranscriptToMessages(null)).toEqual([])
    expect(mapPlainTranscriptToMessages("")).toEqual([])
  })
})

describe("callDurationMinutes / estimateCallCostUsd", () => {
  it("rounds up partial minutes", () => {
    expect(callDurationMinutes(61)).toBe(2)
    expect(callDurationMinutes(60)).toBe(1)
    expect(callDurationMinutes(1)).toBe(1)
    expect(callDurationMinutes(0)).toBe(0)
  })

  it("estimates cost proportional to rounded-up minutes", () => {
    expect(estimateCallCostUsd(60)).toBeCloseTo(0.0785, 4)
    expect(estimateCallCostUsd(120)).toBeCloseTo(0.157, 4)
    expect(estimateCallCostUsd(0)).toBe(0)
  })
})

describe("hasVoiceMinutesRemaining", () => {
  it("is true when used is below cap", () => {
    expect(hasVoiceMinutesRemaining(10, 60)).toBe(true)
  })

  it("is false once used reaches or exceeds cap", () => {
    expect(hasVoiceMinutesRemaining(60, 60)).toBe(false)
    expect(hasVoiceMinutesRemaining(75, 60)).toBe(false)
  })

  it("fails closed for a non-positive cap", () => {
    expect(hasVoiceMinutesRemaining(0, 0)).toBe(false)
    expect(hasVoiceMinutesRemaining(0, -5)).toBe(false)
  })
})
