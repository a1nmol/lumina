// Decoration primitives for the code-rendered template engine — small,
// pure, composable Satori element builders that every template def draws
// from for its "designer accents" (icon glyphs, rules, rings, bands, dot
// grids, corner ticks, highlight sweeps). NO emojis anywhere in this
// pipeline — every glyph here is a vendored, stroke-based Lucide outline
// path rendered as a real inline SVG `data:` URI, matching the crisp,
// editorial look of the rest of the poster typography.
//
// Design method (see the Wave 2 brief): RESTRAINT + VARIETY. Every builder
// here is dumb geometry + color — it takes explicit size/color/opacity
// arguments and returns an unpositioned (normal-flow) element. Templates
// decide WHERE an accent goes (their own "safe zones") and, for anything
// that needs to bleed off-canvas or sit behind another element, wrap the
// result in `positioned()` below. Keeping placement in the template layer
// (not baked into these builders) is what keeps "max 2-3 accents, in
// template-defined safe zones" enforceable per template rather than
// accidental.
//
// Colors passed in must always come from the render's resolved ColorRoles
// (catalog.ts#resolveColorRoles) — never a hardcoded hex — so every accent
// stays palette- and contrast-safe automatically.

import { readFile } from "node:fs/promises"
import path from "node:path"

import { box, img, type SatoriElement } from "./types"
import { hashSeed } from "./variants"

// ===========================================================================
// Vendored icon paths — Lucide outline set (github.com/lucide-icons/lucide,
// ISC license), transcribed verbatim from the pinned lucide-react version
// already in package.json so these always match the icons used elsewhere in
// the app. Stroke-based (fill="none", stroke=colorHex, stroke-width 2,
// round caps/joins), 24x24 viewBox — identical visual language to the rest
// of the product's iconography.
// ===========================================================================

interface IconNode {
  tag: "path" | "circle" | "rect"
  attrs: Record<string, string>
}

export const ICON_KEYS = [
  "calendar",
  "map-pin",
  "clock",
  "trophy",
  "sparkles",
  "arrow-right",
  "star",
  "megaphone",
  "tag",
  "phone",
  "scissors",
  "coffee",
  "wrench",
  "check",
] as const

export type IconKey = (typeof ICON_KEYS)[number]

const ICON_NODES: Record<IconKey, IconNode[]> = {
  calendar: [
    { tag: "path", attrs: { d: "M8 2v4" } },
    { tag: "path", attrs: { d: "M16 2v4" } },
    { tag: "rect", attrs: { width: "18", height: "18", x: "3", y: "4", rx: "2" } },
    { tag: "path", attrs: { d: "M3 10h18" } },
  ],
  "map-pin": [
    {
      tag: "path",
      attrs: {
        d: "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0",
      },
    },
    { tag: "circle", attrs: { cx: "12", cy: "10", r: "3" } },
  ],
  clock: [
    { tag: "circle", attrs: { cx: "12", cy: "12", r: "10" } },
    { tag: "path", attrs: { d: "M12 6v6l4 2" } },
  ],
  trophy: [
    { tag: "path", attrs: { d: "M10 14.66v1.626a2 2 0 0 1-.976 1.696A5 5 0 0 0 7 21.978" } },
    { tag: "path", attrs: { d: "M14 14.66v1.626a2 2 0 0 0 .976 1.696A5 5 0 0 1 17 21.978" } },
    { tag: "path", attrs: { d: "M18 9h1.5a1 1 0 0 0 0-5H18" } },
    { tag: "path", attrs: { d: "M4 22h16" } },
    { tag: "path", attrs: { d: "M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z" } },
    { tag: "path", attrs: { d: "M6 9H4.5a1 1 0 0 1 0-5H6" } },
  ],
  sparkles: [
    {
      tag: "path",
      attrs: {
        d: "M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z",
      },
    },
    { tag: "path", attrs: { d: "M20 2v4" } },
    { tag: "path", attrs: { d: "M22 4h-4" } },
    { tag: "circle", attrs: { cx: "4", cy: "20", r: "2" } },
  ],
  "arrow-right": [
    { tag: "path", attrs: { d: "M5 12h14" } },
    { tag: "path", attrs: { d: "m12 5 7 7-7 7" } },
  ],
  star: [
    {
      tag: "path",
      attrs: {
        d: "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z",
      },
    },
  ],
  megaphone: [
    {
      tag: "path",
      attrs: {
        d: "M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z",
      },
    },
    { tag: "path", attrs: { d: "M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14" } },
    { tag: "path", attrs: { d: "M8 6v8" } },
  ],
  tag: [
    {
      tag: "path",
      attrs: {
        d: "M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z",
      },
    },
    { tag: "circle", attrs: { cx: "7.5", cy: "7.5", r: ".5", fill: "currentColor" } },
  ],
  phone: [
    {
      tag: "path",
      attrs: {
        d: "M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384",
      },
    },
  ],
  scissors: [
    { tag: "circle", attrs: { cx: "6", cy: "6", r: "3" } },
    { tag: "path", attrs: { d: "M8.12 8.12 12 12" } },
    { tag: "path", attrs: { d: "M20 4 8.12 15.88" } },
    { tag: "circle", attrs: { cx: "6", cy: "18", r: "3" } },
    { tag: "path", attrs: { d: "M14.8 14.8 20 20" } },
  ],
  coffee: [
    { tag: "path", attrs: { d: "M10 2v2" } },
    { tag: "path", attrs: { d: "M14 2v2" } },
    { tag: "path", attrs: { d: "M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1" } },
    { tag: "path", attrs: { d: "M6 2v2" } },
  ],
  wrench: [
    {
      tag: "path",
      attrs: {
        d: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z",
      },
    },
  ],
  check: [{ tag: "path", attrs: { d: "M20 6 9 17l-5-5" } }],
}

