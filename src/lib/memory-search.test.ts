import { describe, expect, it } from "vitest"

import {
  dedupeAndCapConversationIds,
  extractSearchTerms,
  parseSearchAnswerJson,
  sanitizeIlikeTerm,
  validateConversationIds,
} from "./memory-search"

// -----------------------------------------------------------------------------
// extractSearchTerms
// -----------------------------------------------------------------------------

describe("extractSearchTerms", () => {
  it("returns [] for an empty or whitespace-only query", () => {
    expect(extractSearchTerms("")).toEqual([])
    expect(extractSearchTerms("   ")).toEqual([])
  })

  it("lowercases, splits on whitespace/punctuation, and drops stopwords", () => {
    const terms = extractSearchTerms("Who asked about the Haircut price?")
    expect(terms).toContain("asked")
    expect(terms).toContain("haircut")
    expect(terms).toContain("price")
    expect(terms).not.toContain("who")
    expect(terms).not.toContain("the")
    expect(terms).not.toContain("about")
  })

  it("appends the raw trimmed/lowercased query as its own term", () => {
    const terms = extractSearchTerms("  Haircut Price  ")
    expect(terms[terms.length - 1]).toBe("haircut price")
  })

  it("dedupes repeated words while preserving first-seen order", () => {
    const terms = extractSearchTerms("cake cake birthday cake")
    const cakeOccurrences = terms.filter((term) => term === "cake").length
    expect(cakeOccurrences).toBe(1)
    expect(terms.indexOf("cake")).toBeLessThan(terms.indexOf("birthday"))
  })

  it("drops single-character tokens", () => {
    const terms = extractSearchTerms("a b haircut")
    expect(terms).not.toContain("a")
    expect(terms).not.toContain("b")
    expect(terms).toContain("haircut")
  })

  it("never stems — keeps romanized-language words exactly as typed", () => {
    const terms = extractSearchTerms("k xa, haircut kati ho")
    expect(terms).toContain("xa")
    expect(terms).toContain("kati")
    expect(terms).toContain("ho")
    expect(terms).toContain("haircut")
  })

  it("handles a query that is entirely stopwords by still returning the raw phrase", () => {
    const terms = extractSearchTerms("who is it")
    expect(terms).toEqual(["who is it"])
  })
})

// -----------------------------------------------------------------------------
// sanitizeIlikeTerm
// -----------------------------------------------------------------------------

describe("sanitizeIlikeTerm", () => {
  it("backslash-escapes ILIKE wildcards and the .or() filter separator", () => {
    expect(sanitizeIlikeTerm("100%_off,please")).toBe("100\\%\\_off\\,please")
  })

  it("leaves an already-safe term untouched", () => {
    expect(sanitizeIlikeTerm("haircut")).toBe("haircut")
  })

  it("trims surrounding whitespace", () => {
    expect(sanitizeIlikeTerm("  haircut  ")).toBe("haircut")
  })
})

// -----------------------------------------------------------------------------
// dedupeAndCapConversationIds
// -----------------------------------------------------------------------------

describe("dedupeAndCapConversationIds", () => {
  it("merges ranked lists preserving first-seen (highest-rank) order", () => {
    const result = dedupeAndCapConversationIds([["a", "b"], ["c", "a"], ["d"]], 10)
    expect(result).toEqual(["a", "b", "c", "d"])
  })

  it("dedupes an id that appears in a lower-ranked list after a higher-ranked one", () => {
    const result = dedupeAndCapConversationIds([["a"], ["a", "b"]], 10)
    expect(result).toEqual(["a", "b"])
  })

  it("caps at the given limit", () => {
    const result = dedupeAndCapConversationIds([["a", "b", "c", "d", "e"]], 3)
    expect(result).toEqual(["a", "b", "c"])
  })

  it("returns [] for a limit of 0", () => {
    expect(dedupeAndCapConversationIds([["a", "b"]], 0)).toEqual([])
  })

  it("returns [] when every list is empty", () => {
    expect(dedupeAndCapConversationIds([[], [], []], 25)).toEqual([])
  })

  it("stops scanning once the cap is reached across multiple lists", () => {
    const result = dedupeAndCapConversationIds([["a", "b"], ["c", "d", "e"]], 3)
    expect(result).toEqual(["a", "b", "c"])
  })
})

// -----------------------------------------------------------------------------
// parseSearchAnswerJson
// -----------------------------------------------------------------------------

describe("parseSearchAnswerJson", () => {
  it("parses a well-formed response", () => {
    const result = parseSearchAnswerJson('{"answer": "Jay asked in March.", "conversation_ids": ["c1", "c2"]}')
    expect(result).toEqual({ answer: "Jay asked in March.", conversationIds: ["c1", "c2"] })
  })

  it("tolerates surrounding commentary/code fences by extracting the JSON object", () => {
    const result = parseSearchAnswerJson('```json\n{"answer": "Yes.", "conversation_ids": []}\n```')
    expect(result).toEqual({ answer: "Yes.", conversationIds: [] })
  })

  it("defaults conversation_ids to [] when omitted", () => {
    const result = parseSearchAnswerJson('{"answer": "No matches."}')
    expect(result).toEqual({ answer: "No matches.", conversationIds: [] })
  })

  it("returns null for a missing/blank answer", () => {
    expect(parseSearchAnswerJson('{"conversation_ids": ["c1"]}')).toBeNull()
    expect(parseSearchAnswerJson('{"answer": "   ", "conversation_ids": []}')).toBeNull()
  })

  it("returns null for unparseable text", () => {
    expect(parseSearchAnswerJson("not json at all")).toBeNull()
  })

  it("filters non-string entries out of conversation_ids rather than failing", () => {
    const result = parseSearchAnswerJson('{"answer": "ok", "conversation_ids": ["c1", 42, null, "c2"]}')
    expect(result).toEqual({ answer: "ok", conversationIds: ["c1", "c2"] })
  })
})

// -----------------------------------------------------------------------------
// validateConversationIds — drops hallucinated ids the model wasn't given.
// -----------------------------------------------------------------------------

describe("validateConversationIds", () => {
  it("keeps only ids present in the valid set", () => {
    const result = validateConversationIds(["c1", "c2", "c3"], new Set(["c1", "c3"]))
    expect(result).toEqual(["c1", "c3"])
  })

  it("drops every id when none are valid (fully hallucinated)", () => {
    expect(validateConversationIds(["fake-1", "fake-2"], new Set(["c1"]))).toEqual([])
  })

  it("returns [] when given no ids", () => {
    expect(validateConversationIds([], new Set(["c1"]))).toEqual([])
  })
})
