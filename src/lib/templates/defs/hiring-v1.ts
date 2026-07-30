// hiring-v1 — a "we're hiring" recruiting poster (1080x1350 portrait by
// default; also renders at 1080x1080 square — see supportedSizes). A fixed
// "WE'RE HIRING" eyebrow (not AI-authored — it's always this phrase), a
// large role title, 2-3 benefit rows each grounded with a check iconChip,
// and a full-width CTA bar. Background: brand solid/gradient only.
//
// Wave 4 anti-repetition machine: the same axis family as the other 3
// full-axis templates, adapted to this one's fields — there's no highlight/
// price-shaped field here (a role title isn't one), so scribble-circle/
// starburst are never offered (the semantic pairing rule requires a real
// highlight/price field to wrap — misusing it on a role title would violate
// that rule, so this template simply doesn't offer those two devices).
// dotted-flow-arc reuses the existing "quiet centered rule" slot between the
// benefit list and the CTA bar, offered only when there's a provably large
// gap there (1 or 0 optional benefits filled).
//
// Decoration budget (same 4-branch discipline as event-poster-v1): themed —
// this template has no theme stickers today (unchanged, no sticker slots
// were ever declared for it) — connector active -> no big accent, up to 2
// elements; elements only -> big accent + up to 2 elements; sparse/plain ->
// big accent + (rich mode only) one fill strategy.
//
// Design-review fixes (round 1): (1) semantic elements now render as a
// deliberate 64px chip cluster (decorations.ts#elementChipRow) flanking the
// CTA bar, never a bare ~22px floating row. (2) curvedArrow no longer
// bleeds off-canvas — see its own inline comment. The root's own
// `justify-content: space-between`, PLUS bigAccentOffsets' own deliberate
// vertical centering (see that function's comment — it already spans the
// benefit/CTA gap), meant this template never had the "floats in the
// middle" dead-space bug the same review flagged in promo-v1/
// announcement-v1... for the branches where bigAccent actually shows.
//
// Design-review fix (round 2 — tall-format mid-band guarantee): bigAccent
// is DISABLED whenever a connector is active (the "when present, big
// accent drops" restraint rule) — which is exactly the case round 1 missed:
// a tall canvas + an active connector that doesn't itself span the middle
// (e.g. scribble-underline, which only decorates the CTA text) left a real
// gap. Now: whenever a tall format is rendering, a connector is active, and
// that connector isn't already dotted-flow-arc (which already occupies
// this exact slot), midGap upgrades to decorations.ts#midBandFiller — the
// same in-flow slot, so still placed entirely by `justify-content:
// space-between`, never a fixed offset. densityFields also lets render.ts's
// format-density coupling keep sparse content off the seeded portrait pick.

import { autofitText, measureTextWidth } from "../autofit"
import { hexToRgb } from "../contrast"
import {
  assertConnectorFitsReservedZone,
  confettiScatter,
  curvedArrow,
  dotGrid,
  dottedFlowArc,
  elementChipIconSize,
  elementChipRow,
  iconChip,
  midBandFiller,
  MID_BAND_FILLER_KINDS,
  organicBlob,
  positioned,
  ringAccent,
  scribbleUnderline,
  stickerElement,
  type ConnectorKey,
} from "../decorations"
import { computeDensityMode, echoText, pickFillStrategy } from "../density"
import { isCelebrationElement, resolveElement } from "../elements"
import { box, el, img, isTallFormat, TEMPLATE_SIZES, type SatoriElement, type TemplateBuildContext, type TemplateDef, type TemplateFieldSchema } from "../types"
import { pickAxis } from "../variants"

const SIZE = TEMPLATE_SIZES.portrait
const SUPPORTED_SIZES = [TEMPLATE_SIZES.portrait, TEMPLATE_SIZES.square]
const SAFE_MARGIN_RATIO = 0.06
const EYEBROW_TEXT = "WE'RE HIRING"

const FIELDS: TemplateFieldSchema[] = [
  { key: "roleTitle", label: "Role", required: true, maxChars: 50, helpText: "e.g. Barista — Part Time" },
  { key: "benefit1", label: "Benefit 1", required: true, maxChars: 50, helpText: "e.g. Flexible scheduling" },
  { key: "benefit2", label: "Benefit 2", required: false, maxChars: 50 },
  { key: "benefit3", label: "Benefit 3", required: false, maxChars: 50 },
  { key: "ctaLine", label: "Call to action", required: true, maxChars: 40, helpText: "e.g. Apply today — link in bio" },
]

