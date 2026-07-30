import { describe, expect, it } from "vitest"

import {
  AA_NORMAL_TEXT_MIN_CONTRAST,
  contrastRatio,
  darkenHex,
  hexToRgb,
  InvalidHexColorError,
  lightenHex,
  pickTextColor,
  relativeLuminance,
} from "./contrast"

describe("relativeLuminance", () => {
  it("is 0 for black and 1 for white", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5)
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 5)
  })

  it("expands 3-digit hex the same as its 6-digit equivalent", () => {
    expect(relativeLuminance("#fff")).toBeCloseTo(relativeLuminance("#ffffff"), 10)
    expect(hexToRgb("#abc")).toEqual(hexToRgb("#aabbcc"))
  })

  it("throws InvalidHexColorError on malformed input", () => {
    expect(() => relativeLuminance("not-a-color")).toThrow(InvalidHexColorError)
    expect(() => relativeLuminance("#12345")).toThrow(InvalidHexColorError)
  })
})

describe("contrastRatio", () => {
  it("is 21:1 for black vs white (the WCAG maximum)", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 1)
  })

  it("is 1:1 for a color against itself", () => {
    expect(contrastRatio("#6D4AFF", "#6D4AFF")).toBeCloseTo(1, 5)
  })

  it("is symmetric regardless of argument order", () => {
    expect(contrastRatio("#123456", "#eeeeee")).toBeCloseTo(contrastRatio("#eeeeee", "#123456"), 10)
  })
})

describe("pickTextColor", () => {
  it("picks a light color for a dark background", () => {
    const text = pickTextColor("#0B0B10")
    expect(contrastRatio("#0B0B10", text)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT_MIN_CONTRAST)
  })

  it("picks a dark color for a light background", () => {
    const text = pickTextColor("#FAFAFA")
    expect(contrastRatio("#FAFAFA", text)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT_MIN_CONTRAST)
  })

  it("always meets AA (4.5:1) against typical brand colors", () => {
    for (const bg of ["#6D4AFF", "#D9A441", "#3FA79E", "#C24F97", "#111111", "#F5F5F5"]) {
      const text = pickTextColor(bg)
      expect(contrastRatio(bg, text)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT_MIN_CONTRAST)
    }
  })
})

describe("darkenHex / lightenHex", () => {
  it("darkenHex moves a color toward black", () => {
    const darker = darkenHex("#6D4AFF", 0.5)
    expect(relativeLuminance(darker)).toBeLessThan(relativeLuminance("#6D4AFF"))
  })

  it("lightenHex moves a color toward white", () => {
    const lighter = lightenHex("#6D4AFF", 0.5)
    expect(relativeLuminance(lighter)).toBeGreaterThan(relativeLuminance("#6D4AFF"))
  })

  it("amount=0 is a no-op and amount=1 reaches the target exactly", () => {
    // rgbToHex always lowercases — case-insensitive comparison for the no-op check.
    expect(darkenHex("#6D4AFF", 0).toLowerCase()).toBe("#6d4aff")
    expect(darkenHex("#6D4AFF", 1)).toBe("#000000")
    expect(lightenHex("#6D4AFF", 1)).toBe("#ffffff")
  })
})
