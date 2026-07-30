// event-poster-v1 — the flagship "announce a thing" poster (default
// 1080x1350, portrait; also renders at 1080x1080 square — see
// supportedSizes). Hierarchy: eyebrow -> huge headline -> optional
// highlight badge -> optional subhead -> footer bar (date + location) -> CTA
// line -> logo. Background: brand-derived dark solid/gradient, or an
// optional AI photo behind a bottom scrim so the footer/CTA stay legible.
//
// Wave 4 anti-repetition machine: 7 independent, namespaced-sub-seed axes
// (variants.ts#pickAxis) so the SAME prompt rendered twice with different
// seeds looks visibly different, never a random shuffle of the same
// elements — headlineAlignment, composition, scalePlay, densityMode (derived
// from field count, not seeded), paletteRole, bigAccent, connector. See each
// axis's own comment below for its option set + reasoning.
//
// Decoration budget (owner law: zero overflow, restrained totals) — this
// template picks exactly ONE of 4 mutually-exclusive decoration branches per
// render, so the total never stacks past ~3-4 small/quiet accents:
//   1. Themed (ctx.theme resolved, no photo): corner stickers (<=2) + one
//      in-flow mid-gap sticker (Wave 3, unchanged) — connector/elements/
//      semantic icons all skip so a themed render stays legible.
//   2. Connector active (no theme, no photo): the picked connector device
//      (1) + up to 2 semantic elements — bigAccent forced to none/small per
//      the "when a connector is present, the big accent drops" rule.
//   3. Elements only (no theme, no photo, no connector): bigAccent (1) + up
//      to 2 semantic elements, one paired with the highlight badge when
//      celebratory (confetti/celebration topic).
//   4. Sparse/plain (no theme, no photo, no connector, no elements):
//      bigAccent (1) + — only in "rich" densityMode — exactly one fill
//      strategy (density.ts) to keep a minimal-input poster from reading
//      empty.
// A photo background always demotes to 0 decorations (the photo fills the
// frame) — unchanged from Wave 1/2/3.
//
// Design-review fixes (post-launch, round 1): (1) semantic elements now
// render as a deliberate 72px chip cluster (decorations.ts#elementChipRow,
// accent-tinted with textOnAccent glyphs — the same contrast pairing the
// highlight badge pill uses) in a DECLARED footer slot flanking the CTA,
// never a bare ~24px floating row competing with the headline. (2)
// curvedArrow no longer bleeds off-canvas — its box is sized to fit
// entirely inside the margin gutter with zero bleed, since every
// hand-authored curve shape puts its arrowhead near the box's far edge
// (bleeding cropped it). The root's own `justify-content: space-between`
// (topChildren/midRule/bottomChildren) already distributes content across
// the full canvas height by design.
//
// Design-review fixes (round 2 — tall-format mid-band guarantee): round 1's
// "already distributes content across the full height" claim was true of
// the LAYOUT but not the RESULT at story scale (1080x1920) — a thin 1px
// midRule line reads as empty once the gap it sits in is 700-900px tall.
// Now: (a) supportedSizes gained TEMPLATE_SIZES.story. (b) render.ts's
// format-density coupling (densityFields below) keeps sparse content off
// tall formats on the seeded auto-pick, but an explicit size pin can still
// request one, so (c) whenever a tall format IS rendering and nothing else
// already substantially occupies the mid-gap (no theme sticker there, no
// dotted-flow-arc connector), midRule upgrades from a thin line to
// decorations.ts#midBandFiller (a seeded watermark icon or expanded dot
// field) — still the same in-flow slot, so it's still placed entirely by
// `justify-content: space-between`, never a fixed offset.

import { autofitText, measureTextWidth } from "../autofit"
import { hexToRgb } from "../contrast"
import {
  accentBar,
  assertConnectorFitsReservedZone,
  confettiScatter,
  curvedArrow,
  dotGrid,
  diagonalBand,
  dottedFlowArc,
  elementChipIconSize,
  elementChipRow,
  iconChip,
  midBandFiller,
  MID_BAND_FILLER_KINDS,
  organicBlob,
  positioned,
  ringAccent,
  scribbleCircle,
  scribbleUnderline,
  starburst,
  stickerElement,
  stickerRotationJitter,
  type ConnectorKey,
} from "../decorations"
import { computeDensityMode, echoText, pickFillStrategy } from "../density"
import { isCelebrationElement, resolveElement } from "../elements"
import { box, el, img, isTallFormat, TEMPLATE_SIZES, type SatoriElement, type TemplateBuildContext, type TemplateDef, type TemplateFieldSchema } from "../types"
import { pickAxis } from "../variants"

