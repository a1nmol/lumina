import { describe, expect, it } from "vitest"

import {
  buildMemoryPromptLines,
  capConversationMemory,
  formatMemoryForPrompt,
  lastOutboundAiTimestamp,
  parseConversationMemory,
  shouldUpdateMemory,
  type ConversationMemory,
} from "./conversation-memory"

const FULL_MEMORY: ConversationMemory = {
  facts: ["wants a custom birthday cake", "picking up Saturday"],
  open_threads: ["waiting on a flavor decision"],
  vibe: "friendly regular, casual texter",
  summary: "Asked about birthday cakes, we quoted $45 with 48h notice, they're deciding on a flavor.",
  updated_at: "2026-08-01T00:00:00.000Z",
  message_count: 6,
}

describe("parseConversationMemory", () => {
  it("parses a well-formed memory object", () => {
    expect(parseConversationMemory(FULL_MEMORY)).toEqual(FULL_MEMORY)
  })

  it("returns null for non-objects", () => {
    expect(parseConversationMemory(null)).toBeNull()
    expect(parseConversationMemory(undefined)).toBeNull()
    expect(parseConversationMemory("a string")).toBeNull()
    expect(parseConversationMemory(42)).toBeNull()
    expect(parseConversationMemory(["array", "not", "object"])).toBeNull()
  })

  it("returns null when every field is empty (nothing usable)", () => {
    expect(parseConversationMemory({})).toBeNull()
    expect(
      parseConversationMemory({ facts: [], open_threads: [], vibe: "", summary: "", message_count: 0 })
    ).toBeNull()
  })

  it("keeps a partial memory usable when at least one field has content", () => {
    const result = parseConversationMemory({ summary: "Just started chatting about hours." })
    expect(result).not.toBeNull()
    expect(result?.summary).toBe("Just started chatting about hours.")
    expect(result?.facts).toEqual([])
    expect(result?.open_threads).toEqual([])
  })

  it("filters out non-string entries in facts/open_threads defensively", () => {
    const result = parseConversationMemory({
      facts: ["real fact", 42, null, "  ", "another fact"],
      open_threads: [true, "real thread"],
    })
    expect(result?.facts).toEqual(["real fact", "another fact"])
    expect(result?.open_threads).toEqual(["real thread"])
  })

  it("falls back to a safe message_count/updated_at on malformed values", () => {
    const result = parseConversationMemory({ summary: "hi", message_count: "not a number", updated_at: 12345 })
    expect(result?.message_count).toBe(0)
    expect(result?.updated_at).toBe(new Date(0).toISOString())
  })

  it("floors a fractional message_count and rejects negative counts", () => {
    expect(parseConversationMemory({ summary: "hi", message_count: 6.9 })?.message_count).toBe(6)
    expect(parseConversationMemory({ summary: "hi", message_count: -3 })?.message_count).toBe(0)
  })

  it("rejects an unparseable updated_at string", () => {
    const result = parseConversationMemory({ summary: "hi", updated_at: "not-a-date" })
    expect(result?.updated_at).toBe(new Date(0).toISOString())
  })
})

describe("shouldUpdateMemory", () => {
  it("is false with no memory below the first-update threshold", () => {
    expect(shouldUpdateMemory(null, 0)).toBe(false)
    expect(shouldUpdateMemory(null, 5)).toBe(false)
  })

  it("is true with no memory once the thread reaches 6 messages", () => {
    expect(shouldUpdateMemory(null, 6)).toBe(true)
    expect(shouldUpdateMemory(null, 9)).toBe(true)
  })

  it("is false when fewer than 7 new messages have landed since the memory was generated", () => {
    expect(shouldUpdateMemory(FULL_MEMORY, 6)).toBe(false) // 6 - 6 = 0
    expect(shouldUpdateMemory(FULL_MEMORY, 12)).toBe(false) // 12 - 6 = 6
  })

  it("is true once at least 7 new messages have landed since the memory was generated", () => {
    expect(shouldUpdateMemory(FULL_MEMORY, 13)).toBe(true) // 13 - 6 = 7
    expect(shouldUpdateMemory(FULL_MEMORY, 20)).toBe(true)
  })
})