/** This template's optional-field list — the single source both build()'s densityMode calculation AND render.ts's format-density coupling (TemplateDef.densityFields) read from. */
function optionalDensityFields(fields: Record<string, string>): Array<string | undefined> {
  return [fields.benefit2, fields.benefit3]
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
const BIG_ACCENTS = ["megaphone", "ring", "blob"] as const
type BigAccentKind = (typeof BIG_ACCENTS)[number]
const CORNERS = ["top-right", "top-left"] as const

const COMPOSITION_TITLE_WIDTH_FRACTION: Record<Composition, number> = {
  "type-dominant": 1,
  "element-dominant": 0.92,
  split: 0.76,
}

// Vertically centered on the canvas (not pinned to the top) so this one
// large accent also occupies the gap between the benefit rows and the CTA
// bar — the same "empty middle" fix event-poster-v1 needed.
function bigAccentOffsets(corner: (typeof CORNERS)[number], size: number, canvasHeight: number) {
  const bleed = -Math.round(size * 0.3)
  const top = Math.round(canvasHeight * 0.5 - size * 0.5)
  return corner === "top-right" ? { top, right: bleed } : { top, left: bleed }
}

/** Field-dependent connector pool, weighted toward "none". No scribble-circle/starburst here — no highlight/price field exists on this template (see module header). */
function connectorPool(): Array<ConnectorKey | "none"> {
  return ["none", "none", "none", "curved-arrow", "scribble-underline"]
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
function resolveWatermarkIconKey(ctx: TemplateBuildContext, fallback: Parameters<typeof iconChip>[0] = "users"): Parameters<typeof iconChip>[0] {
  const firstKey = ctx.elements[0]
  const resolved = firstKey ? resolveElement(firstKey) : null
  return resolved && resolved.kind === "icon" ? resolved.key : fallback
}

async function buildHiring(ctx: TemplateBuildContext): Promise<SatoriElement> {
  const { size, roles, fields, logoDataUri, backgroundKind, fontFamily, seed } = ctx
  const m = margin(size.width)
  const contentWidth = size.width - m * 2

  const headlineAlignment: HeadlineAlignment = pickAxis(seed, "headlineAlignment", HEADLINE_ALIGNMENTS)
  const composition = pickAxis(seed, "composition", COMPOSITIONS)
  const scalePlay = pickAxis(seed, "scalePlay", SCALE_PLAYS)
  const paletteRole = pickAxis(seed, "paletteRole", PALETTE_ROLES)
  const bigAccentKind: BigAccentKind = pickAxis(seed, "bigAccent", BIG_ACCENTS)
  const corner = pickAxis(seed, "accentCorner", CORNERS)
  const accentColor = paletteRole === "primary" ? roles.primary : roles.accent
  const isCentered = headlineAlignment === "center"

  const benefits = [fields.benefit1, fields.benefit2, fields.benefit3].filter(Boolean)

  const connectorChoice = pickAxis(seed, "connector", connectorPool())
  const useConnector = connectorChoice !== "none"
  // dotted-flow-arc is only offered when the benefit list is sparse (a
  // provably larger gap above the CTA bar) — see module header.
  const wantsDottedFlow = connectorChoice === "dotted-flow-arc"
  const showDottedFlow = useConnector && wantsDottedFlow && benefits.length <= 1

  const densityMode = computeDensityMode(optionalDensityFields(fields))
  const fillStrategy = densityMode === "rich" ? pickFillStrategy(seed) : null
  const applyFill = fillStrategy !== null && !useConnector

  const wordCount = fields.roleTitle.trim().split(/\s+/).filter(Boolean).length
  const titleCeiling = (scalePlay === "oversized" && wordCount <= 4) || (applyFill && fillStrategy === "oversized-hero") ? 132 : 108

  const roleTitleFit = autofitText({
    text: fields.roleTitle,
    maxWidth: contentWidth * COMPOSITION_TITLE_WIDTH_FRACTION[composition],
    maxHeight: size.height * 0.24,
    minFontSize: 48,
    maxFontSize: titleCeiling,
    lineHeight: 1.06,
    maxLines: 3,
  })

  const roleTitleLines = roleTitleFit.lines.map((line, index) =>
    box(
      {
        flexDirection: "row",
        justifyContent: isCentered ? "center" : "flex-start",
        textAlign: isCentered ? "center" : "left",
        fontFamily,
        fontWeight: 900,
        fontSize: roleTitleFit.fontSize,
        lineHeight: 1.06,
        letterSpacing: "-0.015em",
        color: roles.textOnDark,
        marginTop: index === 0 ? 0 : 2,
      },
      line
    )
  )

  const roleTitleBlock =
    headlineAlignment === "stacked-banner"
      ? box(
          {
            flexDirection: "column",
            alignSelf: isCentered ? "center" : "flex-start",
            backgroundColor: (() => {
              const { r, g, b } = hexToRgb(accentColor)
              return `rgba(${r}, ${g}, ${b}, 0.16)`
            })(),
            borderRadius: 10,
            padding: "8px 14px",
          },
          roleTitleLines
        )
      : box({ flexDirection: "column", alignSelf: isCentered ? "center" : "flex-start" }, roleTitleLines)

  // Design-review fix: rendered as a deliberate chip cluster
  // (decorations.ts#elementChipRow), placed in the CTA/footer block below
  // (flanking the CTA bar) rather than a bare ~22px floating row inline
  // with the role title.
  const { icons: elementIcons, hasCelebrationElement } = await buildElementIcons(ctx, roles.textOnAccent, false)
  const elementCluster = elementIcons.length > 0 ? elementChipRow(elementIcons, roles.accent, ELEMENT_CHIP_DIAMETER, 14) : null

  const confettiFlourish = hasCelebrationElement ? confettiScatter(40, 34, [roles.accent, roles.primary], seed, 7) : null

  const benefitRows = benefits.map((benefit, index) =>
    box({ flexDirection: "row", alignItems: "center", marginTop: index === 0 ? 0 : 20 }, [
      iconChip("check", accentColor, 26),
      box({ width: 14, height: 1 }),
      box({ flexDirection: "row", fontFamily, fontWeight: 400, fontSize: 28, color: roles.textOnDark, opacity: 0.86 }, benefit),
    ])
  )

  const rootBackgroundStyle =
    backgroundKind === "gradient"
      ? { backgroundImage: `linear-gradient(180deg, ${roles.backgroundStart} 0%, ${roles.backgroundEnd} 100%)` }
      : { backgroundColor: roles.backgroundStart }

  const ctaUnderline =
    useConnector && connectorChoice === "scribble-underline"
      ? scribbleUnderline(measureTextWidth(fields.ctaLine, 26), roles.textOnAccent, seed, 7)
      : null

  // Design-review fix: sized to fit entirely inside the margin gutter (`m`)
  // with ZERO bleed, instead of the earlier negative-bleed placement that
  // cropped the arrowhead. See decorations.ts's connector module header.
  const curvedArrowEl = (() => {
    if (!useConnector || connectorChoice !== "curved-arrow") return null
    assertConnectorFitsReservedZone(m, m)
    return positioned(curvedArrow(m, Math.round(size.height * 0.4), accentColor, seed, 8, true), {
      top: Math.round(size.height * 0.2),
      right: 0,
    })
  })()

  // Branch discipline (see module header): connector active -> no big accent.
  const showBigAccent = !useConnector
  const bigAccentSize = Math.round(size.width * 0.62)
  const bigAccentEl = !showBigAccent
    ? null
    : bigAccentKind === "megaphone"
      ? positioned(box({ opacity: 0.14 }, [iconChip("megaphone", accentColor, bigAccentSize)]), bigAccentOffsets(corner, bigAccentSize, size.height))
      : bigAccentKind === "blob"
        ? positioned(organicBlob(bigAccentSize, bigAccentSize, accentColor, seed, 0.13), bigAccentOffsets(corner, bigAccentSize, size.height))
        : positioned(ringAccent(bigAccentSize, 3, accentColor, 0.2), bigAccentOffsets(corner, bigAccentSize, size.height))

  const fillElement = (() => {
    if (!applyFill) return null
    if (fillStrategy === "echo-text") {
      const scaledFontSize = Math.round(roleTitleFit.fontSize * 1.7)
      return echoText(
        roleTitleFit.lines,
        fontFamily,
        scaledFontSize,
        roles.textOnDark,
        { bottom: -Math.round(size.height * 0.05), left: -Math.round(size.width * 0.04) },
        0.06
      )
    }
    if (fillStrategy === "watermark-icon") {
      const wmSize = Math.round(size.width * 0.42)
      const glyph = iconChip(resolveWatermarkIconKey(ctx), accentColor, wmSize)
      return positioned(box({ opacity: 0.09 }, [glyph]), { bottom: -Math.round(wmSize * 0.22), right: -Math.round(wmSize * 0.2) })
    }
    if (fillStrategy === "expanded-dots") {
      return positioned(dotGrid(6, 6, 11, 17, accentColor, 0.26), { top: m, left: -Math.round(m * 0.3) })
    }
    return null
  })()

  // Quiet centered rule filling the gap between the benefit list and the CTA
  // bar — swapped for a dotted-flow-arc connector when the benefit list is
  // sparse (see module header). In-flow sibling either way, never a fixed
  // absolute offset (the space-between root's gap height depends on content).
  // Design-review fix (round 2): bigAccent already spans this gap when it's
  // showing (see bigAccentOffsets' own comment) — but it's disabled
  // whenever a connector is active, which is exactly the case that can
  // leave a tall canvas's middle empty. wantsMidBandFiller only fires then
  // (and never on top of dotted-flow-arc, which already occupies this slot).
  const wantsMidBandFiller = isTallFormat(size) && useConnector && !showDottedFlow
  const midBandKind = wantsMidBandFiller ? pickAxis(seed, "midBandFiller", MID_BAND_FILLER_KINDS) : null
  const midGap = showDottedFlow
    ? box({ flexDirection: "row", justifyContent: "center" }, [dottedFlowArc(Math.round(contentWidth * 0.45), 90, accentColor, seed)])
    : midBandKind
      ? midBandFiller(midBandKind, resolveWatermarkIconKey(ctx), accentColor, seed)
      : box({ flexDirection: "row", justifyContent: "center", opacity: 0.3 }, [
          el("div", { style: { display: "flex", width: Math.round(contentWidth * 0.32), height: 1, backgroundColor: roles.textOnDark } }),
        ])

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
      bigAccentEl,
      fillElement,
      curvedArrowEl,
      box({ flexDirection: "column" }, [
        box(
          {
            flexDirection: "row",
            justifyContent: isCentered ? "center" : "flex-start",
            fontFamily,
            fontWeight: 700,
            fontSize: 26,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: roles.accent,
            marginBottom: 20,
          },
          EYEBROW_TEXT
        ),
        roleTitleBlock,
        confettiFlourish
          ? box({ flexDirection: "row", justifyContent: isCentered ? "center" : "flex-start", marginTop: 10 }, [confettiFlourish])
          : null,
        box({ flexDirection: "column", marginTop: 40 }, benefitRows),
      ]),
      midGap,
      box({ flexDirection: "column" }, [
        box({ flexDirection: "column" }, [
          box(
            {
              flexDirection: "row",
              justifyContent: "center",
              fontFamily,
              fontWeight: 700,
              fontSize: 26,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: roles.textOnAccent,
              backgroundColor: roles.accent,
              padding: "20px 0",
              borderRadius: 14,
            },
            fields.ctaLine
          ),
          ctaUnderline ? box({ flexDirection: "row", justifyContent: "center", marginTop: -4 }, [ctaUnderline]) : null,
        ]),
        // Design-review fix: the element cluster (when present) flanks the
        // CTA bar as its own declared row — a deliberate design object, not
        // an orphan floating inline with the role title.
        elementCluster ? box({ flexDirection: "row", justifyContent: "center", marginTop: 20 }, [elementCluster]) : null,
        logoDataUri
          ? box({ flexDirection: "row", justifyContent: "center", marginTop: 24 }, [
              img(logoDataUri, { width: 56, height: 56, objectFit: "contain", borderRadius: 10 }),
            ])
          : null,
      ]),
    ].filter(Boolean),
  })
}

export const HIRING_V1: TemplateDef = {
  id: "hiring-v1",
  name: "Hiring poster",
  description:
    "A recruiting poster — fixed 'WE'RE HIRING' eyebrow, large role title, 2-3 check-marked benefit rows, and a full-width CTA bar. Use for job openings.",
  defaultSize: SIZE,
  supportedSizes: SUPPORTED_SIZES,
  densityFields: optionalDensityFields,
  allowedBackgrounds: ["solid", "gradient"],
  fields: FIELDS,
  build: buildHiring,
}