const SIZE = TEMPLATE_SIZES.portrait
const SUPPORTED_SIZES = [TEMPLATE_SIZES.portrait, TEMPLATE_SIZES.square, TEMPLATE_SIZES.story]

/** This template's optional-field list — the single source both build()'s densityMode calculation AND render.ts's format-density coupling (TemplateDef.densityFields) read from, so they can never drift apart. */
function optionalDensityFields(fields: Record<string, string>): Array<string | undefined> {
  return [fields.eyebrow, fields.highlight, fields.subhead, fields.locationLine]
}
const SAFE_MARGIN_RATIO = 0.055

const FIELDS: TemplateFieldSchema[] = [
  { key: "eyebrow", label: "Eyebrow", required: false, maxChars: 40, helpText: "Small label above the headline, e.g. SATURDAY NIGHT" },
  { key: "headline", label: "Headline", required: true, maxChars: 90, helpText: "The big statement — keep it punchy, up to ~3 lines" },
  { key: "highlight", label: "Highlight badge", required: false, maxChars: 32, helpText: "e.g. $1,000 PRIZE POOL" },
  { key: "subhead", label: "Subhead", required: false, maxChars: 70 },
  { key: "dateLine", label: "Date", required: true, maxChars: 40 },
  { key: "locationLine", label: "Location", required: false, maxChars: 50 },
  { key: "ctaLine", label: "Call to action", required: true, maxChars: 40, helpText: "e.g. RESERVE YOUR SPOT" },
]

function margin(width: number): number {
  return Math.round(width * SAFE_MARGIN_RATIO)
}

/** Diameter for this template's semantic-element chips (decorations.ts#elementChipRow) — a deliberate design object, not a bare floating glyph (design-review fix). */
const ELEMENT_CHIP_DIAMETER = 72

// ===========================================================================
// Variety axes
// ===========================================================================

const HEADLINE_ALIGNMENTS = ["left", "center", "stacked-banner"] as const
type HeadlineAlignment = (typeof HEADLINE_ALIGNMENTS)[number]

const COMPOSITIONS = ["type-dominant", "element-dominant", "split"] as const
type Composition = (typeof COMPOSITIONS)[number]

const SCALE_PLAYS = ["normal", "oversized"] as const
const PALETTE_ROLES = ["accent", "primary"] as const
const BIG_ACCENTS = ["ring", "band", "dots", "blob"] as const
type BigAccentKind = (typeof BIG_ACCENTS)[number]

/** Composition controls headline width + decoration scale — a lightweight, overflow-safe stand-in for a full column-split rewrite (see module header). */
const COMPOSITION_HEADLINE_WIDTH_FRACTION: Record<Composition, number> = {
  "type-dominant": 0.96,
  "element-dominant": 0.9,
  split: 0.72,
}
const COMPOSITION_ACCENT_SCALE: Record<Composition, number> = {
  "type-dominant": 1,
  "element-dominant": 1.15,
  split: 1,
}

function buildBigAccent(kind: BigAccentKind, colorHex: string, size: { width: number; height: number }, m: number, seed: string, scale: number) {
  if (kind === "ring") {
    return positioned(ringAccent(Math.round(560 * scale), 3, colorHex, 0.26), { top: -170, right: -170 })
  }
  if (kind === "band") {
    return positioned(diagonalBand(colorHex, 0.1, Math.round(size.width * 1.5), Math.round(240 * scale)), {
      top: Math.round(size.height * 0.6),
      left: -Math.round(size.width * 0.22),
    })
  }
  if (kind === "blob") {
    const blobSize = Math.round(size.width * 0.9 * scale)
    return positioned(organicBlob(blobSize, blobSize, colorHex, seed, 0.14), {
      top: -Math.round(size.width * 0.25),
      right: -Math.round(size.width * 0.3),
    })
  }
  return positioned(dotGrid(Math.round(5 * scale), Math.round(5 * scale), 10, 16, colorHex, 0.36), { top: Math.round(size.height * 0.47), right: m })
}