function iconSvgMarkup(iconKey: IconKey, colorHex: string): string {
  const inner = ICON_NODES[iconKey]
    .map((node) => {
      const isFilled = node.attrs.fill === "currentColor"
      const attrPairs = Object.entries(node.attrs)
        .filter(([key]) => key !== "fill")
        .map(([key, value]) => `${key}="${value}"`)
      attrPairs.push(`fill="${isFilled ? colorHex : "none"}"`)
      return `<${node.tag} ${attrPairs.join(" ")} />`
    })
    .join("")
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${colorHex}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`
}

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

/** A single vendored Lucide-outline glyph, rendered `stroke=colorHex`, sized `size`x`size`. Use inline next to text (never as an emoji substitute). */
export function iconChip(iconKey: IconKey, colorHex: string, size: number): SatoriElement {
  return img(svgDataUri(iconSvgMarkup(iconKey, colorHex)), { width: size, height: size, flexShrink: 0 })
}

// Lucide's "quote" glyph (two closed comma paths — github.com/lucide-icons/lucide,
// ISC license) is normally rendered stroked/outlined like the icon set above,
// but each path is already a closed shape, so filling it solid (no stroke)
// produces a proper bold comma-quote mark instead of a thin font-rendered
// glyph (quote-v1's Wave 1 bug). Kept separate from ICON_NODES/iconChip since
// it's always filled, never stroked.
const QUOTE_MARK_PATHS = [
  "M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z",
  "M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z",
]

/** A bold, solid-filled double-comma quote mark (not stroked) — sized `size`x`size`, colored `colorHex`. Use as quote-v1's header glyph and/or an oversized low-opacity watermark. */
export function quoteMark(colorHex: string, size: number): SatoriElement {
  const inner = QUOTE_MARK_PATHS.map((d) => `<path d="${d}" fill="${colorHex}" />`).join("")
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">${inner}</svg>`
  return img(svgDataUri(svg), { width: size, height: size, flexShrink: 0 })
}

// ===========================================================================
// Placement helper — decorations below are pure/unpositioned; templates wrap
// anything that needs to bleed off-canvas or sit behind another element with
// this. See module header.
// ===========================================================================

/** Wraps `child` in a `position: absolute` box at the given offsets — the one placement primitive templates use to put a decoration in a specific safe zone (or partially off-canvas). */
export function positioned(
  child: SatoriElement,
  offsets: { top?: number; left?: number; right?: number; bottom?: number }
): SatoriElement {
  return box({ position: "absolute", ...offsets }, [child])
}

// ===========================================================================
// Decoration builders
// ===========================================================================

/** A short solid bar — the classic headline underline. Inline (normal flow); place with a marginTop from the caller. */
export function accentBar(width: number, height: number, colorHex: string, radius: number): SatoriElement {
  return box({ width, height, backgroundColor: colorHex, borderRadius: radius, flexShrink: 0 })
}

