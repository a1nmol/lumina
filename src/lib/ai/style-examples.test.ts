import { describe, expect, it } from "vitest"

import { renderStyleExamplesBlock, shouldCaptureStyleExample } from "./style-examples"

// -----------------------------------------------------------------------------
// shouldCaptureStyleExample — the edit-diff gating logic sendReply
// (src/app/(app)/inbox/actions.ts) uses before ever touching Supabase.
// -----------------------------------------------------------------------------

describe("shouldCaptureStyleExample", () => {
  it("returns false when the sent text is identical to the AI draft (nothing edited)", () => {
    expect(shouldCaptureStyleExample("Sure, we open at 9!", "Sure, we open at 9!")).toBe(false)
  })

  it("returns false when the texts are identical except for surrounding whitespace", () => {
    expect(shouldCaptureStyleExample("  we're open till 6  ", "we're open till 6")).toBe(false)
  })

  it("returns false when originalAiDraft is blank (a from-scratch reply)", () => {
    expect(shouldCaptureStyleExample("", "totally new message the owner typed")).toBe(false)
    expect(shouldCaptureStyleExample("   ", "totally new message the owner typed")).toBe(false)
  })

  it("returns false when originalAiDraft is undefined/null (never prefilled, or cleared by the composer after the box was emptied)", () => {
    expect(shouldCaptureStyleExample(undefined, "hey what's up")).toBe(false)
    expect(shouldCaptureStyleExample(null, "hey what's up")).toBe(false)
  })

  it("returns true when the owner edited the AI draft before sending", () => {
    expect(shouldCaptureStyleExample("I would be happy to assist you with that request.", "yep we can do that!")).toBe(true)
  })

  it("returns true for a small edit, not just a full rewrite", () => {
    expect(shouldCaptureStyleExample("We open at 9am tomorrow.", "we open at 9 tomorrow")).toBe(true)
  })
})

// -----------------------------------------------------------------------------
// renderStyleExamplesBlock
// -----------------------------------------------------------------------------

describe("renderStyleExamplesBlock", () => {
  it("returns an empty string for no pairs", () => {
    expect(renderStyleExamplesBlock([])).toBe("")
  })

  it("renders both sides of each pair, framed as style guidance", () => {
    const block = renderStyleExamplesBlock([{ aiDraft: "I would be happy to help.", ownerText: "yep can do!" }])
    expect(block).toContain("I would be happy to help.")
    expect(block).toContain("yep can do!")
    expect(block).toContain("learn from these past corrections")
  })

  it("truncates each side to the render cap so multiple pairs stay cheap", () => {
    const longDraft = "a".repeat(500)
    const longOwner = "b".repeat(500)
    const block = renderStyleExamplesBlock([{ aiDraft: longDraft, ownerText: longOwner }])
    expect(block).not.toContain("a".repeat(500))
    expect(block).not.toContain("b".repeat(500))
    expect(block.length).toBeLessThan(longDraft.length + longOwner.length)
  })
})