/** This template's declared sticker safe zones (Wave 3, unchanged from earlier waves): a top-right corner cluster and a bottom-left corner peek. */
const CORNER_STICKER_SLOTS: Array<{ offsets: { top?: number; left?: number; right?: number; bottom?: number }; sizePx: number }> = [
  { offsets: { top: -34, right: -18 }, sizePx: 116 },
  { offsets: { bottom: -28, left: -22 }, sizePx: 96 },
]

async function buildCornerStickers(ctx: TemplateBuildContext, hasPhoto: boolean): Promise<SatoriElement[]> {
  if (hasPhoto || !ctx.theme) return []
  const picks = ctx.theme.assets.slice(0, CORNER_STICKER_SLOTS.length)
  const placed = await Promise.all(
    picks.map(async (asset, index) => {
      const slot = CORNER_STICKER_SLOTS[index]
      const rotation = stickerRotationJitter(`${ctx.seed}:event-poster-corner-sticker:${index}:${asset.name}`)
      // Every vendored source (IconPark, MingCute) is a mono/two-tone
      // drawn icon now (Noto retired) — always recolor to the resolved
      // accent so it reads as part of THIS poster's palette.
      const tintHex = ctx.roles.accent
      const sticker = await stickerElement(asset.path, slot.sizePx, rotation, 0.96, tintHex)
      return sticker ? positioned(sticker, slot.offsets) : null
    })
  )
  return placed.filter((el): el is SatoriElement => el !== null)
}

async function buildMidGapSticker(ctx: TemplateBuildContext, hasPhoto: boolean): Promise<SatoriElement | null> {
  if (hasPhoto || !ctx.theme) return null
  const asset = ctx.theme.assets[2]
  if (!asset) return null
  const rotation = stickerRotationJitter(`${ctx.seed}:event-poster-midgap-sticker:${asset.name}`)
  const tintHex = ctx.roles.accent
  return stickerElement(asset.path, 56, rotation, 0.9, tintHex)
}

// ===========================================================================
// Wave 4 — connector selection (semantic pairing rules, see module header)
// ===========================================================================

/** Builds the field-dependent connector option pool: weighted toward "none" (restraint), and only offers a device shape whose semantic pairing rule is actually satisfiable by this render's fields. */
function connectorPool(fields: Record<string, string>): Array<ConnectorKey | "none"> {
  const pool: Array<ConnectorKey | "none"> = ["none", "none", "none", "curved-arrow", "scribble-underline"]
  if (fields.highlight) pool.push("scribble-circle", "starburst")
  if (!fields.subhead) pool.push("dotted-flow-arc")
  return pool
}

/** Resolves the first AI-picked semantic element's Tier-A icon key when available, else a neutral fallback — shared by the rich-density "watermark-icon" fill strategy and the tall-format mid-band guarantee below. */
function resolveWatermarkIconKey(ctx: TemplateBuildContext): Parameters<typeof iconChip>[0] {
  const firstKey = ctx.elements[0]
  const resolved = firstKey ? resolveElement(firstKey) : null
  return resolved && resolved.kind === "icon" ? resolved.key : "sparkles"
}

/**
 * curved-arrow running down the right margin gutter, spanning from roughly
 * the headline area down toward the CTA — the "eyebrow/headline -> cta"
 * pairing. Design-review fix: the box is sized to fit ENTIRELY inside the
 * margin gutter (`m`, guaranteed text-free by construction — see
 * autofitText's maxWidth callers, which always cap at `contentWidth`) with
 * ZERO bleed (`right: 0`), instead of the earlier negative-bleed placement
 * that cropped the arrowhead (every CURVED_ARROW_SHAPES variant puts it
 * near local x=0.85-0.92 of the box — bleeding the box off-canvas reliably
 * cropped exactly that). assertConnectorFitsReservedZone guards the
 * invariant this relies on.
 */
function buildCurvedArrowConnector(colorHex: string, seed: string, size: { width: number; height: number }, m: number): SatoriElement {
  const w = m
  const h = Math.round(size.height * 0.4)
  assertConnectorFitsReservedZone(w, m)
  return positioned(curvedArrow(w, h, colorHex, seed, 8, true), { top: Math.round(size.height * 0.22), right: 0 })
}