/**
 * A low-opacity, slightly rotated rounded rect meant to sit BEHIND a key
 * text line (e.g. a highlight badge or prize number) — sized to roughly the
 * text's bounding box. Callers wrap this + the text together in a
 * `position: relative` box, with this one `positioned()` at a small negative
 * inset so it "sweeps" a little past the text's edges.
 */
export function highlightSweep(width: number, height: number, colorHex: string, opacity = 0.2): SatoriElement {
  return box({
    width,
    height,
    backgroundColor: colorHex,
    opacity,
    borderRadius: Math.round(height * 0.32),
    transform: "rotate(-1.5deg)",
  })
}

/** A circle OUTLINE (never filled) — the large "bleed partially off-canvas" accent. Place with `positioned()` using negative top/left/right so part of it runs past the poster edge. */
export function ringAccent(diameter: number, strokeWidthPx: number, colorHex: string, opacity = 0.5): SatoriElement {
  return box({
    width: diameter,
    height: diameter,
    borderRadius: 9999,
    borderWidth: strokeWidthPx,
    borderStyle: "solid",
    borderColor: colorHex,
    opacity,
  })
}

/** One L-shaped corner bracket (top-left orientation, self-contained). Place at each corner via `positioned()`; rotate the wrapper 90/180/270deg for the other three corners. */
export function cornerTicks(colorHex: string, tickLength = 26, thicknessPx = 3): SatoriElement {
  return box({ position: "relative", width: tickLength, height: tickLength }, [
    positioned(box({ width: tickLength, height: thicknessPx, backgroundColor: colorHex, borderRadius: thicknessPx }), {
      top: 0,
      left: 0,
    }),
    positioned(box({ width: thicknessPx, height: tickLength, backgroundColor: colorHex, borderRadius: thicknessPx }), {
      top: 0,
      left: 0,
    }),
  ])
}

/** A literal grid of tiny dots (explicit divs, not a CSS background pattern — bulletproof under Satori). Capped at 6x6 so it always reads as a restrained texture patch, never noise. */
export function dotGrid(cols: number, rows: number, dotPx: number, gapPx: number, colorHex: string, opacity = 0.5): SatoriElement {
  const cappedCols = Math.max(1, Math.min(Math.round(cols), 6))
  const cappedRows = Math.max(1, Math.min(Math.round(rows), 6))

  const rowEls = Array.from({ length: cappedRows }, (_, rowIndex) =>
    box(
      { flexDirection: "row", marginTop: rowIndex === 0 ? 0 : gapPx },
      Array.from({ length: cappedCols }, (_, colIndex) =>
        box({
          width: dotPx,
          height: dotPx,
          borderRadius: 9999,
          backgroundColor: colorHex,
          opacity,
          marginLeft: colIndex === 0 ? 0 : gapPx,
        })
      )
    )
  )

  return box({ flexDirection: "column" }, rowEls)
}

/** A wide, rotated (-8deg) rect strip — for section separation / background energy behind a lower third or similar. Place via `positioned()`, sized wider/taller than its slot so the rotation never reveals a corner gap. */
export function diagonalBand(colorHex: string, opacity = 0.14, width = 1600, height = 260): SatoriElement {
  return box({ width, height, backgroundColor: colorHex, opacity, transform: "rotate(-8deg)" })
}

/** A thin horizontal rule with a small diamond terminal dot — a quiet divider between two text blocks (e.g. subhead / footer, or quote / attribution). Inline (normal flow). */
export function ruleLine(widthPx: number, colorHex: string, thicknessPx = 2): SatoriElement {
  const dotSize = thicknessPx + 5
  const gap = 10
  const lineWidth = Math.max(0, widthPx - dotSize - gap)
  return box({ flexDirection: "row", alignItems: "center" }, [
    box({ width: dotSize, height: dotSize, backgroundColor: colorHex, transform: "rotate(45deg)", flexShrink: 0 }),
    box({ width: gap, height: 1 }),
    box({ width: lineWidth, height: thicknessPx, backgroundColor: colorHex, borderRadius: thicknessPx, flexShrink: 0 }),
  ])
}

// ===========================================================================
// Themed stickers (Wave 3) — vendored, license-approved decorative art
// (src/lib/templates/assets/, generated by scripts/vendor-theme-assets.ts;
// resolved per-theme by src/lib/templates/themes.ts). Unlike the geometric
// decorations above, these are real illustrated SVGs read from disk, so
// loading happens here (not at import time) and is cached in memory — the
// same "read once off disk, reuse across every render" discipline as
// render.ts#loadTemplateFonts. This directory must stay in next.config.ts's
// outputFileTracingIncludes (mirrors the fonts/ entry there) or production
// lambdas will 404 on the read below.
// ===========================================================================

