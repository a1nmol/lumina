// Pure auto-fit text sizing: given text + a box + font bounds, finds the
// largest font size whose greedily word-wrapped line count fits the box
// (binary search over integer font sizes) and returns the exact wrapped
// lines to render — one per line, so the renderer (render.ts) draws
// predetermined lines rather than trusting Satori's own text reflow to land
// on the same font size we chose. Framework-free and unit-tested in
// isolation (autofit.test.ts) — no Satori/resvg/sharp dependency.
//
// Width estimation is a simple per-character-class table (an average glyph
// width as a fraction of font size), not real font metrics — per-class
// widths are deliberately biased ~8-10% wide of Inter's real average so the
// estimator very rarely UNDER-predicts width (the caller/render.ts also
// clips with `overflow: hidden` as a second line of defense against the
// rare case it does).

export type CharWidthFn = (ch: string) => number

const EM = {
  space: 0.29,
  narrow: 0.3,
  digit: 0.6,
  upperWide: 0.92,
  upper: 0.72,
  lowerWide: 0.82,
  lower: 0.54,
  default: 0.6,
} as const

const NARROW_CHARS = new Set([
  "i", "I", "l", "j", "f", "t", ".", ",", ":", ";", "'", "!", "|", "(", ")", "[", "]", '"', "-", "/",
])
const WIDE_UPPER_CHARS = new Set(["M", "W", "@", "%", "#", "&"])
const WIDE_LOWER_CHARS = new Set(["m", "w"])

/** Default per-character width estimator, tuned for Inter (see module header for the width-estimation caveat). */
export function defaultCharWidthEm(ch: string): number {
  if (ch === " ") return EM.space
  if (NARROW_CHARS.has(ch)) return EM.narrow
  if (ch >= "0" && ch <= "9") return EM.digit
  if (WIDE_UPPER_CHARS.has(ch)) return EM.upperWide
  if (ch >= "A" && ch <= "Z") return EM.upper
  if (WIDE_LOWER_CHARS.has(ch)) return EM.lowerWide
  if (ch >= "a" && ch <= "z") return EM.lower
  return EM.default
}

/** Estimated rendered width (px) of `text` at `fontSizePx`, using `charWidthEm` (defaults to defaultCharWidthEm). */
export function measureTextWidth(text: string, fontSizePx: number, charWidthEm: CharWidthFn = defaultCharWidthEm): number {
  let width = 0
  for (const ch of text) width += charWidthEm(ch) * fontSizePx
  return width
}

/** Greedy word-wraps `text` to `maxWidth` at `fontSizePx`. A single word wider than `maxWidth` on its own is hard-broken character by character so no line ever measures over `maxWidth`. */
function wrapLines(text: string, fontSizePx: number, maxWidth: number, charWidthEm: CharWidthFn): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return [""]

  const lines: string[] = []
  let current = ""

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (!current || measureTextWidth(candidate, fontSizePx, charWidthEm) <= maxWidth) {
      current = candidate
    } else {
      lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)

  return lines.flatMap((line) => hardBreakIfNeeded(line, fontSizePx, maxWidth, charWidthEm))
}

/** Character-by-character hard break for a single line that's still wider than `maxWidth` (e.g. one very long word). */
function hardBreakIfNeeded(line: string, fontSizePx: number, maxWidth: number, charWidthEm: CharWidthFn): string[] {
  if (measureTextWidth(line, fontSizePx, charWidthEm) <= maxWidth) return [line]

  const out: string[] = []
  let current = ""
  for (const ch of line) {
    const candidate = current + ch
    if (current && measureTextWidth(candidate, fontSizePx, charWidthEm) > maxWidth) {
      out.push(current)
      current = ch
    } else {
      current = candidate
    }
  }
  if (current) out.push(current)
  return out
}

/** Squeezes overflow lines beyond `maxLines` into the last kept line, trimming + appending an ellipsis until it fits `maxWidth`. */
function truncateWithEllipsis(
  lines: string[],
  maxLines: number,
  fontSizePx: number,
  maxWidth: number,
  charWidthEm: CharWidthFn
): string[] {
  if (maxLines <= 0) return []
  if (lines.length <= maxLines) return lines

  const kept = lines.slice(0, maxLines)
  const overflowWords = lines.slice(maxLines).join(" ")
  const ellipsis = "…"
  let lastLine = `${kept[maxLines - 1]} ${overflowWords}`.trim()

  while (lastLine.length > 0 && measureTextWidth(`${lastLine}${ellipsis}`, fontSizePx, charWidthEm) > maxWidth) {
    lastLine = lastLine.slice(0, -1).trimEnd()
  }

  kept[maxLines - 1] = `${lastLine}${ellipsis}`
  return kept
}