/** scribble-circle / starburst wrapping the highlight badge — sized from the badge's own estimated bbox + 16% padding (measure-then-place, per the brief), placed BEHIND the badge in a shared `position: relative` wrapper. */
function wrapHighlightWithConnector(
  kind: "scribble-circle" | "starburst",
  badgeBox: SatoriElement,
  fields: Record<string, string>,
  colorHex: string,
  seed: string
): SatoriElement {
  const badgeWidth = 26 + 12 + measureTextWidth(fields.highlight, 28) + 60
  const badgeHeight = 70
  const padFrac = 0.16
  const wrapW = Math.round(badgeWidth * (1 + padFrac))
  const wrapH = Math.round(badgeHeight * (1 + padFrac))
  const offsetX = Math.round((wrapW - badgeWidth) / 2)
  const offsetY = Math.round((wrapH - badgeHeight) / 2)
  const connectorEl = kind === "scribble-circle" ? scribbleCircle(wrapW, wrapH, colorHex, seed, 7) : starburst(Math.max(wrapW, wrapH), colorHex, seed, 0.85)
  return box({ position: "relative", alignSelf: "flex-start" }, [positioned(connectorEl, { top: -offsetY, left: -offsetX }), badgeBox])
}

// ===========================================================================
// Wave 4 — semantic element icons (elements.ts)
// ===========================================================================

async function buildElementIcons(
  ctx: TemplateBuildContext,
  colorHex: string,
  skip: boolean
): Promise<{ icons: SatoriElement[]; hasCelebrationElement: boolean }> {
  if (skip || ctx.elements.length === 0) return { icons: [], hasCelebrationElement: false }
  const icons: SatoriElement[] = []
  let hasCelebrationElement = false

  for (const key of ctx.elements) {
    if (icons.length >= 2) break
    const resolved = resolveElement(key)
    if (!resolved) continue
    if (isCelebrationElement(resolved)) {
      hasCelebrationElement = true
      if (resolved.kind === "confetti") continue // rendered as a scatter next to the badge, not an icon glyph.
    }
    const glyphSize = elementChipIconSize(ELEMENT_CHIP_DIAMETER)
    if (resolved.kind === "icon") {
      icons.push(iconChip(resolved.key, colorHex, glyphSize))
    } else if (resolved.kind === "topic-asset") {
      const sticker = await stickerElement(resolved.path, glyphSize, 0, 0.98, colorHex)
      if (sticker) icons.push(sticker)
    }
  }

  return { icons, hasCelebrationElement }
}

// ===========================================================================
// Build
// ===========================================================================

