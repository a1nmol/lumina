// WCAG 2.x relative luminance + contrast ratio, plus a small pure color-math
// toolkit (hex<->rgb, mix/lighten/darken) used by catalog.ts#resolveColorRoles
// to derive safe template color roles from an org's Business Brain brand kit.
// Deliberately framework-free (no Satori/resvg/sharp import) so it's cheap to
// unit-test in isolation — see contrast.test.ts.

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

export class InvalidHexColorError extends Error {
  constructor(value: string) {
    super(`Invalid hex color: "${value}" (expected #rgb or #rrggbb).`)
    this.name = "InvalidHexColorError"
  }
}

export interface Rgb {
  r: number
  g: number
  b: number
}

/** True for a well-formed `#rgb` or `#rrggbb` string. */
export function isValidHexColor(value: string): boolean {
  return HEX_RE.test(value)
}

/** Parses a `#rgb` or `#rrggbb` hex string into 0-255 RGB channels. Throws InvalidHexColorError on malformed input. */
export function hexToRgb(hex: string): Rgb {
  if (!HEX_RE.test(hex)) throw new InvalidHexColorError(hex)
  const normalized = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  }
}

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)))
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const toHex = (n: number) => clamp255(n).toString(16).padStart(2, "0")
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/** WCAG relative luminance in [0, 1] — 0 is black, 1 is white. */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex)
  const channel = (c: number): number => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG contrast ratio between two colors — 1 is no contrast, 21 is max (black vs white). */
export function contrastRatio(hexA: string, hexB: string): number {
  const lighter = Math.max(relativeLuminance(hexA), relativeLuminance(hexB))
  const darker = Math.min(relativeLuminance(hexA), relativeLuminance(hexB))
  return (lighter + 0.05) / (darker + 0.05)
}

/** WCAG AA minimum contrast ratio for normal-size text. */
export const AA_NORMAL_TEXT_MIN_CONTRAST = 4.5

const NEAR_BLACK = "#0A0A0B"
const NEAR_WHITE = "#FAFAFA"

/**
 * Picks near-black or near-white — whichever clears WCAG AA (>=4.5:1)
 * against `bgHex`, preferring the higher-contrast option when both clear it.
 * If neither clears 4.5:1 (only possible for a narrow mid-gray background),
 * returns whichever contrast ratio is higher, so the result is still the
 * best available choice rather than an arbitrary default.
 */
export function pickTextColor(bgHex: string): string {
  const blackContrast = contrastRatio(bgHex, NEAR_BLACK)
  const whiteContrast = contrastRatio(bgHex, NEAR_WHITE)
  const blackOk = blackContrast >= AA_NORMAL_TEXT_MIN_CONTRAST
  const whiteOk = whiteContrast >= AA_NORMAL_TEXT_MIN_CONTRAST
  if (blackOk && whiteOk) return blackContrast >= whiteContrast ? NEAR_BLACK : NEAR_WHITE
  if (blackOk) return NEAR_BLACK
  if (whiteOk) return NEAR_WHITE
  return whiteContrast > blackContrast ? NEAR_WHITE : NEAR_BLACK
}

/** Linearly mixes two hex colors: t=0 -> a, t=1 -> b. `t` is clamped to [0, 1]. */
export function mixHex(a: string, b: string, t: number): string {
  const clampedT = Math.max(0, Math.min(1, t))
  const rgbA = hexToRgb(a)
  const rgbB = hexToRgb(b)
  return rgbToHex({
    r: rgbA.r + (rgbB.r - rgbA.r) * clampedT,
    g: rgbA.g + (rgbB.g - rgbA.g) * clampedT,
    b: rgbA.b + (rgbB.b - rgbA.b) * clampedT,
  })
}

/** Mixes `hex` toward black by `amount` (0-1). */
export function darkenHex(hex: string, amount: number): string {
  return mixHex(hex, "#000000", amount)
}

/** Mixes `hex` toward white by `amount` (0-1). */
export function lightenHex(hex: string, amount: number): string {
  return mixHex(hex, "#FFFFFF", amount)
}
