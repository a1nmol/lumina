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

import { pickTextColor } from "./contrast"
import { box, img, type SatoriElement } from "./types"
import { hashSeed, pickVariant } from "./variants"

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
  // Wave 4 — Tier A semantic vocabulary (hand-transcribed Lucide outline
  // paths, same ISC-licensed source + verbatim transcription discipline as
  // the set above; see design-post.ts's element catalog + module header).
  "users",
  "code",
  "keyboard",
  "laptop",
  "bug",
  "rocket",
  "dumbbell",
  "music-note",
  "gift",
  "camera",
  "book",
  "heart",
  "leaf",
  "paw",
  "pizza",
  "cup",
  "scale",
  "calendar-check",
  "mic",
  "ticket",
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
  // --- Wave 4 Tier A additions (verbatim from lucide-react's vendored path
  // data, pinned version already in package.json — see module header) ---
  users: [
    { tag: "path", attrs: { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" } },
    { tag: "path", attrs: { d: "M16 3.128a4 4 0 0 1 0 7.744" } },
    { tag: "path", attrs: { d: "M22 21v-2a4 4 0 0 0-3-3.87" } },
    { tag: "circle", attrs: { cx: "9", cy: "7", r: "4" } },
  ],
  code: [
    { tag: "path", attrs: { d: "m16 18 6-6-6-6" } },
    { tag: "path", attrs: { d: "m8 6-6 6 6 6" } },
  ],
  keyboard: [
    { tag: "path", attrs: { d: "M10 8h.01" } },
    { tag: "path", attrs: { d: "M12 12h.01" } },
    { tag: "path", attrs: { d: "M14 8h.01" } },
    { tag: "path", attrs: { d: "M16 12h.01" } },
    { tag: "path", attrs: { d: "M18 8h.01" } },
    { tag: "path", attrs: { d: "M6 8h.01" } },
    { tag: "path", attrs: { d: "M7 16h10" } },
    { tag: "path", attrs: { d: "M8 12h.01" } },
    { tag: "rect", attrs: { width: "20", height: "16", x: "2", y: "4", rx: "2" } },
  ],
  laptop: [
    {
      tag: "path",
      attrs: {
        d: "M18 5a2 2 0 0 1 2 2v8.526a2 2 0 0 0 .212.897l1.068 2.127a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45l1.068-2.127A2 2 0 0 0 4 15.526V7a2 2 0 0 1 2-2z",
      },
    },
    { tag: "path", attrs: { d: "M20.054 15.987H3.946" } },
  ],
  bug: [
    { tag: "path", attrs: { d: "M12 20v-9" } },
    { tag: "path", attrs: { d: "M14 7a4 4 0 0 1 4 4v3a6 6 0 0 1-12 0v-3a4 4 0 0 1 4-4z" } },
    { tag: "path", attrs: { d: "M14.12 3.88 16 2" } },
    { tag: "path", attrs: { d: "M21 21a4 4 0 0 0-3.81-4" } },
    { tag: "path", attrs: { d: "M21 5a4 4 0 0 1-3.55 3.97" } },
    { tag: "path", attrs: { d: "M22 13h-4" } },
    { tag: "path", attrs: { d: "M3 21a4 4 0 0 1 3.81-4" } },
    { tag: "path", attrs: { d: "M3 5a4 4 0 0 0 3.55 3.97" } },
    { tag: "path", attrs: { d: "M6 13H2" } },
    { tag: "path", attrs: { d: "m8 2 1.88 1.88" } },
    { tag: "path", attrs: { d: "M9 7.13V6a3 3 0 1 1 6 0v1.13" } },
  ],
  rocket: [
    { tag: "path", attrs: { d: "M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" } },
    {
      tag: "path",
      attrs: {
        d: "M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09",
      },
    },
    {
      tag: "path",
      attrs: {
        d: "M9 12a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2z",
      },
    },
    { tag: "path", attrs: { d: "M9 12H4s.55-3.03 2-4c1.62-1.08 5 .05 5 .05" } },
  ],
  dumbbell: [
    {
      tag: "path",
      attrs: {
        d: "M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z",
      },
    },
    { tag: "path", attrs: { d: "m2.5 21.5 1.4-1.4" } },
    { tag: "path", attrs: { d: "m20.1 3.9 1.4-1.4" } },
    {
      tag: "path",
      attrs: {
        d: "M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z",
      },
    },
    { tag: "path", attrs: { d: "m9.6 14.4 4.8-4.8" } },
  ],
  "music-note": [
    { tag: "path", attrs: { d: "M9 18V5l12-2v13" } },
    { tag: "circle", attrs: { cx: "6", cy: "18", r: "3" } },
    { tag: "circle", attrs: { cx: "18", cy: "16", r: "3" } },
  ],
  gift: [
    { tag: "path", attrs: { d: "M12 7v14" } },
    { tag: "path", attrs: { d: "M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8" } },
    {
      tag: "path",
      attrs: { d: "M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5" },
    },
    { tag: "rect", attrs: { x: "3", y: "7", width: "18", height: "4", rx: "1" } },
  ],
  camera: [
    {
      tag: "path",
      attrs: {
        d: "M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z",
      },
    },
    { tag: "circle", attrs: { cx: "12", cy: "13", r: "3" } },
  ],
  book: [
    {
      tag: "path",
      attrs: {
        d: "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20",
      },
    },
  ],
  heart: [
    {
      tag: "path",
      attrs: {
        d: "M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5",
      },
    },
  ],
  leaf: [
    {
      tag: "path",
      attrs: { d: "M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" },
    },
    { tag: "path", attrs: { d: "M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" } },
  ],
  paw: [
    { tag: "circle", attrs: { cx: "11", cy: "4", r: "2" } },
    { tag: "circle", attrs: { cx: "18", cy: "8", r: "2" } },
    { tag: "circle", attrs: { cx: "20", cy: "16", r: "2" } },
    {
      tag: "path",
      attrs: {
        d: "M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z",
      },
    },
  ],
  pizza: [
    { tag: "path", attrs: { d: "m12 14-1 1" } },
    { tag: "path", attrs: { d: "m13.75 18.25-1.25 1.42" } },
    { tag: "path", attrs: { d: "M17.775 5.654a15.68 15.68 0 0 0-12.121 12.12" } },
    { tag: "path", attrs: { d: "M18.8 9.3a1 1 0 0 0 2.1 7.7" } },
    {
      tag: "path",
      attrs: {
        d: "M21.964 20.732a1 1 0 0 1-1.232 1.232l-18-5a1 1 0 0 1-.695-1.232A19.68 19.68 0 0 1 15.732 2.037a1 1 0 0 1 1.232.695z",
      },
    },
  ],
  cup: [
    { tag: "path", attrs: { d: "m6 8 1.75 12.28a2 2 0 0 0 2 1.72h4.54a2 2 0 0 0 2-1.72L18 8" } },
    { tag: "path", attrs: { d: "M5 8h14" } },
    { tag: "path", attrs: { d: "M7 15a6.47 6.47 0 0 1 5 0 6.47 6.47 0 0 0 5 0" } },
    { tag: "path", attrs: { d: "m12 8 1-6h2" } },
  ],
  scale: [
    { tag: "path", attrs: { d: "M12 3v18" } },
    { tag: "path", attrs: { d: "m19 8 3 8a5 5 0 0 1-6 0zV7" } },
    { tag: "path", attrs: { d: "M3 7h1a17 17 0 0 0 8-2 17 17 0 0 0 8 2h1" } },
    { tag: "path", attrs: { d: "m5 8 3 8a5 5 0 0 1-6 0zV7" } },
    { tag: "path", attrs: { d: "M7 21h10" } },
  ],
  "calendar-check": [
    { tag: "path", attrs: { d: "M8 2v4" } },
    { tag: "path", attrs: { d: "M16 2v4" } },
    { tag: "rect", attrs: { width: "18", height: "18", x: "3", y: "4", rx: "2" } },
    { tag: "path", attrs: { d: "M3 10h18" } },
    { tag: "path", attrs: { d: "m9 16 2 2 4-4" } },
  ],
  mic: [
    { tag: "path", attrs: { d: "M12 19v3" } },
    { tag: "path", attrs: { d: "M19 10v2a7 7 0 0 1-14 0v-2" } },
    { tag: "rect", attrs: { x: "9", y: "2", width: "6", height: "13", rx: "3" } },
  ],
  ticket: [
    {
      tag: "path",
      attrs: {
        d: "M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z",
      },
    },
    { tag: "path", attrs: { d: "M13 5v2" } },
    { tag: "path", attrs: { d: "M13 17v2" } },
    { tag: "path", attrs: { d: "M13 11v2" } },
  ],
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

const DEFAULT_ELEMENT_CHIP_DIAMETER = 64
const ELEMENT_CHIP_ICON_FRACTION = 0.5

/**
 * Composes 1-2 already-built icon glyphs (Tier A `iconChip` output or Tier B
 * `stickerElement` output) into a row of "element chips" — each glyph
 * wrapped in a solid-tinted circular backdrop (`chipColorHex`) with a
 * translucent contrast ring for edge definition, spaced with a real gap.
 *
 * This is the ONLY way src/lib/templates/elements.ts's semantic elements
 * (Wave 4 — the AI-picked "keyboard"/"trophy"/"coffee-machine" vocabulary)
 * should ever render inline. A bare floating icon glyph at "in-between"
 * sizes (roughly 30-200px, no backdrop) reads as an accident, not a design
 * decision — every template that places elements inline must call this
 * (diameter 48-96px is the deliberate-object range) rather than reaching
 * for `iconChip`'s raw output directly. The other legitimate size tier is
 * MUCH bigger: a 300px+, low-opacity, corner-bled watermark (see
 * density.ts's rich-mode "watermark-icon" fill strategy) — nothing in
 * between is acceptable.
 */
export function elementChipRow(icons: SatoriElement[], chipColorHex: string, diameterPx = DEFAULT_ELEMENT_CHIP_DIAMETER, gapPx = 16): SatoriElement {
  const capped = icons.slice(0, 2)
  const ringHex = pickTextColor(chipColorHex)
  return box(
    { flexDirection: "row", alignItems: "center", flexShrink: 0 },
    capped.flatMap((icon, index) => [
      index > 0 ? box({ width: gapPx, height: 1 }) : null,
      box(
        {
          width: diameterPx,
          height: diameterPx,
          borderRadius: 9999,
          backgroundColor: chipColorHex,
          borderWidth: 2,
          borderStyle: "solid",
          borderColor: ringHex,
          opacity: 1,
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        },
        [icon]
      ),
    ].filter((child): child is SatoriElement => Boolean(child)))
  )
}

/** The icon glyph size to request (from iconChip/stickerElement) for one chip in an `elementChipRow` of diameter `diameterPx` — keeps the glyph comfortably inset from the chip's own edge. */
export function elementChipIconSize(diameterPx = DEFAULT_ELEMENT_CHIP_DIAMETER): number {
  return Math.round(diameterPx * ELEMENT_CHIP_ICON_FRACTION)
}

// ===========================================================================
// Tall-format mid-band guarantee (Wave 4, design-review fix) — a tall canvas
// (portrait 1080x1350, story 1080x1920 — see types.ts#isTallFormat) leaves a
// flat, empty middle between a template's hero group and its footer once
// both are pinned to their own ends via `justify-content: space-between`.
// This builds ONE deliberate mid-band occupant, picked seeded from
// MID_BAND_FILLER_KINDS, for the 4 full-axis templates to insert as a THIRD
// in-flow flex sibling between hero and footer — flexbox's own
// space-between then centers it in whatever gap remains, so this is placed
// entirely by layout, never a fixed pixel/percentage offset into a
// variable-height gap (the midGapSticker lesson, generalized).
// ===========================================================================

export const MID_BAND_FILLER_KINDS = ["watermark-icon", "expanded-dots"] as const
export type MidBandFillerKind = (typeof MID_BAND_FILLER_KINDS)[number]

/**
 * Builds one mid-band filler:
 * - "watermark-icon": a single Tier-A glyph at watermark scale (320-464px,
 *   the 300-500px range the brief calls for), very low opacity (0.09),
 *   nudged toward one margin (via `justify-content`, still normal flow —
 *   never `position: absolute`).
 * - "expanded-dots": a centered, max-size (6x6, the dotGrid cap) dot field
 *   at LARGE cell/gap sizing (dot 22px, gap 34px -> a ~324px patch) and a
 *   bolder opacity than the corner-bleed version this pipeline uses
 *   elsewhere, since this one has to read as a real occupant filling a
 *   genuinely tall gap on its own, not a quiet corner texture.
 * `iconKey` should be the first resolved semantic element's Tier-A icon
 * when available, else a neutral fallback (callers already have this
 * pattern from the rich-density "watermark-icon" fill strategy).
 */
export function midBandFiller(kind: MidBandFillerKind, iconKey: IconKey, colorHex: string, seed: string): SatoriElement {
  if (kind === "watermark-icon") {
    const sizePx = 320 + pickVariant(`${seed}:midband-size`, 5) * 36 // 320, 356, 392, 428, or 464px.
    const alignEnd = pickVariant(`${seed}:midband-side`, 2) === 0
    return box({ flexDirection: "row", justifyContent: alignEnd ? "flex-end" : "flex-start" }, [
      box({ opacity: 0.09 }, [iconChip(iconKey, colorHex, sizePx)]),
    ])
  }
  return box({ flexDirection: "row", justifyContent: "center" }, [dotGrid(6, 6, 22, 34, colorHex, 0.34)])
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
// Connector devices (Wave 4) — hand-authored SVG-path "sketchy" annotation
// marks (arrows, circles, underlines, bursts...) that visually CONNECT two
// parts of a poster (e.g. an arrow from the eyebrow to the CTA, a scribble
// circling the price). Deliberately NOT rough.js/rough-notation (explicitly
// rejected — no new runtime deps): every shape below is a small, pure path
// generator, seeded via variants.ts#pickVariant/hashSeed for deterministic
// per-render variety, same discipline as every other builder in this file.
//
// Restraint rule (owner law): a template picks AT MOST ONE of these per
// render, and when one is present, the template's own "big accent" drops to
// none/small — see each template def's CONNECTOR_AXIS for how that's wired.
//
// Off-canvas guard (design-review fix): curvedArrow and dottedFlowArc are
// DIRECTIONAL — every hand-authored shape in CURVED_ARROW_SHAPES puts its
// arrowhead near local x=0.85-0.92 of its own bounding box, unlike the
// abstract background accents (rings/blobs/bands) which have no single
// focal point and are DESIGNED to bleed dramatically off-canvas. Giving one
// of these two a negative "bleed" offset — even a modest one — reliably
// crops the arrowhead itself, since the ink is concentrated at the box's
// far edge, not its center. Callers must size + place curvedArrow/
// dottedFlowArc so the WHOLE box sits inside a reserved zone (e.g. a
// template's own margin gutter) with zero bleed; assertConnectorFitsReservedZone
// below is a dev-time guard against reintroducing the crop.
//
// Stroke weight (design-review fix): every stroke-based connector's default
// strokeWidth/thicknessPx now targets 6-9px at this pipeline's 1080px base
// scale — thin enough to still read "hand-drawn," but heavy enough to
// survive being viewed at social-feed thumbnail zoom (a 2-3px stroke reads
// as a faint hairline once scaled down in a feed). Never pass an explicit
// override below ~6px.
// ===========================================================================

export const CONNECTOR_KEYS = [
  "curved-arrow",
  "scribble-circle",
  "scribble-underline",
  "zigzag-divider",
  "dotted-flow-arc",
  "starburst",
  "callout-bubble-outline",
  "tape-strip",
  "torn-edge-strip",
  "organic-blob",
] as const

export type ConnectorKey = (typeof CONNECTOR_KEYS)[number]

interface Pt {
  x: number
  y: number
}

/** Deterministic per-index jitter in [-magnitude, magnitude], seeded from `${seed}:${index}` — the shared "hand-drawn wobble" primitive every sketchy connector below uses instead of Math.random(). */
function seededJitter(seed: string, index: number, magnitude: number): number {
  const h = hashSeed(`${seed}:${index}`)
  return ((h % 1000) / 1000 - 0.5) * 2 * magnitude
}

/**
 * Dev-time guard: throws if a proposed curvedArrow/dottedFlowArc bounding
 * box (`boxWidthPx`) is wider than the reserved zone it's meant to sit
 * inside with zero bleed (`reservedZonePx` — typically a template's own
 * margin constant). See this section's module header for why these two
 * connector kinds specifically must never bleed off-canvas: their arrowhead
 * sits near the box's far edge, so any bleed crops the one part of the
 * shape that has to stay legible. Call this once at the placement site
 * rather than relying on the convention silently — a future edit that
 * widens the box without updating the offset fails loudly here instead of
 * shipping a cropped arrow.
 */
export function assertConnectorFitsReservedZone(boxWidthPx: number, reservedZonePx: number): void {
  if (boxWidthPx > reservedZonePx) {
    throw new Error(
      `Connector box (${boxWidthPx}px) exceeds its reserved zone (${reservedZonePx}px) — curvedArrow/dottedFlowArc must never bleed off-canvas or their arrowhead gets cropped. Shrink the box or widen the reserved zone.`
    )
  }
}

/** Builds a small arrowhead (two line segments meeting at `tip`, oriented along `angleRad`) as a path `d` fragment — shared by curvedArrow and dottedFlowArc. */
function arrowHeadD(tip: Pt, angleRad: number, headLen: number, spread = 0.46): string {
  const a1 = angleRad + Math.PI - spread
  const a2 = angleRad + Math.PI + spread
  const p1 = { x: tip.x + headLen * Math.cos(a1), y: tip.y + headLen * Math.sin(a1) }
  const p2 = { x: tip.x + headLen * Math.cos(a2), y: tip.y + headLen * Math.sin(a2) }
  return `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} L ${tip.x.toFixed(1)} ${tip.y.toFixed(1)} L ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
}

/** 3 hand-authored curve shapes (start/control/end points, as fractions of width/height) shared by curvedArrow + dottedFlowArc — kept within [0.04, 0.96] of the box so the stroke + arrowhead never bleed past their own `width`x`height`. */
const CURVED_ARROW_SHAPES: Array<(w: number, h: number) => { start: Pt; ctrl: Pt; end: Pt }> = [
  (w, h) => ({ start: { x: w * 0.08, y: h * 0.85 }, ctrl: { x: w * 0.04, y: h * 0.1 }, end: { x: w * 0.9, y: h * 0.18 } }),
  (w, h) => ({ start: { x: w * 0.06, y: h * 0.2 }, ctrl: { x: w * 0.62, y: h * 0.04 }, end: { x: w * 0.92, y: h * 0.82 } }),
  (w, h) => ({ start: { x: w * 0.1, y: h * 0.12 }, ctrl: { x: w * 0.85, y: h * 0.06 }, end: { x: w * 0.85, y: h * 0.9 } }),
]

/**
 * A curving bezier arrow with an arrowhead at its end, sized to `width`x`height` — one of 3 hand-authored curve shapes, picked from `${seed}:connector-shape`. Pass `flip: true` to mirror vertically (top<->bottom) so the same 3 shapes can point either up (into a headline) or down (into a CTA) without a second shape set — no unsupported CSS transform needed, the mirroring happens in the point math.
 * Semantic pairing (design brief, hard rule): use this to visually connect the eyebrow/headline to the CTA line — never more than once per render, and never alongside this template's own big accent.
 */
export function curvedArrow(width: number, height: number, colorHex: string, seed: string, strokeWidth = 8, flip = false): SatoriElement {
  const shapeIndex = pickVariant(`${seed}:connector-shape`, CURVED_ARROW_SHAPES.length)
  const raw = CURVED_ARROW_SHAPES[shapeIndex](width, height)
  const mirror = (p: Pt): Pt => (flip ? { x: p.x, y: height - p.y } : p)
  const start = mirror(raw.start)
  const ctrl = mirror(raw.ctrl)
  const end = mirror(raw.end)

  const angle = Math.atan2(end.y - ctrl.y, end.x - ctrl.x)
  const headLen = Math.max(10, strokeWidth * 3.2)
  const curveD = `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} Q ${ctrl.x.toFixed(1)} ${ctrl.y.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`
  const headD = arrowHeadD(end, angle, headLen)
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" fill="none">`,
    `<path d="${curveD}" stroke="${colorHex}" stroke-width="${strokeWidth}" stroke-linecap="round" />`,
    `<path d="${headD}" stroke="${colorHex}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />`,
    `</svg>`,
  ].join("")
  return img(svgDataUri(svg), { width, height, flexShrink: 0 })
}

const SCRIBBLE_CIRCLE_SHAPES = [
  { startFrac: -0.08, loopFrac: 1.22, jitter: 0.035 },
  { startFrac: -0.15, loopFrac: 1.3, jitter: 0.05 },
  { startFrac: -0.05, loopFrac: 1.18, jitter: 0.025 },
]

/**
 * An open, slightly-overlapping hand-drawn oval (~1.1-1.3 loops, so the
 * stroke visibly crosses itself near the start — the "circled in pen" look)
 * sized to `width`x`height`. Semantic pairing (hard rule): wrap ONLY a
 * highlight/price field, sized from that field's own autofit bbox + 12-18%
 * padding — never a headline or body copy.
 */
export function scribbleCircle(width: number, height: number, colorHex: string, seed: string, strokeWidth = 7): SatoriElement {
  const shape = SCRIBBLE_CIRCLE_SHAPES[pickVariant(`${seed}:connector-shape`, SCRIBBLE_CIRCLE_SHAPES.length)]
  const cx = width / 2
  const cy = height / 2
  const rx = width / 2 - strokeWidth
  const ry = height / 2 - strokeWidth
  const segments = 32
  const points: string[] = []
  for (let i = 0; i <= segments; i++) {
    const t = shape.startFrac + (shape.loopFrac * i) / segments
    const angle = t * Math.PI * 2
    const jitter = 1 + seededJitter(seed, i, shape.jitter)
    const x = cx + rx * jitter * Math.cos(angle)
    const y = cy + ry * jitter * Math.sin(angle)
    points.push(`${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`)
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" fill="none"><path d="${points.join(" ")}" stroke="${colorHex}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" /></svg>`
  return img(svgDataUri(svg), { width, height, flexShrink: 0 })
}

/**
 * A hand-drawn wavy underline (2-3 bumps, picked from `${seed}:connector-bumps`), width-parameterized to `widthPx` (pass autofit.ts#measureTextWidth's result for the text line it sits under). Semantic pairing: sits under the headline's last word or the CTA — never a whole paragraph.
 */
export function scribbleUnderline(widthPx: number, colorHex: string, seed: string, thicknessPx = 7): SatoriElement {
  const bumpCount = 2 + pickVariant(`${seed}:connector-bumps`, 2) // 2 or 3
  const height = Math.max(10, thicknessPx * 4)
  const amplitude = height * 0.4
  const baseline = height * 0.55
  const segments = bumpCount * 10
  const points: string[] = []
  for (let i = 0; i <= segments; i++) {
    const x = (widthPx * i) / segments
    const wave = Math.sin((i / segments) * Math.PI * bumpCount) * amplitude
    points.push(`${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${(baseline - wave).toFixed(1)}`)
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${widthPx} ${height}" fill="none"><path d="${points.join(" ")}" stroke="${colorHex}" stroke-width="${thicknessPx}" stroke-linecap="round" stroke-linejoin="round" /></svg>`
  return img(svgDataUri(svg), { width: widthPx, height, flexShrink: 0 })
}

/** A quiet horizontal zigzag divider, width-parameterized to `widthPx` — an alternative to ruleLine when a template wants a livelier section break. */
export function zigzagDivider(widthPx: number, colorHex: string, seed: string, thicknessPx = 6): SatoriElement {
  const spikeCount = 8 + pickVariant(`${seed}:connector-spikes`, 3) * 2 // 8, 10, or 12
  const height = Math.max(10, thicknessPx * 6)
  const amplitude = height * 0.4
  const mid = height / 2
  const points: string[] = []
  for (let i = 0; i <= spikeCount; i++) {
    const x = (widthPx * i) / spikeCount
    const y = i % 2 === 0 ? mid - amplitude : mid + amplitude
    points.push(`${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`)
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${widthPx} ${height}" fill="none"><path d="${points.join(" ")}" stroke="${colorHex}" stroke-width="${thicknessPx}" stroke-linecap="round" stroke-linejoin="round" /></svg>`
  return img(svgDataUri(svg), { width: widthPx, height, flexShrink: 0 })
}

/**
 * A dashed (dasharray) version of curvedArrow's same 3 curve shapes — reads as a "flow" line rather than a solid pointer. Semantic pairing (hard rule): only use this when the vertical gap it sits in is PROVABLY large (e.g. no subhead was supplied) — never squeezed against other content.
 */
export function dottedFlowArc(width: number, height: number, colorHex: string, seed: string, strokeWidth = 7): SatoriElement {
  const shapeIndex = pickVariant(`${seed}:connector-shape`, CURVED_ARROW_SHAPES.length)
  const { start, ctrl, end } = CURVED_ARROW_SHAPES[shapeIndex](width, height)
  const angle = Math.atan2(end.y - ctrl.y, end.x - ctrl.x)
  const headLen = Math.max(9, strokeWidth * 3)
  const curveD = `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} Q ${ctrl.x.toFixed(1)} ${ctrl.y.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`
  const headD = arrowHeadD(end, angle, headLen)
  const dashArray = `${(strokeWidth * 1.4).toFixed(1)} ${(strokeWidth * 2.2).toFixed(1)}`
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" fill="none">`,
    `<path d="${curveD}" stroke="${colorHex}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-dasharray="${dashArray}" />`,
    `<path d="${headD}" stroke="${colorHex}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />`,
    `</svg>`,
  ].join("")
  return img(svgDataUri(svg), { width, height, flexShrink: 0 })
}

const STARBURST_SPIKE_COUNTS = [8, 10, 12]

/**
 * A filled, 8/10/12-spike starburst polygon, diameter `diameter` — sized from the wrapped field's own autofit bbox + 12-18% padding, same discipline as scribbleCircle. Semantic pairing (hard rule): wraps ONLY the highlight/price field, placed BEHIND it (z-order: caller renders this first, then the field on top).
 */
export function starburst(diameter: number, colorHex: string, seed: string, opacity = 0.92): SatoriElement {
  const spikes = STARBURST_SPIKE_COUNTS[pickVariant(`${seed}:connector-spikes`, STARBURST_SPIKE_COUNTS.length)]
  const cx = diameter / 2
  const cy = diameter / 2
  const outerR = diameter / 2
  const innerR = outerR * 0.55
  const totalPoints = spikes * 2
  const points: string[] = []
  for (let i = 0; i < totalPoints; i++) {
    const r = i % 2 === 0 ? outerR : innerR
    const angle = (Math.PI * 2 * i) / totalPoints - Math.PI / 2
    points.push(`${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`)
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${diameter} ${diameter}"><polygon points="${points.join(" ")}" fill="${colorHex}" /></svg>`
  return img(svgDataUri(svg), { width: diameter, height: diameter, opacity, flexShrink: 0 })
}

const CALLOUT_TAIL_VARIANTS = ["bottom-left", "bottom-right", "left"] as const

/** A rounded speech-bubble OUTLINE with a small filled tail (2-3 tail positions, picked from `${seed}:connector-tail`) — for a "quote-this" or "here's why" annotation callout. */
export function calloutBubbleOutline(width: number, height: number, colorHex: string, seed: string, strokeWidth = 6): SatoriElement {
  const tail = CALLOUT_TAIL_VARIANTS[pickVariant(`${seed}:connector-tail`, CALLOUT_TAIL_VARIANTS.length)]
  const radius = Math.min(width, height) * 0.16
  const bodyBottom = tail === "left" ? height * 0.86 : height * 0.78
  const bodyD = [
    `M ${radius} ${strokeWidth}`,
    `H ${width - radius}`,
    `Q ${width - strokeWidth} ${strokeWidth} ${width - strokeWidth} ${radius + strokeWidth}`,
    `V ${bodyBottom - radius}`,
    `Q ${width - strokeWidth} ${bodyBottom} ${width - radius} ${bodyBottom}`,
    `H ${radius}`,
    `Q ${strokeWidth} ${bodyBottom} ${strokeWidth} ${bodyBottom - radius}`,
    `V ${radius + strokeWidth}`,
    `Q ${strokeWidth} ${strokeWidth} ${radius} ${strokeWidth}`,
    `Z`,
  ].join(" ")

  let tailD: string
  if (tail === "bottom-left") {
    tailD = `M ${width * 0.18} ${bodyBottom - 1} L ${width * 0.1} ${height - strokeWidth} L ${width * 0.32} ${bodyBottom - 1} Z`
  } else if (tail === "bottom-right") {
    tailD = `M ${width * 0.68} ${bodyBottom - 1} L ${width * 0.9} ${height - strokeWidth} L ${width * 0.82} ${bodyBottom - 1} Z`
  } else {
    const tipX = Math.max(2, strokeWidth * 0.4)
    tailD = `M ${strokeWidth + 1} ${height * 0.4} L ${tipX} ${height * 0.55} L ${strokeWidth + 1} ${height * 0.68} Z`
  }

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" fill="none">`,
    `<path d="${bodyD}" stroke="${colorHex}" stroke-width="${strokeWidth}" stroke-linejoin="round" />`,
    `<path d="${tailD}" fill="${colorHex}" stroke="${colorHex}" stroke-width="${strokeWidth}" stroke-linejoin="round" />`,
    `</svg>`,
  ].join("")
  return img(svgDataUri(svg), { width, height, flexShrink: 0 })
}

/** Two overlapping, oppositely-rotated rects (reuses box() + positioned() — no raw SVG) mimicking a torn piece of washi tape. 3 rotation-pair variants, picked from `${seed}:connector-rotation`. */
export function tapeStrip(width: number, height: number, colorHex: string, seed: string, opacity = 0.85): SatoriElement {
  const variants = [
    { r1: -6, r2: 4 },
    { r1: 5, r2: -3 },
    { r1: -4, r2: 8 },
  ]
  const v = variants[pickVariant(`${seed}:connector-rotation`, variants.length)]
  return box({ position: "relative", width, height }, [
    positioned(box({ width, height: Math.round(height * 0.62), backgroundColor: colorHex, opacity, transform: `rotate(${v.r1}deg)` }), {
      top: Math.round(height * 0.19),
      left: 0,
    }),
    positioned(
      box({ width: Math.round(width * 0.9), height: Math.round(height * 0.5), backgroundColor: colorHex, opacity: opacity * 0.7, transform: `rotate(${v.r2}deg)` }),
      { top: Math.round(height * 0.25), left: Math.round(width * 0.05) }
    ),
  ])
}

/** A filled rect with one hand-jittered jagged (torn-paper) top edge, sized `width`x`height` — for a "ripped ticket stub" or "torn note" accent strip. 3 tooth-count variants, picked from `${seed}:connector-teeth`. */
export function tornEdgeStrip(width: number, height: number, colorHex: string, seed: string, opacity = 0.9): SatoriElement {
  const teeth = 10 + pickVariant(`${seed}:connector-teeth`, 3) * 2 // 10, 12, or 14
  const jag = height * 0.14
  const points: string[] = [`M 0 ${jag.toFixed(1)}`]
  for (let i = 0; i <= teeth; i++) {
    const x = (width * i) / teeth
    const jitter = seededJitter(seed, i, jag * 0.6)
    const y = Math.max(0, i % 2 === 0 ? jitter : jag + jitter)
    points.push(`L ${x.toFixed(1)} ${y.toFixed(1)}`)
  }
  points.push(`L ${width} ${height}`, `L 0 ${height}`, "Z")
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><path d="${points.join(" ")}" fill="${colorHex}" opacity="${opacity}" /></svg>`
  return img(svgDataUri(svg), { width, height, flexShrink: 0 })
}

// 4 pre-authored closed organic-blob paths, each in its own local coordinate
// space centered near (0,0) spanning roughly [-75, 75] — a standard
// blob-generator style shape (smooth cubic-bezier loop), hand-picked for a
// calm, non-distracting silhouette at low opacity.
const ORGANIC_BLOB_PATHS = [
  "M42.2,-59.4C54.4,-51.7,63.4,-38.4,67.8,-23.7C72.2,-9,72,7,66.5,20.7C61,34.4,50.2,45.6,37.2,53.6C24.2,61.6,9,66.3,-6.6,68.1C-22.2,69.9,-38.2,68.8,-49.8,60.5C-61.4,52.2,-68.6,36.7,-71.8,20.3C-75,3.9,-74.2,-13.4,-67.2,-27.9C-60.2,-42.4,-47,-54.1,-32.4,-61.5C-17.8,-68.9,-1.8,-72,12.9,-70.1C27.6,-68.2,30,-67.1,42.2,-59.4Z",
  "M39.7,-52.9C50.8,-44.5,58.6,-31.6,62.4,-17.5C66.2,-3.4,66,11.9,60.3,25.2C54.6,38.5,43.4,49.8,30.2,57.1C17,64.4,1.8,67.7,-13.6,66.2C-29,64.7,-44.6,58.4,-54.6,47C-64.6,35.6,-69,19.1,-69.4,2.6C-69.8,-13.9,-66.2,-30.4,-56.6,-41.8C-47,-53.2,-31.4,-59.5,-16.1,-63.5C-0.8,-67.5,14.2,-69.2,26.7,-63.9C39.2,-58.6,50.2,-46.4,39.7,-52.9Z",
  "M31.9,-45.6C41.7,-38.4,49.9,-29.2,55.2,-17.9C60.5,-6.6,62.9,6.8,59.5,18.5C56.1,30.2,46.9,40.2,35.9,47.6C24.9,55,12.5,59.8,-1.1,61.6C-14.6,63.4,-29.2,62.2,-40.1,54.8C-51,47.4,-58.2,33.8,-61.8,19.1C-65.4,4.4,-65.4,-11.4,-59.6,-24.4C-53.8,-37.4,-42.2,-47.6,-29.5,-54.3C-16.8,-61,-8.4,-64.2,2.2,-68.1C12.8,-72,25.6,-76.6,31.9,-45.6Z",
  "M45.3,-58.2C57.8,-49.5,65.8,-34.4,68.6,-18.6C71.4,-2.8,69,13.7,61.3,27.2C53.6,40.7,40.6,51.2,26.2,57.9C11.8,64.6,-4,67.5,-19.1,64.7C-34.2,61.9,-48.6,53.4,-58.1,41C-67.6,28.6,-72.2,12.3,-71.1,-3.3C-70,-18.9,-63.2,-33.8,-52.4,-42.8C-41.6,-51.8,-26.8,-54.9,-12.4,-58.9C2,-62.9,4,-69.4,45.3,-58.2Z",
]

/**
 * One of 4 pre-authored closed blob shapes, filled at a calm low opacity (0.08-0.18) — the softest large-accent option, and (per the Wave 4 brief) also usable as this pipeline's 4th `bigAccent` option alongside ring/band/dots.
 */
export function organicBlob(width: number, height: number, colorHex: string, seed: string, opacity = 0.13): SatoriElement {
  const d = ORGANIC_BLOB_PATHS[pickVariant(`${seed}:connector-blob`, ORGANIC_BLOB_PATHS.length)]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-90 -90 180 180"><path d="${d}" fill="${colorHex}" /></svg>`
  return img(svgDataUri(svg), { width, height, opacity, flexShrink: 0 })
}

// ===========================================================================
// Code-drawn festive shapes (Wave 4) — the "confetti scatter" / "bunting
// row" replacement for flat emoji-style occasion art (see the Wave 4 brief's
// owner law + module header on themes.ts). Both are seeded, tintable to any
// resolved palette (never a hardcoded confetti-colored PNG), and available
// from the same semantic "elements" vocabulary as every vendored topic icon
// (src/lib/templates/elements.ts) — "confetti" has no good vendored icon in
// either license-approved source (verified by hand), so this is its only
// resolution.
// ===========================================================================

type ConfettiShape = "rect" | "circle" | "triangle"
const CONFETTI_SHAPES: ConfettiShape[] = ["rect", "circle", "triangle"]

/** A scatter of small seeded rects/circles/triangles across `width`x`height`, cycling through `colorHexes` — the code-drawn "confetti" element. Never emoji/flat art; every piece is a plain filled primitive so it always matches the render's own resolved palette. */
export function confettiScatter(width: number, height: number, colorHexes: string[], seed: string, count = 10): SatoriElement {
  const palette = colorHexes.length > 0 ? colorHexes : ["#FFFFFF"]
  const clampedCount = Math.max(4, Math.min(Math.round(count), 18))
  const pieces: string[] = []

  for (let i = 0; i < clampedCount; i++) {
    const cx = ((hashSeed(`${seed}:confetti-x:${i}`) % 1000) / 1000) * width
    const cy = ((hashSeed(`${seed}:confetti-y:${i}`) % 1000) / 1000) * height
    const rotation = hashSeed(`${seed}:confetti-rot:${i}`) % 360
    const color = palette[hashSeed(`${seed}:confetti-color:${i}`) % palette.length]
    const shape = CONFETTI_SHAPES[hashSeed(`${seed}:confetti-shape:${i}`) % CONFETTI_SHAPES.length]
    const size = 6 + (hashSeed(`${seed}:confetti-size:${i}`) % 10)

    if (shape === "circle") {
      pieces.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(size / 2).toFixed(1)}" fill="${color}" />`)
    } else if (shape === "triangle") {
      const points = `${cx.toFixed(1)},${(cy - size / 2).toFixed(1)} ${(cx + size / 2).toFixed(1)},${(cy + size / 2).toFixed(1)} ${(cx - size / 2).toFixed(1)},${(cy + size / 2).toFixed(1)}`
      pieces.push(`<polygon points="${points}" fill="${color}" transform="rotate(${rotation} ${cx.toFixed(1)} ${cy.toFixed(1)})" />`)
    } else {
      const rectW = size
      const rectH = size * 0.6
      pieces.push(
        `<rect x="${(cx - rectW / 2).toFixed(1)}" y="${(cy - rectH / 2).toFixed(1)}" width="${rectW.toFixed(1)}" height="${rectH.toFixed(1)}" rx="${(rectW * 0.15).toFixed(1)}" fill="${color}" transform="rotate(${rotation} ${cx.toFixed(1)} ${cy.toFixed(1)})" />`
      )
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${pieces.join("")}</svg>`
  return img(svgDataUri(svg), { width, height, flexShrink: 0 })
}

/** A row of small triangular flags (bunting/garland), width-parameterized to `widthPx`, cycling through `colorHexes` — the code-drawn "bunting" element (e.g. above an event poster's header). */
export function buntingRow(widthPx: number, heightPx: number, colorHexes: string[], seed: string, flagCount = 7): SatoriElement {
  const palette = colorHexes.length > 0 ? colorHexes : ["#FFFFFF"]
  const clampedCount = Math.max(3, Math.min(Math.round(flagCount), 12))
  const flagWidth = widthPx / clampedCount
  const pieces: string[] = []

  for (let i = 0; i < clampedCount; i++) {
    const x0 = i * flagWidth
    const color = palette[hashSeed(`${seed}:bunting:${i}`) % palette.length]
    pieces.push(
      `<polygon points="${x0.toFixed(1)},0 ${(x0 + flagWidth).toFixed(1)},0 ${(x0 + flagWidth / 2).toFixed(1)},${heightPx.toFixed(1)}" fill="${color}" />`
    )
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${widthPx} ${heightPx}">${pieces.join("")}</svg>`
  return img(svgDataUri(svg), { width: widthPx, height: heightPx, flexShrink: 0 })
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
 * Every vendored source in this pipeline (IconPark, MingCute — see
 * assets/manifest.ts) is a mono/two-tone "drawn icon" style, never flat
 * multicolor emoji art (Noto was fully replaced, Wave 4 owner law), so
 * `tintHex` is always safe to pass (see tintSvgMarkup above) and templates
 * should generally pass a resolved brand/theme role color rather than the
 * source's own default palette, for a consistent "part of this poster" look.
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