/** Directory the vendored theme SVGs live under — resolved from process.cwd() (see render.ts#fontsDir for why: works under both `next`'s server bundler and plain Node/vitest). */
function themeAssetsDir(): string {
  return path.join(process.cwd(), "src", "lib", "templates", "assets")
}

const stickerSvgCache = new Map<string, Promise<string | null>>()

async function readStickerSvgUncached(relativePath: string): Promise<string | null> {
  try {
    return await readFile(path.join(themeAssetsDir(), relativePath), "utf8")
  } catch (error) {
    console.error(
      `[templates] Failed to load sticker asset "${relativePath}": ${error instanceof Error ? error.message : String(error)}`
    )
    return null
  }
}

/** Reads (and caches) one vendored sticker SVG's raw markup. Never throws — returns null on any read failure, matching render.ts#loadLogoDataUri's "skip cleanly" contract, since a missing/corrupt decorative asset should never fail a whole poster render. */
function loadStickerSvgMarkup(relativePath: string): Promise<string | null> {
  let cached = stickerSvgCache.get(relativePath)
  if (!cached) {
    cached = readStickerSvgUncached(relativePath)
    stickerSvgCache.set(relativePath, cached)
  }
  return cached
}

const RECOLORABLE_ATTR_RE = /(fill|stroke)="(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)"/g

/**
 * Crude but safe recolor: replaces every quoted `fill=`/`stroke=` value in
 * `markup` with `tintHex`, EXCEPT literal `"none"` (which must stay
 * transparent — it's structural, not a color). This is intentionally
 * simplistic (good enough for this small, hand-picked, already-inspected
 * asset set) — never run it against arbitrary/untrusted SVG.
 */
function tintSvgMarkup(markup: string, tintHex: string): string {
  return markup.replace(RECOLORABLE_ATTR_RE, (match, attr: string, value: string) =>
    value.toLowerCase() === "none" ? match : `${attr}="${tintHex}"`
  )
}

/**
 * One themed decorative sticker: loads the vendored SVG at
 * `svgRelativePath` (relative to src/lib/templates/assets/ — e.g.
 * "christmas/christmas-tree.svg", see assets/manifest.ts), sizes it to
 * `sizePx`x`sizePx`, rotates it `rotationDeg` degrees, fades it to `opacity`,
 * and embeds it as a data-URI `<img>`.
 *
 * Multicolor "flat" sources (every Noto Emoji asset) keep their own
 * baked-in colors — never pass `tintHex` for those, it would wreck the
 * illustration. Mono/two-tone IconPark sources MAY be recolored by passing
 * `tintHex` (see tintSvgMarkup above) so they pick up a resolved brand/theme
 * role color instead of IconPark's default palette.
 *
 * Returns null (never throws) when the asset can't be read — callers
 * (template defs) must skip that sticker slot cleanly, same contract as
 * every other optional decoration in this pipeline.
 */
export async function stickerElement(
  svgRelativePath: string,
  sizePx: number,
  rotationDeg: number,
  opacity: number,
  tintHex?: string
): Promise<SatoriElement | null> {
  const markup = await loadStickerSvgMarkup(svgRelativePath)
  if (!markup) return null
  const finalMarkup = tintHex ? tintSvgMarkup(markup, tintHex) : markup
  return img(svgDataUri(finalMarkup), {
    width: sizePx,
    height: sizePx,
    opacity,
    transform: `rotate(${rotationDeg}deg)`,
    flexShrink: 0,
  })
}

/** Deterministic small rotation jitter in [-8, 8] degrees from a seed string — the "slight rotation jitter" every sticker placement should use so a cluster of 2-3 stickers never looks perfectly grid-aligned (which reads as a sticker SHEET, not a placed accent). Pass a per-sticker-unique seed (e.g. `${renderSeed}:${slotName}`) so stickers in the same render still jitter independently. */
export function stickerRotationJitter(seedString: string): number {
  // variants.ts#hashSeed is FNV-1a over the string -> unsigned 32-bit int;
  // mod 17 maps evenly onto the 17 integers from -8 to 8 inclusive.
  return (hashSeed(seedString) % 17) - 8
}
