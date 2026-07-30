// announcement-v1 — a calm, general-purpose announcement card (1080x1080
// square by default; also renders at 1080x1350 portrait — see
// supportedSizes). For lower-key news than event-poster-v1's "big event
// energy": new hours, a policy change, "we're back", a new menu item, a
// milestone. Left-aligned (or centered — see headlineAlignment), vertically
// centered content with generous whitespace, a small badge chip, a moderate
// (never huge) autofit headline, an optional supporting line, and an
// understated CTA with an arrow glyph — never a big button bar. Background:
// muted brand solid/gradient only — no photo, to keep the calm read.
//
// Wave 4 anti-repetition machine: the same axis family as event-poster-v1/
// promo-v1, deliberately kept CALMER to match this template's own design
// brief — bigAccent only ever offers ring/blob (never the busier band/dots),
// and dotted-flow-arc is never offered (no provable large gap in a
// vertically-centered single stack, same reasoning as promo-v1). The badge
// chip stands in as this template's "highlight" field for connector
// wrapping + celebration-element pairing.
//
// Decoration budget (same 4-branch discipline as event-poster-v1 — see that
// module's header): themed -> 2 corner stickers only; connector active -> no
// big accent, up to 2 elements; elements only -> big accent + up to 2
// elements; sparse/plain -> big accent + (rich mode only) one fill
// strategy. No photo background is ever allowed here, so there's no
// "skip when photo" branch.
//
// Design-review fixes (round 1): (1) semantic elements now render as a
// deliberate 64px chip cluster (decorations.ts#elementChipRow) in the
// footer bar, flanking the CTA, never a bare ~22px floating row. (2) the
// card's root layout changed from one `justify-content: center` group
// (large unused bands top/bottom on sparse input) to a `flexGrow: 1` hero
// wrapper (still genuinely centered WITHIN its own region — preserves the
// "calm" design intent) + an ALWAYS-present footer bar pinned to the bottom
// edge. (3) curvedArrow no longer bleeds off-canvas — see its own inline
// comment.
//
// Design-review fixes (round 2 — tall-format mid-band guarantee): round 1's
// flexGrow hero wrapper centers the hero WITHIN its own region, but that
// region itself can be huge on a tall (portrait) canvas with a short
// hero — leaving padding-like empty space both above AND below the hero,
// inside the wrapper. Now: (a) render.ts's format-density coupling
// (densityFields below) keeps sparse content off the seeded portrait
// auto-pick. (b) whenever portrait IS rendering anyway and no connector is
// active, a SECOND `flexGrow: 1` section — decorations.ts#midBandFiller,
// centered within its own share of the remaining space exactly like the
// hero wrapper is — sits between the hero wrapper and the footer bar. Both
// regions split the leftover space evenly; nothing is a fixed offset.