async function buildEventPoster(ctx: TemplateBuildContext): Promise<SatoriElement> {
  const { size, roles, fields, logoDataUri, backgroundKind, fontFamily, seed } = ctx
  const m = margin(size.width)
  const contentWidth = size.width - m * 2
  const hasPhoto = backgroundKind === "photo_ai"
  const hasTheme = Boolean(ctx.theme) && !hasPhoto

  const headlineAlignment: HeadlineAlignment = pickAxis(seed, "headlineAlignment", HEADLINE_ALIGNMENTS)
  const composition = pickAxis(seed, "composition", COMPOSITIONS)
  const scalePlay = pickAxis(seed, "scalePlay", SCALE_PLAYS)
  const paletteRole = pickAxis(seed, "paletteRole", PALETTE_ROLES)
  const bigAccentKind = pickAxis(seed, "bigAccent", BIG_ACCENTS)
  const accentScale = COMPOSITION_ACCENT_SCALE[composition]
  const accentColor = paletteRole === "primary" ? roles.primary : roles.accent

  const connectorChoice = hasTheme || hasPhoto ? "none" : pickAxis(seed, "connector", connectorPool(fields))
  const useConnector = connectorChoice !== "none"

  const densityMode = computeDensityMode(optionalDensityFields(fields))
  const fillStrategy = densityMode === "rich" ? pickFillStrategy(seed) : null
  const applyFill = fillStrategy !== null && !hasTheme && !hasPhoto && !useConnector

  const wordCount = fields.headline.trim().split(/\s+/).filter(Boolean).length
  const oversizedCeiling =
    (scalePlay === "oversized" && wordCount <= 4) || (applyFill && fillStrategy === "oversized-hero") ? 236 : 152

  const headlineFit = autofitText({
    text: fields.headline,
    maxWidth: contentWidth * COMPOSITION_HEADLINE_WIDTH_FRACTION[composition],
    maxHeight: size.height * 0.34,
    minFontSize: 60,
    maxFontSize: oversizedCeiling,
    lineHeight: 1.03,
    maxLines: 3,
  })

  const isCentered = headlineAlignment === "center"
  const headlineLines = headlineFit.lines.map((line, index) =>
    box(
      {
        flexDirection: "row",
        justifyContent: isCentered ? "center" : "flex-start",
        textAlign: isCentered ? "center" : "left",
        fontFamily,
        fontWeight: 900,
        fontSize: headlineFit.fontSize,
        lineHeight: 1.03,
        letterSpacing: "-0.02em",
        color: roles.textOnDark,
        marginTop: index === 0 ? 0 : 2,
      },
      line
    )
  )

  const headlineBlock =
    headlineAlignment === "stacked-banner"
      ? box(
          {
            flexDirection: "column",
            alignSelf: "flex-start",
            // An rgba() background (not a plain opacity property) so the band
            // reads translucent while the headline text drawn inside it stays
            // fully opaque — `opacity` would fade both together.
            backgroundColor: (() => {
              const { r, g, b } = hexToRgb(accentColor)
              return `rgba(${r}, ${g}, ${b}, 0.16)`
            })(),
            borderRadius: 10,
            padding: "10px 16px",
          },
          headlineLines
        )
      : box({ flexDirection: "column", alignSelf: isCentered ? "center" : "flex-start" }, headlineLines)

  // --- Wave 4 semantic element icons (skipped for theme/photo renders) ---
  // Design-review fix: rendered as a deliberate chip cluster (72px,
  // accent-tinted, textOnAccent glyphs — the same contrast pairing the
  // highlight badge pill already uses), placed in a declared footer slot
  // FLANKING the CTA (see bottomChildren below) rather than a bare,
  // near-invisible inline row competing with the headline for attention.
  const { icons: elementIcons, hasCelebrationElement } = await buildElementIcons(ctx, roles.textOnAccent, hasTheme || hasPhoto)
  const elementCluster = elementIcons.length > 0 ? elementChipRow(elementIcons, roles.accent, ELEMENT_CHIP_DIAMETER, 14) : null

  // --- highlight badge, optionally wrapped in a connector or paired with a confetti flourish ---
  const badgePill = fields.highlight
    ? box(
        {
          flexDirection: "row",
          alignItems: "center",
          alignSelf: "flex-start",
          padding: "16px 30px",
          borderRadius: 999,
          backgroundColor: roles.accent,
          color: roles.textOnAccent,
        },
        [
          iconChip("trophy", roles.textOnAccent, 26),
          box({ width: 12, height: 1 }),
          box({ flexDirection: "row", fontFamily, fontWeight: 700, fontSize: 28, letterSpacing: "0.02em" }, fields.highlight),
        ]
      )
    : null

  const highlightConnectorKind =
    useConnector && (connectorChoice === "scribble-circle" || connectorChoice === "starburst") ? connectorChoice : null
  const wrappedBadge =
    badgePill && highlightConnectorKind ? wrapHighlightWithConnector(highlightConnectorKind, badgePill, fields, accentColor, seed) : badgePill

  const confettiFlourish =
    badgePill && hasCelebrationElement ? confettiScatter(46, 40, [roles.accent, roles.primary, roles.textOnDark], seed, 8) : null

  const highlightRow = badgePill
    ? box(
        { flexDirection: "row", alignItems: "center", alignSelf: isCentered ? "center" : "flex-start", marginTop: 26 },
        [wrappedBadge, confettiFlourish ? box({ marginLeft: 14 }, [confettiFlourish]) : null].filter(
          (child): child is SatoriElement => Boolean(child)
        )
      )
    : null

  const topChildren = [
    fields.eyebrow
      ? box(
          {
            flexDirection: "row",
            justifyContent: isCentered ? "center" : "flex-start",
            alignSelf: isCentered ? "center" : "flex-start",
            fontFamily,
            fontWeight: 700,
            fontSize: 26,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: roles.accent,
            marginBottom: 20,
          },
          fields.eyebrow
        )
      : null,
    headlineBlock,
    box({ flexDirection: "row", justifyContent: isCentered ? "center" : "flex-start" }, [accentBar(96, 6, roles.accent, 4)]),
    highlightRow,
    fields.subhead
      ? box(
          {
            flexDirection: "row",
            justifyContent: isCentered ? "center" : "flex-start",
            textAlign: isCentered ? "center" : "left",
            alignSelf: isCentered ? "center" : "flex-start",
            marginTop: 22,
            fontFamily,
            fontWeight: 400,
            fontSize: 32,
            color: roles.textOnDark,
            opacity: 0.8,
          },
          fields.subhead
        )
      : null,
  ]

  // --- CTA, optionally underlined with a scribble connector ---
  const ctaUnderline =
    useConnector && connectorChoice === "scribble-underline"
      ? scribbleUnderline(measureTextWidth(fields.ctaLine, 24), roles.textOnAccent, seed, 7)
      : null

  const bottomChildren = [
    box({ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }, [
      box({ flexDirection: "column" }, [
        box({ flexDirection: "row", alignItems: "center" }, [
          iconChip("calendar", accentColor, 28),
          box({ width: 10, height: 1 }),
          box({ flexDirection: "row", fontFamily, fontWeight: 700, fontSize: 32, color: roles.textOnDark }, fields.dateLine),
        ]),
        fields.locationLine
          ? box({ flexDirection: "row", alignItems: "center", marginTop: 8, opacity: 0.72 }, [
              iconChip("map-pin", roles.textOnDark, 22),
              box({ width: 8, height: 1 }),
              box({ flexDirection: "row", fontFamily, fontWeight: 400, fontSize: 26, color: roles.textOnDark }, fields.locationLine),
            ])
          : null,
      ]),
    ]),
    // Design-review fix: a real 3-slot footer bar (CTA | element cluster |
    // logo) via space-between rather than a bare 2-slot row — the element
    // cluster (when present) is a DECLARED slot here, flanking the CTA,
    // never an orphan floating elsewhere in the flow.
    box(
      { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 28 },
      [
        box({ flexDirection: "column" }, [
          box(
            {
              flexDirection: "row",
              fontFamily,
              fontWeight: 700,
              fontSize: 24,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: roles.textOnAccent,
              backgroundColor: roles.accent,
              padding: "14px 26px",
              borderRadius: 12,
            },
            fields.ctaLine
          ),
          ctaUnderline ? box({ marginTop: -6, marginLeft: 26 }, [ctaUnderline]) : null,
        ]),
        elementCluster,
        logoDataUri ? img(logoDataUri, { width: 88, height: 88, objectFit: "contain", borderRadius: 12 }) : null,
      ].filter(Boolean)
    ),
  ]

  const rootBackgroundStyle =
    backgroundKind === "solid"
      ? { backgroundColor: roles.backgroundStart }
      : backgroundKind === "gradient"
        ? { backgroundImage: `linear-gradient(180deg, ${roles.backgroundStart} 0%, ${roles.backgroundEnd} 100%)` }
        : {} // photo_ai: leave transparent — render.ts composites the photo + scrim underneath, this layer is type/logo only.

  // Branch 1 (themed): unchanged Wave 3 big-accent-off, corner+midgap stickers.
  // Branch 2 (connector): no big accent (restraint rule).
  // Branch 3/4: normal big accent, scaled by composition.
  const showBigAccent = !hasPhoto && !hasTheme && !useConnector
  const decorationChildren = showBigAccent ? [buildBigAccent(bigAccentKind, accentColor, size, m, seed, accentScale)] : []

  const midGapSticker = await buildMidGapSticker(ctx, hasPhoto)
  const cornerStickers = await buildCornerStickers(ctx, hasPhoto)

  // The mid-gap slot is always an IN-FLOW sibling (never `positioned()`) —
  // its vertical position depends on the header/footer blocks' own heights
  // under this root's `justify-content: space-between`, which the
  // midGapSticker lesson (see the earlier Wave 3 header) proved must never
  // be hardcoded. A dotted-flow-arc connector (only offered when there's no
  // subhead, i.e. a provably large gap) reuses this exact slot.
  const showDottedFlow = useConnector && connectorChoice === "dotted-flow-arc"
  // Design-review fix (round 2): on a tall canvas (portrait/story), a thin
  // 1px line alone doesn't read as an occupant once the gap it sits in is
  // several hundred px tall — swap in decorations.ts#midBandFiller instead,
  // UNLESS something already substantial is already in this exact slot
  // (the theme's midGapSticker, or the dotted-flow-arc connector). Still
  // the same in-flow slot either way, so it's still placed entirely by
  // `justify-content: space-between`.
  const wantsMidBandFiller = isTallFormat(size) && !hasPhoto && !midGapSticker && !showDottedFlow
  const midBandKind = wantsMidBandFiller ? pickAxis(seed, "midBandFiller", MID_BAND_FILLER_KINDS) : null
  const midRule = hasPhoto
    ? null
    : showDottedFlow
      ? box({ flexDirection: "row", justifyContent: "center" }, [dottedFlowArc(Math.round(contentWidth * 0.5), 110, accentColor, seed)])
      : midBandKind
        ? midBandFiller(midBandKind, resolveWatermarkIconKey(ctx), accentColor, seed)
        : box(
            { flexDirection: "row", justifyContent: "center", alignItems: "center" },
            [
              el("div", {
                style: {
                  display: "flex",
                  width: Math.round(contentWidth * (midGapSticker ? 0.34 : 0.42)),
                  height: 1,
                  backgroundColor: roles.textOnDark,
                  opacity: 0.3,
                },
              }),
              midGapSticker ? box({ marginLeft: 18 }, [midGapSticker]) : null,
            ].filter(Boolean)
          )

  // curved-arrow connector bleeds the right margin gutter, independent of
  // the flex flow (a reserved-zone bleed, same discipline as every
  // corner-bleed accent above) — it doesn't compete with midRule's slot.
  const curvedArrowEl = useConnector && connectorChoice === "curved-arrow" ? buildCurvedArrowConnector(accentColor, seed, size, m) : null

  // --- Wave 4 rich-density fill (only when nothing else is already filling the void) ---
  const fillElement = (() => {
    if (!applyFill) return null
    if (fillStrategy === "echo-text") {
      const scaledFontSize = Math.round(headlineFit.fontSize * 1.7)
      return echoText(
        headlineFit.lines,
        fontFamily,
        scaledFontSize,
        roles.textOnDark,
        { top: Math.round(size.height * 0.28), left: -Math.round(size.width * 0.04) },
        0.06
      )
    }
    if (fillStrategy === "watermark-icon") {
      const wmSize = Math.round(size.width * 0.42)
      const glyph = iconChip(resolveWatermarkIconKey(ctx), accentColor, wmSize)
      return positioned(box({ opacity: 0.09 }, [glyph]), { bottom: -Math.round(wmSize * 0.25), left: -Math.round(wmSize * 0.22) })
    }
    if (fillStrategy === "expanded-dots") {
      return positioned(dotGrid(6, 6, 12, 18, accentColor, 0.3), { bottom: m, right: -Math.round(m * 0.4) })
    }
    return null // "oversized-hero" already applied above via oversizedCeiling — no extra element needed.
  })()

  return el("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      position: "relative",
      width: size.width,
      height: size.height,
      padding: m,
      fontFamily,
      overflow: "hidden",
      ...rootBackgroundStyle,
    },
    children: [
      ...decorationChildren,
      fillElement,
      curvedArrowEl,
      ...cornerStickers,
      box({ flexDirection: "column" }, topChildren),
      midRule,
      box({ flexDirection: "column" }, bottomChildren),
    ].filter(Boolean),
  })
}

export const EVENT_POSTER_V1: TemplateDef = {
  id: "event-poster-v1",
  name: "Event poster",
  description:
    "A bold, full-bleed poster for announcing an event, sale, or workshop — huge headline, optional highlight badge, date/location footer, and a CTA line.",
  defaultSize: SIZE,
  supportedSizes: SUPPORTED_SIZES,
  densityFields: optionalDensityFields,
  allowedBackgrounds: ["solid", "gradient", "photo_ai"],
  fields: FIELDS,
  build: buildEventPoster,
  photoLayer: (size) => ({
    region: { x: 0, y: 0, width: size.width, height: size.height },
    scrim: { heightFraction: 0.62, colorHex: "#05050A", maxOpacityPercent: 88 },
  }),
}
