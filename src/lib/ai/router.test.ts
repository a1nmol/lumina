import { describe, expect, it } from "vitest"

import { estimateCostUsd, pickModel } from "./router"

// Guards the MASTER_PLAN §5 routing contract: cheapest-effective per job,
// customer-facing replies pinned to a paid Anthropic route (PII must never
// ride a free tier), and cost math that matches the pinned pricing table.

describe("pickModel routing table", () => {
  it("routes content generation to Gemini 2.5 Flash first", () => {
    expect(pickModel("content_gen")[0]).toBe("google/gemini-2.5-flash")
  })

  it("routes customer-facing replies to Claude Haiku first (PII-safe paid route)", () => {
    expect(pickModel("customer_reply")[0]).toBe("anthropic/claude-haiku-4.5")
  })

  it("never puts a free-tier model anywhere in the customer_reply chain", () => {
    for (const model of pickModel("customer_reply")) {
      expect(model).not.toMatch(/:free$/)
    }
  })

  it("routes classification to a free tier first (cheapest effective)", () => {
    expect(pickModel("classify")[0]).toMatch(/:free$/)
  })

  it("gives every job at least one fallback candidate", () => {
    for (const job of [
      "classify",
      "content_gen",
      "customer_reply",
      "reasoning",
      "vision_describe",
      "conversation_memory",
    ] as const) {
      expect(pickModel(job).length).toBeGreaterThanOrEqual(2)
    }
  })

  it("never puts a free-tier model anywhere in the vision_describe chain (real customer media)", () => {
    for (const model of pickModel("vision_describe")) {
      expect(model).not.toMatch(/:free$/)
    }
  })

  it("never puts a free-tier model anywhere in the conversation_memory chain (real customer content)", () => {
    for (const model of pickModel("conversation_memory")) {
      expect(model).not.toMatch(/:free$/)
    }
  })
})

describe("estimateCostUsd", () => {
  it("prices Gemini 2.5 Flash at $0.30/$2.50 per Mtok", () => {
    // 1M in + 1M out = 0.30 + 2.50
    expect(estimateCostUsd("google/gemini-2.5-flash", 1_000_000, 1_000_000)).toBe(2.8)
  })

  it("prices Claude Haiku 4.5 at $1/$5 per Mtok", () => {
    // 100k in = $0.10, 50k out = $0.25
    expect(estimateCostUsd("anthropic/claude-haiku-4.5", 100_000, 50_000)).toBe(0.35)
  })

  it("prices free-tier models at zero", () => {
    expect(estimateCostUsd("meta-llama/llama-3.1-8b-instruct:free", 500_000, 500_000)).toBe(0)
  })

  it("falls back to conservative default pricing for unknown model ids", () => {
    // Default $0.5/$1.5 per Mtok → 1M in + 1M out = 2.0
    expect(estimateCostUsd("someone/new-model", 1_000_000, 1_000_000)).toBe(2)
  })

  it("rounds to 6 decimal places (micro-dollar precision)", () => {
    const cost = estimateCostUsd("anthropic/claude-haiku-4.5", 123, 456)
    expect(cost).toBe(Math.round(cost * 1_000_000) / 1_000_000)
    expect(cost).toBeGreaterThan(0)
  })

  it("costs zero for zero tokens", () => {
    expect(estimateCostUsd("google/gemini-2.5-flash", 0, 0)).toBe(0)
  })
})
