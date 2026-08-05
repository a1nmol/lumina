import { describe, expect, it } from "vitest"

import { parseRefineCaptionJson } from "./generate-content"

// Pure-parser coverage for refineCaption's model-response validation — the
// real-AI replacement for the Studio "AI Assist" rail's old hard-coded
// string transforms (redesign wave R5). Mirrors the shape/length guard
// contract of parseDraftJson (generate-content.ts), just for the smaller
// { caption } shape.

describe("parseRefineCaptionJson", () => {
  it("parses a well-formed caption object", () => {
    expect(parseRefineCaptionJson('{"caption": "Fresh bread, baked daily."}')).toEqual({
      caption: "Fresh bread, baked daily.",
    })
  })

  it("trims surrounding whitespace on the caption", () => {
    expect(parseRefineCaptionJson('{"caption": "  Fresh bread.  "}')).toEqual({
      caption: "Fresh bread.",
    })
  })

  it("extracts JSON embedded in surrounding prose/code fences", () => {
    const raw = 'Here you go:\n```json\n{"caption": "Fresh bread, baked daily."}\n```'
    expect(parseRefineCaptionJson(raw)).toEqual({ caption: "Fresh bread, baked daily." })
  })

  it("returns null when there is no JSON object at all", () => {
    expect(parseRefineCaptionJson("Sure, here's a punchier version!")).toBeNull()
  })

  it("returns null on malformed JSON", () => {
    expect(parseRefineCaptionJson('{"caption": "unterminated')).toBeNull()
  })

  it("returns null when the top-level value isn't an object", () => {
    expect(parseRefineCaptionJson('["Fresh bread"]')).toBeNull()
  })

  it("returns null when caption is missing", () => {
    expect(parseRefineCaptionJson('{"hashtags": ["bakery"]}')).toBeNull()
  })

  it("returns null when caption is not a string", () => {
    expect(parseRefineCaptionJson('{"caption": 42}')).toBeNull()
  })

  it("returns null when caption is empty after trimming", () => {
    expect(parseRefineCaptionJson('{"caption": "   "}')).toBeNull()
  })

  it("returns null when caption exceeds the max length", () => {
    const tooLong = "a".repeat(2201)
    expect(parseRefineCaptionJson(JSON.stringify({ caption: tooLong }))).toBeNull()
  })

  it("accepts a caption right at the max length", () => {
    const maxLength = "a".repeat(2200)
    expect(parseRefineCaptionJson(JSON.stringify({ caption: maxLength }))).toEqual({
      caption: maxLength,
    })
  })

  it("ignores extra unexpected fields in the JSON object", () => {
    expect(parseRefineCaptionJson('{"caption": "Fresh bread.", "hashtags": ["bakery"]}')).toEqual({
      caption: "Fresh bread.",
    })
  })
})