describe("capConversationMemory", () => {
  it("caps facts to 8 items of at most 120 chars each", () => {
    const longFact = "x".repeat(200)
    const memory: ConversationMemory = {
      ...FULL_MEMORY,
      facts: Array.from({ length: 12 }, (_, index) => `${longFact}-${index}`),
    }
    const capped = capConversationMemory(memory, 10)
    expect(capped.facts).toHaveLength(8)
    for (const fact of capped.facts) {
      expect(fact.length).toBeLessThanOrEqual(120)
    }
  })

  it("caps the summary to 600 chars", () => {
    const memory: ConversationMemory = { ...FULL_MEMORY, summary: "y".repeat(1000) }
    const capped = capConversationMemory(memory, 10)
    expect(capped.summary.length).toBe(600)
  })

  it("caps open_threads count/length too, defensively", () => {
    const memory: ConversationMemory = {
      ...FULL_MEMORY,
      open_threads: Array.from({ length: 15 }, (_, index) => `thread ${index} `.repeat(20)),
    }
    const capped = capConversationMemory(memory, 10)
    expect(capped.open_threads.length).toBeLessThanOrEqual(8)
    for (const thread of capped.open_threads) {
      expect(thread.length).toBeLessThanOrEqual(120)
    }
  })

  it("stamps message_count and updated_at from the given inputs", () => {
    const now = new Date("2026-08-01T12:00:00.000Z").getTime()
    const capped = capConversationMemory(FULL_MEMORY, 42, now)
    expect(capped.message_count).toBe(42)
    expect(capped.updated_at).toBe(new Date(now).toISOString())
  })

  it("leaves well-under-cap fields untouched", () => {
    const capped = capConversationMemory(FULL_MEMORY, 6)
    expect(capped.facts).toEqual(FULL_MEMORY.facts)
    expect(capped.open_threads).toEqual(FULL_MEMORY.open_threads)
    expect(capped.vibe).toBe(FULL_MEMORY.vibe)
  })
})

describe("formatMemoryForPrompt", () => {
  it("formats all four fields into one compact block", () => {
    const block = formatMemoryForPrompt(FULL_MEMORY)
    expect(block).toContain("What you remember from earlier with this person:")
    expect(block).toContain("facts: wants a custom birthday cake; picking up Saturday")
    expect(block).toContain("unresolved: waiting on a flavor decision")
    expect(block).toContain("vibe: friendly regular, casual texter")
    expect(block).toContain("story so far: Asked about birthday cakes")
  })

  it("returns an empty string when the memory has nothing renderable", () => {
    expect(formatMemoryForPrompt({ facts: [], open_threads: [], vibe: "", summary: "", updated_at: "", message_count: 0 })).toBe(
      ""
    )
  })

  it("omits empty sections rather than rendering blank labels", () => {
    const block = formatMemoryForPrompt({
      facts: [],
      open_threads: [],
      vibe: "",
      summary: "Just said hi so far.",
      updated_at: "",
      message_count: 1,
    })
    expect(block).toBe("What you remember from earlier with this person: story so far: Just said hi so far..")
  })
})

describe("lastOutboundAiTimestamp", () => {
  it("returns null when there are no AI-sent outbound messages", () => {
    expect(
      lastOutboundAiTimestamp([
        { direction: "inbound", ai_handled: false, created_at: "2026-08-01T00:00:00.000Z" },
        { direction: "outbound", ai_handled: false, created_at: "2026-08-01T00:01:00.000Z" }, // human-sent
      ])
    ).toBeNull()
  })

  it("finds the most recent AI-sent outbound message among mixed history", () => {
    const result = lastOutboundAiTimestamp([
      { direction: "outbound", ai_handled: true, created_at: "2026-08-01T00:00:00.000Z" },
      { direction: "inbound", ai_handled: false, created_at: "2026-08-01T00:05:00.000Z" },
      { direction: "outbound", ai_handled: true, created_at: "2026-08-01T00:10:00.000Z" },
      { direction: "outbound", ai_handled: false, created_at: "2026-08-01T00:20:00.000Z" }, // human-sent, ignored
    ])
    expect(result).toBe(new Date("2026-08-01T00:10:00.000Z").getTime())
  })

  it("ignores unparseable timestamps defensively", () => {
    expect(
      lastOutboundAiTimestamp([{ direction: "outbound", ai_handled: true, created_at: "not-a-date" }])
    ).toBeNull()
  })
})

describe("buildMemoryPromptLines", () => {
  const now = new Date("2026-08-01T12:00:00.000Z").getTime()

  it("returns no lines when there's no memory", () => {
    expect(buildMemoryPromptLines(null, [], now)).toEqual([])
  })

  it("returns just the memory block when the AI replied recently", () => {
    const messages = [{ direction: "outbound" as const, ai_handled: true, created_at: "2026-08-01T11:00:00.000Z" }] // 1h ago
    const lines = buildMemoryPromptLines(FULL_MEMORY, messages, now)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain("What you remember from earlier with this person:")
  })

  it("adds the re-engage line when the last AI reply is older than the 2-hour freshness window", () => {
    const messages = [{ direction: "outbound" as const, ai_handled: true, created_at: "2026-08-01T09:00:00.000Z" }] // 3h ago
    const lines = buildMemoryPromptLines(FULL_MEMORY, messages, now)
    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain("re-engage naturally")
  })

  it("omits the re-engage line when there is no prior AI-sent message at all", () => {
    const lines = buildMemoryPromptLines(FULL_MEMORY, [], now)
    expect(lines).toHaveLength(1)
  })
})