import { autofitText, measureTextWidth } from "../autofit"
import { hexToRgb } from "../contrast"
import {
  accentBar,
  assertConnectorFitsReservedZone,
  confettiScatter,
  curvedArrow,
  dotGrid,
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

const SIZE = TEMPLATE_SIZES.square
const SUPPORTED_SIZES = [TEMPLATE_SIZES.square, TEMPLATE_SIZES.portrait]
const SAFE_MARGIN_RATIO = 0.09 // wider than the poster templates — the whole point here is generous whitespace.

const FIELDS: TemplateFieldSchema[] = [
  { key: "badge", label: "Badge", required: false, maxChars: 22, helpText: "Small label above the headline, e.g. NEW or HEADS UP" },
  { key: "headline", label: "Headline", required: true, maxChars: 80, helpText: "The announcement itself, plain and clear" },
  { key: "body", label: "Supporting line", required: false, maxChars: 140 },
  { key: "ctaLine", label: "Call to action", required: false, maxChars: 34, helpText: "e.g. See the new menu" },
]

/** This template's optional-field list — the single source both build()'s densityMode calculation AND render.ts's format-density coupling (TemplateDef.densityFields) read from. */
function optionalDensityFields(fields: Record<string, string>): Array<string | undefined> {
  return [fields.badge, fields.body, fields.ctaLine]
}

function margin(width: number): number {
  return Math.round(width * SAFE_MARGIN_RATIO)
}

/** Diameter for this template's semantic-element chips (decorations.ts#elementChipRow) — a deliberate design object, not a bare floating glyph (design-review fix). */
const ELEMENT_CHIP_DIAMETER = 64

// ===========================================================================
// Variety axes
// ===========================================================================

const HEADLINE_ALIGNMENTS = ["left", "center", "stacked-banner"] as const
type HeadlineAlignment = (typeof HEADLINE_ALIGNMENTS)[number]
const COMPOSITIONS = ["type-dominant", "element-dominant", "split"] as const
type Composition = (typeof COMPOSITIONS)[number]
const SCALE_PLAYS = ["normal", "oversized"] as const
const PALETTE_ROLES = ["accent", "primary"] as const
// Deliberately calmer than event-poster/promo — ring/blob only, never the busier band/dots (this template's own design brief).
const BIG_ACCENTS = ["ring", "blob"] as const
type BigAccentKind = (typeof BIG_ACCENTS)[number]
const CORNERS = ["top-right", "bottom-right", "bottom-left"] as const
type Corner = "top-left" | "top-right" | "bottom-right" | "bottom-left"

const COMPOSITION_HEADLINE_WIDTH_FRACTION: Record<Composition, number> = {
  "type-dominant": 1,
  "element-dominant": 0.92,
  split: 0.74,
}

function bigAccentOffsets(corner: (typeof CORNERS)[number], diameter: number) {
  const bleed = -Math.round(diameter * 0.4)
  if (corner === "top-right") return { top: bleed, right: bleed }
  if (corner === "bottom-right") return { bottom: bleed, right: bleed }
  return { bottom: bleed, left: bleed }
}

const ALL_CORNERS: Corner[] = ["top-left", "top-right", "bottom-right", "bottom-left"]

function cornerOffsets(corner: Corner, bleed = -16): { top?: number; left?: number; right?: number; bottom?: number } {
  if (corner === "top-left") return { top: bleed, left: bleed }
  if (corner === "top-right") return { top: bleed, right: bleed }
  if (corner === "bottom-right") return { bottom: bleed, right: bleed }
  return { bottom: bleed, left: bleed }
}

function cornerOppositeAccent(accentCorner: (typeof CORNERS)[number]): Corner {
  if (accentCorner === "top-right") return "bottom-left"
  if (accentCorner === "bottom-right") return "top-left"
  return "top-right"
}

function secondStickerCorner(accentCorner: (typeof CORNERS)[number], firstCorner: Corner, hasLogo: boolean): Corner {
  const excluded = new Set<Corner>([accentCorner as Corner, firstCorner])
  if (hasLogo) excluded.add("bottom-right")
  return ALL_CORNERS.find((corner) => !excluded.has(corner)) ?? firstCorner
}

async function buildThemeStickers(
  ctx: TemplateBuildContext,
  accentCorner: (typeof CORNERS)[number],
  hasLogo: boolean
): Promise<SatoriElement[]> {
  if (!ctx.theme) return []
  const firstCorner = cornerOppositeAccent(accentCorner)
  const secondCorner = secondStickerCorner(accentCorner, firstCorner, hasLogo)
  const slots: Array<{ offsets: { top?: number; left?: number; right?: number; bottom?: number }; sizePx: number; opacity: number }> = [
    { offsets: cornerOffsets(firstCorner), sizePx: 84, opacity: 0.95 },
    { offsets: cornerOffsets(secondCorner), sizePx: 84, opacity: 0.95 },
  ]
  const picks = ctx.theme.assets.slice(0, slots.length)
  const placed = await Promise.all(
    picks.map(async (asset, index) => {
      const slot = slots[index]
      const rotation = stickerRotationJitter(`${ctx.seed}:announcement-sticker:${index}:${asset.name}`)
      const tintHex = ctx.roles.accent
      const sticker = await stickerElement(asset.path, slot.sizePx, rotation, slot.opacity, tintHex)
      return sticker ? positioned(sticker, slot.offsets) : null
    })
  )
  return placed.filter((el): el is SatoriElement => el !== null)
}

/** Field-dependent connector pool, weighted toward "none". No dotted-flow-arc here (no provable large gap in a centered single stack — see module header). */
function connectorPool(fields: Record<string, string>): Array<ConnectorKey | "none"> {
  const pool: Array<ConnectorKey | "none"> = ["none", "none", "none"]
  if (fields.ctaLine) pool.push("curved-arrow", "scribble-underline")
  if (fields.badge) pool.push("scribble-circle", "starburst")
  return pool
}

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
      if (resolved.kind === "confetti") continue
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

/** Resolves the first AI-picked semantic element's Tier-A icon key when available, else a neutral fallback — shared by the rich-density "watermark-icon" fill strategy and the tall-format mid-band guarantee below. */
function resolveWatermarkIconKey(ctx: TemplateBuildContext): Parameters<typeof iconChip>[0] {
  const firstKey = ctx.elements[0]
  const resolved = firstKey ? resolveElement(firstKey) : null
  return resolved && resolved.kind === "icon" ? resolved.key : "sparkles"
}

async function buildAnnouncement(ctx: TemplateBuildContext): Promise<SatoriElement> {
  const { size, roles, fields, logoDataUri, backgroundKind, fontFamily, seed } = ctx
  const m = margin(size.width)
  const contentWidth = size.width - m * 2
  const hasTheme = Boolean(ctx.theme)

  const headlineAlignment: HeadlineAlignment = pickAxis(seed, "headlineAlignment", HEADLINE_ALIGNMENTS)
  const composition = pickAxis(seed, "composition", COMPOSITIONS)
  const scalePlay = pickAxis(seed, "scalePlay", SCALE_PLAYS)
  const paletteRole = pickAxis(seed, "paletteRole", PALETTE_ROLES)
  const bigAccentKind: BigAccentKind = pickAxis(seed, "bigAccent", BIG_ACCENTS)
  const accentCorner = pickAxis(seed, "accentCorner", CORNERS)
  const accentColor = paletteRole === "primary" ? roles.primary : roles.accent
  const isCentered = headlineAlignment === "center"

  const connectorChoice = hasTheme ? "none" : pickAxis(seed, "connector", connectorPool(fields))
  const useConnector = connectorChoice !== "none"

  const densityMode = computeDensityMode(optionalDensityFields(fields))
  const fillStrategy = densityMode === "rich" ? pickFillStrategy(seed) : null
  const applyFill = fillStrategy !== null && !hasTheme && !useConnector

  const wordCount = fields.headline.trim().split(/\s+/).filter(Boolean).length
  const headlineCeiling = (scalePlay === "oversized" && wordCount <= 4) || (applyFill && fillStrategy === "oversized-hero") ? 112 : 92

  const headlineFit = autofitText({
    text: fields.headline,
    maxWidth: contentWidth * COMPOSITION_HEADLINE_WIDTH_FRACTION[composition],
    maxHeight: size.height * 0.3,
    minFontSize: 44,
    maxFontSize: headlineCeiling,
    lineHeight: 1.08,
    maxLines: 3,
  })

  const headlineLines = headlineFit.lines.map((line, index) =>
    box(
      {
        flexDirection: "row",
        justifyContent: isCentered ? "center" : "flex-start",
        textAlign: isCentered ? "center" : "left",
        fontFamily,
        fontWeight: 900,
        fontSize: headlineFit.fontSize,
        lineHeight: 1.08,
        letterSpacing: "-0.015em",
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
            alignSelf: isCentered ? "center" : "flex-start",
            backgroundColor: (() => {
              const { r, g, b } = hexToRgb(roles.accent)
              return `rgba(${r}, ${g}, ${b}, 0.16)`
            })(),
            borderRadius: 10,
            padding: "8px 14px",
          },
          headlineLines
        )
      : box({ flexDirection: "column", alignSelf: isCentered ? "center" : "flex-start" }, headlineLines)

  // Design-review fix: rendered as a deliberate chip cluster
  // (decorations.ts#elementChipRow), placed in the DECLARED footer-bar slot
  // below (flanking the CTA) rather than a bare ~22px floating row
  // competing with the badge/headline for attention.
  const { icons: elementIcons, hasCelebrationElement } = await buildElementIcons(ctx, roles.textOnAccent, hasTheme)
  const elementCluster = elementIcons.length > 0 ? elementChipRow(elementIcons, roles.accent, ELEMENT_CHIP_DIAMETER, 14) : null

  const badgePill = fields.badge
    ? box(
        {
          flexDirection: "row",
          alignSelf: "flex-start",
          padding: "10px 20px",
          borderRadius: 999,
          backgroundColor: roles.accent,
          color: roles.textOnAccent,
          fontFamily,
          fontWeight: 700,
          fontSize: 20,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        },
        fields.badge
      )
    : null

  const badgeConnectorKind = useConnector && (connectorChoice === "scribble-circle" || connectorChoice === "starburst") ? connectorChoice : null
  const wrappedBadge =
    badgePill && badgeConnectorKind
      ? box({ position: "relative", alignSelf: "flex-start" }, [
          (() => {
            const badgeWidth = measureTextWidth(fields.badge, 20) + 40
            const badgeHeight = 40
            const wrapW = Math.round(badgeWidth * 1.16)
            const wrapH = Math.round(badgeHeight * 1.16)
            const connectorEl =
              badgeConnectorKind === "scribble-circle"
                ? scribbleCircle(wrapW, wrapH, accentColor, seed, 7)
                : starburst(Math.max(wrapW, wrapH), accentColor, seed, 0.8)
            return positioned(connectorEl, { top: -Math.round((wrapH - badgeHeight) / 2), left: -Math.round((wrapW - badgeWidth) / 2) })
          })(),
          badgePill,
        ])
      : badgePill

  const confettiFlourish = badgePill && hasCelebrationElement ? confettiScatter(40, 34, [roles.accent, roles.primary], seed, 7) : null

  const badgeRow = badgePill
    ? box(
        { flexDirection: "row", alignItems: "center", alignSelf: isCentered ? "center" : "flex-start", marginBottom: 24 },
        [wrappedBadge, confettiFlourish ? box({ marginLeft: 12 }, [confettiFlourish]) : null].filter(
          (child): child is SatoriElement => Boolean(child)
        )
      )
    : null

  const ctaUnderline =
    useConnector && connectorChoice === "scribble-underline" && fields.ctaLine
      ? scribbleUnderline(measureTextWidth(fields.ctaLine, 24), roles.accent, seed, 7)
      : null

  // Design-review fix: sized to fit entirely inside the margin gutter (`m`)
  // with ZERO bleed, instead of the earlier negative-bleed placement that
  // cropped the arrowhead. See decorations.ts's connector module header.
  const curvedArrowEl = (() => {
    if (!useConnector || connectorChoice !== "curved-arrow" || !fields.ctaLine) return null
    assertConnectorFitsReservedZone(m, m)
    return positioned(curvedArrow(m, Math.round(size.height * 0.3), accentColor, seed, 8, true), {
      top: Math.round(size.height * 0.26),
      right: 0,
    })
  })()

  // Design-review fix (vertical fill discipline): the whole card used to be
  // one `justify-content: center` group — calm, but on short/sparse input
  // it left large unused bands top and bottom (the canvas must always read
  // full, per the owner law). Split into a hero group (badge/headline/body
  // — still genuinely vertically centered, via the flexGrow wrapper below,
  // preserving this template's own "calm, centered" design intent) and an
  // ALWAYS-present footer bar (CTA + element cluster, or a quiet minimal
  // accent line when neither exists) pinned to the very bottom.
  const heroGroup = box({ flexDirection: "column", alignItems: isCentered ? "center" : "flex-start" }, [
    badgeRow,
    headlineBlock,
    fields.body
      ? box(
          {
            flexDirection: "row",
            justifyContent: isCentered ? "center" : "flex-start",
            textAlign: isCentered ? "center" : "left",
            marginTop: 22,
            fontFamily,
            fontWeight: 400,
            fontSize: 28,
            color: roles.textOnDark,
            opacity: 0.76,
          },
          fields.body
        )
      : null,
  ])

  const ctaBlock = fields.ctaLine
    ? box({ flexDirection: "column" }, [
        box({ flexDirection: "row", alignItems: "center" }, [
          box(
            { flexDirection: "row", fontFamily, fontWeight: 700, fontSize: 24, color: roles.accent, letterSpacing: "0.01em" },
            fields.ctaLine
          ),
          box({ width: 10, height: 1 }),
          iconChip("arrow-right", roles.accent, 22),
        ]),
        ctaUnderline ? box({ marginTop: -4 }, [ctaUnderline]) : null,
      ])
    : null

  const footerItems = [ctaBlock, elementCluster].filter((child): child is SatoriElement => Boolean(child))
  const footerBar =
    footerItems.length > 0
      ? box(
          {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: footerItems.length === 2 ? "space-between" : isCentered ? "center" : "flex-start",
            width: contentWidth,
            marginTop: 36,
          },
          footerItems
        )
      : // Sparsest case (no CTA, no elements): a quiet minimal accent line
        // still anchors the bottom edge, so the card always touches both the
        // top AND bottom of the canvas — never floats clustered in the
        // middle with dead space on both sides.
        box({ flexDirection: "row", justifyContent: isCentered ? "center" : "flex-start", width: contentWidth, marginTop: 36 }, [
          box({ opacity: 0.32 }, [accentBar(48, 3, roles.textOnDark, 2)]),
        ])

  const rootBackgroundStyle =
    backgroundKind === "gradient"
      ? { backgroundImage: `linear-gradient(160deg, ${roles.backgroundStart} 0%, ${roles.backgroundEnd} 100%)` }
      : { backgroundColor: roles.backgroundStart }

  const themeStickers = await buildThemeStickers(ctx, accentCorner, Boolean(logoDataUri))

  const showBigAccent = !hasTheme && !useConnector
  const bigAccentDiameter = Math.round(size.width * 0.62)
  const bigAccentEl = !showBigAccent
    ? null
    : bigAccentKind === "blob"
      ? positioned(organicBlob(bigAccentDiameter, bigAccentDiameter, accentColor, seed, 0.14), bigAccentOffsets(accentCorner, bigAccentDiameter))
      : positioned(ringAccent(bigAccentDiameter, 3, accentColor, 0.2), bigAccentOffsets(accentCorner, bigAccentDiameter))

  const fillElement = (() => {
    if (!applyFill) return null
    if (fillStrategy === "echo-text") {
      const scaledFontSize = Math.round(headlineFit.fontSize * 1.8)
      return echoText(
        headlineFit.lines,
        fontFamily,
        scaledFontSize,
        roles.textOnDark,
        { bottom: -Math.round(size.height * 0.06), left: -Math.round(size.width * 0.05) },
        0.06
      )
    }
    if (fillStrategy === "watermark-icon") {
      const wmSize = Math.round(size.width * 0.4)
      const glyph = iconChip(resolveWatermarkIconKey(ctx), accentColor, wmSize)
      return positioned(box({ opacity: 0.08 }, [glyph]), { top: -Math.round(wmSize * 0.22), right: -Math.round(wmSize * 0.2) })
    }
    if (fillStrategy === "expanded-dots") {
      return positioned(dotGrid(6, 6, 11, 17, accentColor, 0.28), { bottom: m, left: -Math.round(m * 0.3) })
    }
    return null
  })()

  // The hero group sits inside a `flexGrow: 1` wrapper that centers it
  // vertically WITHIN whatever space is left above the footer bar — so the
  // hero still reads "calm, centered" (this template's own design intent)
  // while the footer bar stays genuinely pinned to the bottom edge, and the
  // card as a whole always touches both the top and bottom of the canvas.
  const heroWrapper = el("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      flexGrow: 1,
      justifyContent: "center",
      alignItems: isCentered ? "center" : "flex-start",
    },
    children: [heroGroup],
  })

  // Design-review fix (round 2 — tall-format mid-band guarantee): a SECOND
  // `flexGrow: 1` section, same shape as heroWrapper above, so the leftover
  // space splits evenly between "around the hero" and "around the filler"
  // instead of all of it padding the hero alone. Fires whenever the canvas
  // is tall (portrait), regardless of connector state — a correction from
  // an earlier `!useConnector` gate that assumed an active connector
  // already fills the middle; false here too (curved-arrow is a thin
  // margin-gutter stroke, scribble devices sit near the badge/CTA, neither
  // covers the wide central band).
  const midBandKind = isTallFormat(size) ? pickAxis(seed, "midBandFiller", MID_BAND_FILLER_KINDS) : null
  const midBandSection = midBandKind
    ? el("div", {
        style: { display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center" },
        // An explicit width (not this section's own alignItems, which is
        // "flex-start"/"center", never "stretch") gives midBandFiller's
        // internal flex-end/flex-start margin-offset actual room to
        // alternate sides.
        children: [box({ width: contentWidth }, [midBandFiller(midBandKind, resolveWatermarkIconKey(ctx), accentColor, seed)])],
      })
    : null

  return el("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      position: "relative",
      width: size.width,
      height: size.height,
      padding: m,
      fontFamily,
      overflow: "hidden",
      ...rootBackgroundStyle,
    },
    children: [
      bigAccentEl,
      fillElement,
      curvedArrowEl,
      ...themeStickers,
      heroWrapper,
      midBandSection,
      footerBar,
      logoDataUri
        ? box({ position: "absolute", bottom: m, right: m }, [img(logoDataUri, { width: 64, height: 64, objectFit: "contain", borderRadius: 10 })])
        : null,
    ].filter(Boolean),
  })
}

export const ANNOUNCEMENT_V1: TemplateDef = {
  id: "announcement-v1",
  name: "Announcement",
  description:
    "A calm, understated card for lower-key news — new hours, a policy change, a small milestone, 'we're back' — plain badge + headline + optional supporting line, never a loud CTA button. No photo.",
  defaultSize: SIZE,
  supportedSizes: SUPPORTED_SIZES,
  densityFields: optionalDensityFields,
  allowedBackgrounds: ["solid", "gradient"],
  fields: FIELDS,
  build: buildAnnouncement,
}