export interface AutofitOptions {
  text: string
  /** Available box width in px. */
  maxWidth: number
  /** Available box height in px. */
  maxHeight: number
  minFontSize: number
  maxFontSize: number
  /** Line-height multiplier of font size. Default 1.15. */
  lineHeight?: number
  /** Hard cap on wrapped line count, independent of maxHeight (e.g. a headline capped at 3 lines even if more would technically fit). */
  maxLines?: number
  /** Override the width estimator (e.g. for a different typeface's metrics). Defaults to defaultCharWidthEm. */
  charWidthEm?: CharWidthFn
}

export interface AutofitResult {
  fontSize: number
  lines: string[]
  lineHeightPx: number
}

export const DEFAULT_LINE_HEIGHT = 1.15

// ===========================================================================
// fitSingleLine — the single-line counterpart to autofitText above.
//
// Root cause (owner-reported overflow bug): every template def has PLAIN
// text nodes (footer date/location rows, pill/badge labels, CTA lines, fine
// print, hours row cells, etc.) that were never routed through this module
// at all — they relied on Satori's own native text layout to wrap/clip
// within their container's width. That trust is misplaced: those nodes
// virtually all sit inside a flex ROW alongside a sibling (an icon, a gap
// spacer) and/or carry a CSS `letterSpacing`, and Satori does not reliably
// bound either configuration to the container's actual available width —
// the text can render past the intended safe margin and get hard-clipped by
// the canvas's own `overflow: hidden` (that's the "cut-off text" bug:
// chars ≠ pixels, and an un-measured worst-case string is wider than the
// margin). fitSingleLine below is the fix: it PRE-COMPUTES (in plain JS,
// with real pixel measurement, same discipline as autofitText's own
// wrap-then-truncate) the largest font size — and, if even the minimum
// doesn't fit, an ellipsis-truncated substring — that is GUARANTEED to
// measure within `maxWidthPx`, so the string Satori is ever asked to render
// is already short enough. Nothing downstream needs to trust Satori's own
// layout engine to get this right.
// ===========================================================================

export interface FitSingleLineOptions {
  text: string
  /** Available width budget in px — REQUIRED. Callers (decorations.ts#textLine, or a template calling this directly) must derive this from real layout math: canvas width − 2×safe margin − sibling slots (icons/logo/other pills sharing the row) — never a guessed constant. */
  maxWidthPx: number
  maxFontSize: number
  minFontSize: number
  /**
   * Extra per-character tracking in em units the caller will ALSO apply via
   * a CSS `letterSpacing` on the rendered box (e.g. pass 0.18 for
   * `letterSpacing: "0.18em"`). Satori paints letter-spacing but does not
   * factor it into its own (untrusted, per the module header) wrap
   * calculations, so this module must account for it explicitly — omitting
   * it for a tracked field is exactly how the eyebrow-row overflow
   * regressed. Default 0 (no tracking).
   */
  letterSpacingEm?: number
  charWidthEm?: CharWidthFn
}

export interface FitSingleLineResult {
  fontSize: number
  /** Already the exact, final string to render — trimmed, and ellipsis-truncated if even `minFontSize` didn't fit `maxWidthPx`. Render this verbatim; do not re-trim/re-wrap it. */
  text: string
}

/** The same measurement fitSingleLine uses internally (base glyph estimate + letter-spacing tracking) — exported so tests (and any caller that wants to double-check a result) can assert `measureTrackedWidth(result.text, result.fontSize, letterSpacingEm) <= maxWidthPx + 0.5`. */
export function measureTrackedWidth(
  text: string,
  fontSizePx: number,
  letterSpacingEm = 0,
  charWidthEm: CharWidthFn = defaultCharWidthEm
): number {
  const base = measureTextWidth(text, fontSizePx, charWidthEm)
  const tracking = text.length * letterSpacingEm * fontSizePx
  return base + tracking
}

/**
 * Binary-searches integer font sizes in [minFontSize, maxFontSize] for the
 * largest size whose SINGLE (unwrapped) line measures within `maxWidthPx`
 * (letter-spacing included, see `letterSpacingEm`). If even `minFontSize`
 * doesn't fit, clamps to `minFontSize` and ellipsis-truncates the text
 * character-by-character until it measures within budget — so the result
 * NEVER exceeds `maxWidthPx`, mirroring autofitText's own "never overflow
 * the caller's box" guarantee.
 */
