import { describe, expect, it } from "vitest"

import { autofitText, fitSingleLine, measureTextWidth, measureTrackedWidth } from "./autofit"

describe("measureTextWidth", () => {
  it("grows linearly with font size", () => {
    const at16 = measureTextWidth("Hello world", 16)
    const at32 = measureTextWidth("Hello world", 32)
    expect(at32).toBeCloseTo(at16 * 2, 5)
  })

  it("is 0 for empty text", () => {
    expect(measureTextWidth("", 40)).toBe(0)
  })
})

describe("autofitText", () => {
  it("picks the largest font size that fits a generous box", () => {
    const result = autofitText({
      text: "Big Sale",
      maxWidth: 900,
      maxHeight: 400,
      minFontSize: 20,
      maxFontSize: 120,
    })
    expect(result.fontSize).toBeGreaterThan(20)
    expect(result.fontSize).toBeLessThanOrEqual(120)
    // Every wrapped line must actually fit the box at the chosen size.
    for (const line of result.lines) {
      expect(measureTextWidth(line, result.fontSize)).toBeLessThanOrEqual(900)
    }
  })

  it("shrinks the font size as the text gets longer, for the same box", () => {
    const short = autofitText({
      text: "Grand opening",
      maxWidth: 700,
      maxHeight: 300,
      minFontSize: 16,
      maxFontSize: 140,
    })
    const long = autofitText({
      text: "Join us for our grand opening celebration this Saturday afternoon downtown",
      maxWidth: 700,
      maxHeight: 300,
      minFontSize: 16,
      maxFontSize: 140,
    })
    expect(long.fontSize).toBeLessThan(short.fontSize)
  })

  it("respects maxLines even when maxHeight would allow more, truncating with an ellipsis", () => {
    // Fixed font size (min === max) and a text long enough that it cannot
    // possibly wrap into 2 lines at that size — forces the truncation path.
    const result = autofitText({
      text:
        "This headline has a very large number of words that would normally wrap across many, many lines of text if nothing truncated it at all, going on and on well past a couple of lines",
      maxWidth: 300,
      maxHeight: 5000, // effectively unconstrained by height
      minFontSize: 24,
      maxFontSize: 24,
      maxLines: 2,
    })
    expect(result.lines.length).toBeLessThanOrEqual(2)
    expect(result.lines.at(-1)).toMatch(/…$/)
  })

  it("never returns a font size outside [minFontSize, maxFontSize]", () => {
    const result = autofitText({
      text: "A quote that is deliberately long enough to stress the auto-fit algorithm across many possible wrapped lines and sizes",
      maxWidth: 800,
      maxHeight: 250,
      minFontSize: 18,
      maxFontSize: 96,
    })
    expect(result.fontSize).toBeGreaterThanOrEqual(18)
    expect(result.fontSize).toBeLessThanOrEqual(96)
  })

  it("handles empty text by returning a single empty line at the max font size", () => {
    const result = autofitText({ text: "   ", maxWidth: 500, maxHeight: 200, minFontSize: 10, maxFontSize: 80 })
    expect(result.lines).toEqual([""])
    expect(result.fontSize).toBe(80)
  })

  it("throws on invalid font size bounds", () => {
    expect(() =>
      autofitText({ text: "x", maxWidth: 100, maxHeight: 100, minFontSize: 50, maxFontSize: 10 })
    ).toThrow()
  })
})

// ===========================================================================
// fitSingleLine — the permanent guard against the owner's "single-line rows
// overflow the canvas" bug class (see autofit.ts's module header). The
// invariant every one of these proves: whatever fitSingleLine returns must
// measure within the caller's budget, full stop — no wrapped/growing-past-
// the-margin case is allowed to exist.
// ===========================================================================

describe("fitSingleLine", () => {
  it("never returns text that measures wider than maxWidthPx, across a stress matrix of lengths/fonts/budgets", () => {
    const wide = (n: number) => "WWMMWW HOLIDAY MMWW ".repeat(10).slice(0, n)
    const lengths = [5, 14, 22, 32, 40, 50, 60, 80, 90]
    const fontSizes: Array<[number, number]> = [
      [12, 20],
      [18, 28],
      [24, 32],
      [20, 52],
      [64, 232],
    ]
    const budgets = [80, 150, 300, 500, 900]

    for (const len of lengths) {
      for (const [minFontSize, maxFontSize] of fontSizes) {
        for (const maxWidthPx of budgets) {
          const result = fitSingleLine({ text: wide(len), maxWidthPx, minFontSize, maxFontSize })
          expect(result.fontSize).toBeGreaterThanOrEqual(minFontSize)
          expect(result.fontSize).toBeLessThanOrEqual(maxFontSize)
          expect(measureTrackedWidth(result.text, result.fontSize)).toBeLessThanOrEqual(maxWidthPx + 0.5)
        }
      }
    }
  })

  it("accounts for letterSpacing tracking in the width guarantee — the exact regression that broke the eyebrow row", () => {
    const wide = "WWMMWW HOLIDAY MMWW WWMMWW HOLIDAY".slice(0, 40)
    const maxWidthPx = 400
    const result = fitSingleLine({ text: wide, maxWidthPx, minFontSize: 14, maxFontSize: 26, letterSpacingEm: 0.18 })
    expect(measureTrackedWidth(result.text, result.fontSize, 0.18)).toBeLessThanOrEqual(maxWidthPx + 0.5)
    // Sanity: the tracked measurement (which the caller's rendered CSS
    // actually pays for) must be strictly wider than the untracked one for
    // any non-trivial letterSpacing, proving the tracking math is live, not
    // a no-op.
    expect(measureTrackedWidth(result.text, result.fontSize, 0.18)).toBeGreaterThan(
      measureTextWidth(result.text, result.fontSize)
    )
  })

  it("ellipsizes (never overflows) when even minFontSize doesn't fit", () => {
    const result = fitSingleLine({
      text: "WWMMWW HOLIDAY MMWW WWMMWW HOLIDAY MMWW WWMMWW HOLIDAY",
      maxWidthPx: 60,
      minFontSize: 20,
      maxFontSize: 20,
    })
    expect(result.fontSize).toBe(20)
    expect(measureTextWidth(result.text, 20)).toBeLessThanOrEqual(60 + 0.5)
    expect(result.text.endsWith("…")).toBe(true)
  })

  it("returns empty text for blank/whitespace-only input without throwing", () => {
    const result = fitSingleLine({ text: "   ", maxWidthPx: 200, minFontSize: 10, maxFontSize: 40 })
    expect(result.text).toBe("")
    expect(result.fontSize).toBe(40)
  })

  it("throws on invalid bounds", () => {
    expect(() => fitSingleLine({ text: "x", maxWidthPx: 100, minFontSize: 50, maxFontSize: 10 })).toThrow()
    expect(() => fitSingleLine({ text: "x", maxWidthPx: 0, minFontSize: 10, maxFontSize: 40 })).toThrow()
  })
})
