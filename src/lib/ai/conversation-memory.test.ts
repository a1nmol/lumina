import { describe, expect, it, vi } from "vitest"

import {
  buildMemoryPromptLines,
  capConversationMemory,
  capPersonMemory,
  formatMemoryForPrompt,
  formatPersonMemoryForPrompt,
  lastOutboundAiTimestamp,
  parseCombinedMemoryResponse,
  parseConversationMemory,
  parsePersonMemory,
  shouldUpdateMemory,
  type ConversationMemory,
  type PersonMemory,
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
    expect(block).toContain("Memory of this person:")
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
    expect(block).toBe("Memory of this person: story so far: Just said hi so far..")
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
    expect(lines[0]).toContain("Memory of this person:")
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

const FULL_PERSON_MEMORY: PersonMemory = {
  facts: ["runs a small dog-walking business", "has a daughter named Mia"],
  relationship: "regular customer, orders birthday cakes every year",
  topics: ["birthday cakes", "dog treats"],
  updated_at: "2026-08-01T00:00:00.000Z",
}

describe("parsePersonMemory", () => {
  it("parses a well-formed person memory object", () => {
    expect(parsePersonMemory(FULL_PERSON_MEMORY)).toEqual(FULL_PERSON_MEMORY)
  })

  it("returns null for non-objects", () => {
    expect(parsePersonMemory(null)).toBeNull()
    expect(parsePersonMemory(undefined)).toBeNull()
    expect(parsePersonMemory("a string")).toBeNull()
    expect(parsePersonMemory(42)).toBeNull()
    expect(parsePersonMemory(["array", "not", "object"])).toBeNull()
  })

  it("returns null when every field is empty (nothing usable)", () => {
    expect(parsePersonMemory({})).toBeNull()
    expect(parsePersonMemory({ facts: [], relationship: "", topics: [] })).toBeNull()
  })

  it("keeps a partial memory usable when at least one field has content", () => {
    const result = parsePersonMemory({ relationship: "brand new lead" })
    expect(result).not.toBeNull()
    expect(result?.relationship).toBe("brand new lead")
    expect(result?.facts).toEqual([])
    expect(result?.topics).toEqual([])
  })

  it("filters out non-string entries in facts/topics defensively", () => {
    const result = parsePersonMemory({
      facts: ["real fact", 42, null, "  ", "another fact"],
      topics: [true, "real topic"],
    })
    expect(result?.facts).toEqual(["real fact", "another fact"])
    expect(result?.topics).toEqual(["real topic"])
  })

  it("falls back to a safe updated_at on malformed values", () => {
    const result = parsePersonMemory({ relationship: "hi", updated_at: 12345 })
    expect(result?.updated_at).toBe(new Date(0).toISOString())
  })

  it("rejects an unparseable updated_at string", () => {
    const result = parsePersonMemory({ relationship: "hi", updated_at: "not-a-date" })
    expect(result?.updated_at).toBe(new Date(0).toISOString())
  })
})

describe("capPersonMemory", () => {
  it("caps facts to 10 items of at most 140 chars each", () => {
    const longFact = "x".repeat(200)
    const memory: PersonMemory = {
      ...FULL_PERSON_MEMORY,
      facts: Array.from({ length: 15 }, (_, index) => `${longFact}-${index}`),
    }
    const capped = capPersonMemory(memory)
    expect(capped.facts).toHaveLength(10)
    for (const fact of capped.facts) {
      expect(fact.length).toBeLessThanOrEqual(140)
    }
  })

  it("caps topics to 5 items of at most 80 chars each", () => {
    const longTopic = "y".repeat(150)
    const memory: PersonMemory = {
      ...FULL_PERSON_MEMORY,
      topics: Array.from({ length: 8 }, (_, index) => `${longTopic}-${index}`),
    }
    const capped = capPersonMemory(memory)
    expect(capped.topics).toHaveLength(5)
    for (const topic of capped.topics) {
      expect(topic.length).toBeLessThanOrEqual(80)
    }
  })

  it("caps relationship to 200 chars", () => {
    const memory: PersonMemory = { ...FULL_PERSON_MEMORY, relationship: "z".repeat(400) }
    const capped = capPersonMemory(memory)
    expect(capped.relationship.length).toBe(200)
  })

  it("stamps updated_at from the given `now`", () => {
    const now = new Date("2026-08-01T12:00:00.000Z").getTime()
    const capped = capPersonMemory(FULL_PERSON_MEMORY, now)
    expect(capped.updated_at).toBe(new Date(now).toISOString())
  })

  it("leaves well-under-cap fields untouched", () => {
    const capped = capPersonMemory(FULL_PERSON_MEMORY)
    expect(capped.facts).toEqual(FULL_PERSON_MEMORY.facts)
    expect(capped.topics).toEqual(FULL_PERSON_MEMORY.topics)
    expect(capped.relationship).toBe(FULL_PERSON_MEMORY.relationship)
  })
})

describe("formatPersonMemoryForPrompt", () => {
  it("formats all three fields into one compact block", () => {
    const block = formatPersonMemoryForPrompt(FULL_PERSON_MEMORY)
    expect(block).toContain("Known about this person:")
    expect(block).toContain("facts: runs a small dog-walking business; has a daughter named Mia")
    expect(block).toContain("relationship: regular customer, orders birthday cakes every year")
    expect(block).toContain("running topics: birthday cakes; dog treats")
  })

  it("returns an empty string when the memory has nothing renderable", () => {
    expect(formatPersonMemoryForPrompt({ facts: [], relationship: "", topics: [], updated_at: "" })).toBe("")
  })

  it("omits empty sections rather than rendering blank labels", () => {
    const block = formatPersonMemoryForPrompt({
      facts: [],
      relationship: "brand new lead",
      topics: [],
      updated_at: "",
    })
    expect(block).toBe("Known about this person: relationship: brand new lead.")
  })
})

describe("parseCombinedMemoryResponse", () => {
  it("parses a well-formed combined {conversation, person} response", () => {
    const raw = JSON.stringify({
      conversation: { facts: FULL_MEMORY.facts, open_threads: FULL_MEMORY.open_threads, vibe: FULL_MEMORY.vibe, summary: FULL_MEMORY.summary },
      person: { facts: FULL_PERSON_MEMORY.facts, relationship: FULL_PERSON_MEMORY.relationship, topics: FULL_PERSON_MEMORY.topics },
    })
    const result = parseCombinedMemoryResponse(raw)
    expect(result.conversation).not.toBeNull()
    expect(result.conversation?.facts).toEqual(FULL_MEMORY.facts)
    expect(result.person).not.toBeNull()
    expect(result.person?.relationship).toBe(FULL_PERSON_MEMORY.relationship)
  })

  it("parses a combined response with only one side present", () => {
    const raw = JSON.stringify({ conversation: { summary: "Just started chatting." } })
    const result = parseCombinedMemoryResponse(raw)
    expect(result.conversation?.summary).toBe("Just started chatting.")
    expect(result.person).toBeNull()
  })

  it("returns nulls when there's no JSON object at all", () => {
    expect(parseCombinedMemoryResponse("not json")).toEqual({ conversation: null, person: null })
  })

  it("returns nulls on unparseable JSON inside braces", () => {
    expect(parseCombinedMemoryResponse("{not: valid json}")).toEqual({ conversation: null, person: null })
  })

  it("returns nulls when the parsed value is an array, not an object", () => {
    expect(parseCombinedMemoryResponse("[1, 2, 3]")).toEqual({ conversation: null, person: null })
  })

  it("falls back to the old flat {facts, open_threads, vibe, summary} shape, logging a warning, with no person data recovered", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const raw = JSON.stringify({
      facts: FULL_MEMORY.facts,
      open_threads: FULL_MEMORY.open_threads,
      vibe: FULL_MEMORY.vibe,
      summary: FULL_MEMORY.summary,
    })

    const result = parseCombinedMemoryResponse(raw)

    expect(result.conversation).not.toBeNull()
    expect(result.conversation?.facts).toEqual(FULL_MEMORY.facts)
    expect(result.conversation?.summary).toBe(FULL_MEMORY.summary)
    expect(result.person).toBeNull()
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0]?.[0]).toContain("old flat memory shape")

    warnSpy.mockRestore()
  })

  it("extracts the first JSON object even with surrounding prose, per the flat-shape fallback path", () => {
    const raw = `Sure, here you go:\n${JSON.stringify({ summary: "hi there" })}\nHope that helps!`
    const result = parseCombinedMemoryResponse(raw)
    expect(result.conversation?.summary).toBe("hi there")
    expect(result.person).toBeNull()
  })
})