export function fitSingleLine(options: FitSingleLineOptions): FitSingleLineResult {
  const { text, maxWidthPx, maxFontSize, minFontSize, letterSpacingEm = 0, charWidthEm = defaultCharWidthEm } = options

  if (minFontSize <= 0 || maxFontSize <= 0 || minFontSize > maxFontSize) {
    throw new Error(`fitSingleLine: invalid font size bounds (min ${minFontSize}, max ${maxFontSize}).`)
  }
  if (maxWidthPx <= 0) {
    throw new Error(`fitSingleLine: invalid maxWidthPx (${maxWidthPx}).`)
  }

  const trimmed = text.trim().replace(/\s+/g, " ")
  if (!trimmed) {
    return { fontSize: Math.floor(maxFontSize), text: "" }
  }

  const fits = (fontSize: number): boolean =>
    measureTrackedWidth(trimmed, fontSize, letterSpacingEm, charWidthEm) <= maxWidthPx

  let lo = Math.floor(minFontSize)
  let hi = Math.floor(maxFontSize)
  let best: number | null = null

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (fits(mid)) {
      best = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }

  if (best !== null) {
    return { fontSize: best, text: trimmed }
  }

  // Even minFontSize doesn't fit — clamp to it and ellipsize character by
  // character until the truncated string + ellipsis measures within budget.
  const flooredMin = Math.floor(minFontSize)
  const ellipsis = "…"
  let candidate = trimmed
  while (
    candidate.length > 0 &&
    measureTrackedWidth(`${candidate}${ellipsis}`, flooredMin, letterSpacingEm, charWidthEm) > maxWidthPx
  ) {
    candidate = candidate.slice(0, -1).trimEnd()
  }
  const finalText = candidate.length > 0 ? `${candidate}${ellipsis}` : ellipsis

  return { fontSize: flooredMin, text: finalText }
}

/**
 * Binary-searches integer font sizes in [minFontSize, maxFontSize] for the
 * largest size whose word-wrapped line count fits both `maxHeight` and
 * `maxLines` (when given). If even `minFontSize` doesn't fit, returns
 * `minFontSize` with the overflow lines squeezed into the last line + an
 * ellipsis (see truncateWithEllipsis) — so the result NEVER exceeds the
 * caller's box, only the (rare) worst case reads slightly truncated.
 */
export function autofitText(options: AutofitOptions): AutofitResult {
  const {
    text,
    maxWidth,
    maxHeight,
    minFontSize,
    maxFontSize,
    lineHeight = DEFAULT_LINE_HEIGHT,
    maxLines,
    charWidthEm = defaultCharWidthEm,
  } = options

  if (minFontSize <= 0 || maxFontSize <= 0 || minFontSize > maxFontSize) {
    throw new Error(`autofitText: invalid font size bounds (min ${minFontSize}, max ${maxFontSize}).`)
  }
  if (maxWidth <= 0 || maxHeight <= 0) {
    throw new Error(`autofitText: invalid box size (width ${maxWidth}, height ${maxHeight}).`)
  }

  const trimmed = text.trim()
  if (!trimmed) {
    return { fontSize: maxFontSize, lines: [""], lineHeightPx: maxFontSize * lineHeight }
  }

  const fits = (fontSize: number): string[] | null => {
    const lines = wrapLines(trimmed, fontSize, maxWidth, charWidthEm)
    if (maxLines !== undefined && lines.length > maxLines) return null
    if (lines.length * fontSize * lineHeight > maxHeight) return null
    return lines
  }

  let lo = Math.floor(minFontSize)
  let hi = Math.floor(maxFontSize)
  let best: { fontSize: number; lines: string[] } | null = null

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    const lines = fits(mid)
    if (lines) {
      best = { fontSize: mid, lines }
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }

  if (best) {
    return { fontSize: best.fontSize, lines: best.lines, lineHeightPx: best.fontSize * lineHeight }
  }

  // Nothing fit even at minFontSize — clamp to it and squeeze any overflow
  // into the last line with an ellipsis, so the result is still safe to
  // render inside the given box.
  const flooredMin = Math.floor(minFontSize)
  const lines = wrapLines(trimmed, flooredMin, maxWidth, charWidthEm)
  const cappedLines =
    maxLines !== undefined ? truncateWithEllipsis(lines, maxLines, flooredMin, maxWidth, charWidthEm) : lines

  return { fontSize: flooredMin, lines: cappedLines, lineHeightPx: flooredMin * lineHeight }
}
