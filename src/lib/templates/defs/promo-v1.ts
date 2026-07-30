// promo-v1 — a punchy, single-offer promo card (1080x1080 square by default;
// also renders at 1080x1350 portrait — see supportedSizes). A solid
// brand-accent block carries the offer numeral + line (and optional fine
// print); when an AI photo background is used, the block shrinks to ~45% of
// the canvas (left) and the photo fills the rest (right, no scrim — the
// solid block already carries all the text). With no photo, the block goes
// full-bleed and the type grows to fill it.
//
// Wave 4 anti-repetition machine: the same 7-axis system as event-poster-v1
// (headlineAlignment/composition/scalePlay/densityMode/paletteRole/
// bigAccent/connector), adapted to promo-v1's own field set — the "offer"
// field stands in as this template's highlight/price field for connector
// wrapping (scribble-circle/starburst) and celebration-element pairing,
// since it IS the price. `offerLine` stands in for the "cta" text a
// scribble-underline connector sits under. Only one optional field exists
// (finePrint), so densityMode is "rich" whenever it's empty — the sparse-
// input case this template is MOST likely to hit in practice, which is
// exactly why the Wave 4 sample tests use this template's fill-strategy
// proof (see scripts/render-sample-templates.test.ts).
//
// Decoration budget (same 4-branch discipline as event-poster-v1 — see that
// module's header for the full reasoning): themed -> corner stickers only;
// connector active -> no big accent, up to 2 elements; elements only ->
// big accent + up to 2 elements (celebration ones pair with the offer
// numeral); sparse/plain -> big accent + (rich mode only) one fill
// strategy. A photo background always demotes to 0 of these (unchanged).
//
// Design-review fixes (round 1): (1) semantic elements now render as a
// deliberate 60px chip cluster (decorations.ts#elementChipRow, roles.primary
// backdrop — a genuinely distinct hue from the block's own roles.accent
// background — with a contrast.ts#pickTextColor-matched glyph) in the
// bottom bar, flanking the fine print, never a bare ~22px floating row.
// (2) The block's root layout changed from `justify-content: center`
// (clustered content, large unused bands top/bottom) to `space-between`: a
// top-weighted hero group (offer numeral + detail line) and an ALWAYS-
// present bottom bar (fine print + element cluster, or a quiet minimal
// accent line when neither exists). (3) curvedArrow no longer bleeds
// off-canvas — see its own inline comment below.
//
// Design-review fixes (round 2 — tall-format mid-band guarantee): round 1's
// hero-top/footer-bottom split still left the MIDDLE of a tall (portrait)
// canvas flat and empty on short copy — space-between only pins the two
// ends, it doesn't fill the gap between them. Two changes: (a) render.ts's
// format-density coupling (densityFields below) now keeps the seeded
// auto-pick off portrait for this template's inherently sparse content
// (only one optional field, finePrint — see the density note above) unless
// an explicit size pin overrides it. (b) whenever a tall format IS
// rendering anyway (explicit pin, or content genuinely earns it) and no
// connector is already occupying the block, a THIRD in-flow child —
// decorations.ts#midBandFiller — sits between topGroup and bottomBar;
// `justify-content: space-between` then centers it in whatever gap
// remains, so it's still placed entirely by layout, never a fixed offset.

import { autofitText, measureTextWidth } from "../autofit"
import { hexToRgb, pickTextColor } from "../contrast"
import {
  accentBar,
  assertConnectorFitsReservedZone,
  confettiScatter,
  cornerTicks,
  curvedArrow,
  dotGrid,
  elementChipIconSize,
  elementChipRow,
  highlightSweep,
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
import { box, el, isTallFormat, TEMPLATE_SIZES, type SatoriElement, type TemplateBuildContext, type TemplateDef, type TemplateFieldSchema } from "../types"
import { pickAxis } from "../variants"

const SIZE = TEMPLATE_SIZES.square
const SUPPORTED_SIZES = [TEMPLATE_SIZES.square, TEMPLATE_SIZES.portrait]
const SAFE_MARGIN_RATIO = 0.055
/** Fraction of the canvas the solid text block occupies when a photo shares the frame. */
const SPLIT_BLOCK_FRACTION = 0.45

/** This template's optional-field list — the single source both build()'s densityMode calculation AND render.ts's format-density coupling (TemplateDef.densityFields) read from. */
function optionalDensityFields(fields: Record<string, string>): Array<string | undefined> {
  return [fields.finePrint]
}

const FIELDS: TemplateFieldSchema[] = [
  { key: "offer", label: "Offer", required: true, maxChars: 14, helpText: "e.g. 30% OFF, $10 OFF, BOGO" },
  { key: "offerLine", label: "Offer detail", required: true, maxChars: 60, helpText: "e.g. All lattes, this weekend only" },
  { key: "finePrint", label: "Fine print", required: false, maxChars: 80 },
]

function margin(width: number): number {
  return Math.round(width * SAFE_MARGIN_RATIO)
}

/** Diameter for this template's semantic-element chips (decorations.ts#elementChipRow) — a deliberate design object, not a bare floating glyph (design-review fix). Slightly smaller than event-poster-v1's since promo-v1's block can be as narrow as 45% of the canvas in photo-split mode. */
const ELEMENT_CHIP_DIAMETER = 60

// ===========================================================================
// Variety axes
// ===========================================================================

const HEADLINE_ALIGNMENTS = ["left", "center", "stacked-banner"] as const
type HeadlineAlignment = (typeof HEADLINE_ALIGNMENTS)[number]
const COMPOSITIONS = ["type-dominant", "element-dominant", "split"] as const
type Composition = (typeof COMPOSITIONS)[number]
const SCALE_PLAYS = ["normal", "oversized"] as const
const PALETTE_ROLES = ["textOnAccent", "primary"] as const
const BIG_ACCENTS = ["ring", "ticks", "dots", "blob"] as const
type BigAccentKind = (typeof BIG_ACCENTS)[number]

const COMPOSITION_TEXT_WIDTH_FRACTION: Record<Composition, number> = {
  "type-dominant": 1,
  "element-dominant": 0.94,
  split: 0.76,
}
const COMPOSITION_ACCENT_SCALE: Record<Composition, number> = {
  "type-dominant": 1,
  "element-dominant": 1.15,
  split: 1,
}

/** 4-corner tick frame inset from the block's edges — each tick is the same top-left-oriented shape, rotated per corner. */
function cornerFrame(colorHex: string, inset: number): ReturnType<typeof positioned>[] {
  const tick = () => cornerTicks(colorHex)
  return [
    positioned(tick(), { top: inset, left: inset }),
    positioned(box({ transform: "rotate(90deg)" }, [tick()]), { top: inset, right: inset }),
    positioned(box({ transform: "rotate(180deg)" }, [tick()]), { bottom: inset, right: inset }),
    positioned(box({ transform: "rotate(270deg)" }, [tick()]), { bottom: inset, left: inset }),
  ]
}

function buildBigAccent(kind: BigAccentKind, colorHex: string, blockWidth: number, blockHeight: number, m: number, seed: string, scale: number) {
  if (kind === "ring") {
    const diameter = Math.round(Math.min(blockWidth, blockHeight) * 0.6 * scale)
    return [positioned(ringAccent(diameter, 3, colorHex, 0.18), { bottom: -Math.round(diameter * 0.34), left: -Math.round(diameter * 0.34) })]
  }
  if (kind === "ticks") {
    return cornerFrame(colorHex, Math.round(m * 0.65))
  }
  if (kind === "blob") {
    const blobSize = Math.round(Math.min(blockWidth, blockHeight) * 0.7 * scale)
    return [positioned(organicBlob(blobSize, blobSize, colorHex, seed, 0.13), { bottom: -Math.round(blobSize * 0.3), left: -Math.round(blobSize * 0.3) })]
  }
  return [positioned(dotGrid(Math.round(4 * scale), Math.round(4 * scale), 8, 14, colorHex, 0.3), { bottom: m, right: m })]
}

/** This template's 2 declared sticker safe zones (Wave 3 — see module header): the block's top-right and bottom-right corners, opposite the left-aligned text column. Returns `[]` with no theme, no resolved assets, or an active photo background. */
async function buildThemeStickers(ctx: TemplateBuildContext, hasPhoto: boolean): Promise<SatoriElement[]> {
  if (hasPhoto || !ctx.theme) return []
  const slots: Array<{ offsets: { top?: number; right?: number; bottom?: number }; sizePx: number }> = [
    { offsets: { top: -20, right: -16 }, sizePx: 100 },
    { offsets: { bottom: -18, right: -14 }, sizePx: 84 },
  ]
  const picks = ctx.theme.assets.slice(0, slots.length)
  const placed = await Promise.all(
    picks.map(async (asset, index) => {
      const slot = slots[index]
      const rotation = stickerRotationJitter(`${ctx.seed}:promo-sticker:${index}:${asset.name}`)
      // The block's own background IS roles.accent, so a vendored glyph must
      // tint to roles.textOnAccent (not roles.accent, which would make it
      // invisible against its own background) to actually show up.
      const tintHex = ctx.roles.textOnAccent
      const sticker = await stickerElement(asset.path, slot.sizePx, rotation, 0.96, tintHex)
      return sticker ? positioned(sticker, slot.offsets) : null
    })
  )
  return placed.filter((el): el is SatoriElement => el !== null)
}

/**
 * Field-dependent connector option pool, weighted toward "none". The offer
 * numeral IS this template's highlight/price field (scribble-circle/
 * starburst wrap it); dotted-flow-arc is deliberately never offered here —
 * promo-v1's block has no provably-large vertical gap the way
 * event-poster-v1's space-between layout does, and the semantic pairing
 * rule requires one.
 */
function connectorPool(): Array<ConnectorKey | "none"> {
  return ["none", "none", "none", "scribble-circle", "starburst", "scribble-underline", "curved-arrow"]
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

async function buildPromo(ctx: TemplateBuildContext): Promise<SatoriElement> {
  const { size, roles, fields, backgroundKind, fontFamily, seed } = ctx
  const hasPhoto = backgroundKind === "photo_ai"
  const hasTheme = Boolean(ctx.theme) && !hasPhoto
  const blockWidth = hasPhoto ? Math.round(size.width * SPLIT_BLOCK_FRACTION) : size.width
  const m = margin(blockWidth)
  const blockContentWidth = blockWidth - m * 2

  const headlineAlignment: HeadlineAlignment = pickAxis(seed, "headlineAlignment", HEADLINE_ALIGNMENTS)
  const composition = pickAxis(seed, "composition", COMPOSITIONS)
  const scalePlay = pickAxis(seed, "scalePlay", SCALE_PLAYS)
  const paletteRole = pickAxis(seed, "paletteRole", PALETTE_ROLES)
  const bigAccentKind = pickAxis(seed, "bigAccent", BIG_ACCENTS)
  const accentScale = COMPOSITION_ACCENT_SCALE[composition]
  const accentColor = paletteRole === "primary" ? roles.primary : roles.textOnAccent
  const isCentered = headlineAlignment === "center"

  const connectorChoice = hasTheme || hasPhoto ? "none" : pickAxis(seed, "connector", connectorPool())
  const useConnector = connectorChoice !== "none"

  const densityMode = computeDensityMode(optionalDensityFields(fields))
  const fillStrategy = densityMode === "rich" ? pickFillStrategy(seed) : null
  const applyFill = fillStrategy !== null && !hasTheme && !hasPhoto && !useConnector

  const offerWordCount = fields.offer.trim().split(/\s+/).filter(Boolean).length
  const baseOfferCeiling = hasPhoto ? 168 : 232
  const oversizedOfferCeiling = hasPhoto ? 190 : 264
  const offerCeiling =
    (scalePlay === "oversized" && offerWordCount <= 4) || (applyFill && fillStrategy === "oversized-hero")
      ? oversizedOfferCeiling
      : baseOfferCeiling

  const offerFit = autofitText({
    text: fields.offer,
    maxWidth: blockContentWidth * COMPOSITION_TEXT_WIDTH_FRACTION[composition],
    maxHeight: size.height * (hasPhoto ? 0.34 : 0.4),
    minFontSize: 64,
    maxFontSize: offerCeiling,
    lineHeight: 1,
    maxLines: 1,
  })

  const offerText = offerFit.lines[0] ?? fields.offer
  const offerTextWidth = measureTextWidth(offerText, offerFit.fontSize)
  const sweepWidth = Math.round(offerTextWidth * 1.14)
  const sweepHeight = Math.round(offerFit.fontSize * 1.3)

  const offerLineFit = autofitText({
    text: fields.offerLine,
    maxWidth: blockContentWidth * COMPOSITION_TEXT_WIDTH_FRACTION[composition],
    maxHeight: size.height * 0.16,
    minFontSize: 24,
    maxFontSize: hasPhoto ? 40 : 48,
    lineHeight: 1.2,
    maxLines: 3,
  })

  const offerLineRows = offerLineFit.lines.map((line, index) =>
    box(
      {
        flexDirection: "row",
        justifyContent: isCentered ? "center" : "flex-start",
        textAlign: isCentered ? "center" : "left",
        fontFamily,
        fontWeight: 700,
        fontSize: offerLineFit.fontSize,
        lineHeight: 1.2,
        color: roles.textOnAccent,
        opacity: 0.92,
        marginTop: index === 0 ? 0 : 2,
      },
      line
    )
  )

  // Branch discipline (see module header): themed -> stickers only;
  // connector -> no big accent; otherwise normal big accent.
  const showBigAccent = !hasPhoto && !hasTheme && !useConnector
  const decorationChildren = showBigAccent ? buildBigAccent(bigAccentKind, accentColor, blockWidth, size.height, m, seed, accentScale) : []

  const rawOfferNumberBlock = box({ flexDirection: "row", justifyContent: isCentered ? "center" : "flex-start", position: "relative" }, [
    positioned(highlightSweep(sweepWidth, sweepHeight, roles.primary, 0.22), {
      top: -Math.round((sweepHeight - offerFit.fontSize) / 2),
      left: -Math.round(sweepWidth * 0.05),
    }),
    box(
      {
        flexDirection: "row",
        fontFamily,
        fontWeight: 900,
        fontSize: offerFit.fontSize,
        lineHeight: 1,
        letterSpacing: "-0.02em",
        color: roles.textOnAccent,
      },
      offerText
    ),
  ])

  // The offer numeral is this template's "highlight/price" field — a
  // scribble-circle/starburst connector wraps it BEHIND, sized from its own
  // measured text box + 15% padding.
  const offerConnectorKind = useConnector && (connectorChoice === "scribble-circle" || connectorChoice === "starburst") ? connectorChoice : null
  const offerNumberBlock = offerConnectorKind
    ? box({ position: "relative", flexDirection: "row", justifyContent: isCentered ? "center" : "flex-start" }, [
        (() => {
          const wrapW = Math.round(offerTextWidth * 1.15)
          const wrapH = Math.round(offerFit.fontSize * 1.5)
          const offsetX = Math.round((wrapW - offerTextWidth) / 2)
          const offsetY = Math.round((wrapH - offerFit.fontSize) / 2)
          const connectorEl =
            offerConnectorKind === "scribble-circle"
              ? scribbleCircle(wrapW, wrapH, accentColor, seed, 7)
              : starburst(Math.max(wrapW, wrapH), accentColor, seed, 0.4)
          const horizontalOffset = isCentered ? {} : { left: -offsetX }
          return positioned(connectorEl, { top: -offsetY, ...horizontalOffset })
        })(),
        rawOfferNumberBlock,
      ])
    : rawOfferNumberBlock

  // Design-review fix: chip backdrop uses roles.primary (a genuinely
  // distinct hue from the block's own roles.accent background — a plain
  // accent-tinted glyph directly on an accent-colored block was the
  // near-invisible low-contrast bug), with the icon glyph itself tinted via
  // contrast.ts#pickTextColor(chipBg) for a guaranteed-AA pairing (there's
  // no dedicated "textOnPrimary" ColorRoles field, so this computes one).
  const chipBg = roles.primary
  const chipIconColor = pickTextColor(chipBg)
  const { icons: elementIcons, hasCelebrationElement } = await buildElementIcons(ctx, chipIconColor, hasTheme || hasPhoto)
  const confettiFlourish = hasCelebrationElement ? confettiScatter(40, 34, [roles.textOnAccent, roles.primary], seed, 7) : null

  const offerRow = box({ flexDirection: "row", alignItems: "center", justifyContent: isCentered ? "center" : "flex-start" }, [
    offerNumberBlock,
    confettiFlourish ? box({ marginLeft: 10 }, [confettiFlourish]) : null,
  ].filter((child): child is SatoriElement => Boolean(child)))

  const offerRowWrapped =
    headlineAlignment === "stacked-banner"
      ? box(
          {
            flexDirection: "row",
            alignSelf: isCentered ? "center" : "flex-start",
            // roles.primary (not accentColor, which may already equal
            // roles.textOnAccent — the text's own color) so the band always
            // reads as a distinct third tone against the block's roles.accent
            // background.
            backgroundColor: (() => {
              const { r, g, b } = hexToRgb(roles.primary)
              return `rgba(${r}, ${g}, ${b}, 0.22)`
            })(),
            borderRadius: 10,
            padding: "6px 10px",
          },
          [offerRow]
        )
      : offerRow

  const ctaUnderline =
    useConnector && connectorChoice === "scribble-underline"
      ? scribbleUnderline(measureTextWidth(offerLineFit.lines[0] ?? fields.offerLine, offerLineFit.fontSize), roles.textOnAccent, seed, 7)
      : null

  // Design-review fix: sized to fit entirely inside the block's own margin
  // gutter (`m`) with ZERO bleed, instead of the earlier negative-bleed
  // placement that cropped the arrowhead (every CURVED_ARROW_SHAPES variant
  // puts it near local x=0.85-0.92 of the box — bleeding the box off-canvas
  // reliably cropped exactly that part). See decorations.ts's connector
  // module header for the full reasoning.
  const curvedArrowEl = (() => {
    if (!useConnector || connectorChoice !== "curved-arrow") return null
    assertConnectorFitsReservedZone(m, m)
    return positioned(curvedArrow(m, Math.round(size.height * 0.3), accentColor, seed, 8, true), {
      top: Math.round(size.height * 0.3),
      right: 0,
    })
  })()

  // Design-review fix: a deliberate chip cluster (decorations.ts#elementChipRow),
  // never a bare floating icon row — placed in the bottom bar below,
  // flanking the fine print (a declared slot), not loose in the flow here.
  const elementCluster = elementIcons.length > 0 ? elementChipRow(elementIcons, chipBg, ELEMENT_CHIP_DIAMETER, 12) : null

  const resolvedFillElement = (() => {
    if (!applyFill) return null
    if (fillStrategy === "echo-text") {
      const scaledFontSize = Math.round(offerFit.fontSize * 1.5)
      return echoText(
        [offerText],
        fontFamily,
        scaledFontSize,
        roles.textOnAccent,
        { bottom: -Math.round(scaledFontSize * 0.28), left: -Math.round(blockWidth * 0.05) },
        0.07
      )
    }
    if (fillStrategy === "watermark-icon") {
      const wmSize = Math.round(blockWidth * 0.55)
      return positioned(box({ opacity: 0.1 }, [iconChip(resolveWatermarkIconKey(ctx), roles.textOnAccent, wmSize)]), {
        bottom: -Math.round(wmSize * 0.22),
        right: -Math.round(wmSize * 0.2),
      })
    }
    if (fillStrategy === "expanded-dots") {
      return positioned(dotGrid(6, 6, 10, 16, roles.textOnAccent, 0.22), { top: m, right: -Math.round(m * 0.3) })
    }
    return null
  })()

  const themeStickers = await buildThemeStickers(ctx, hasPhoto)

  // Design-review fix (vertical fill discipline): the block used to center
  // ALL content as one clustered group, leaving large unused bands above
  // and below on anything shorter than the tallest possible input — the
  // canvas must always read full. This distributes content across the
  // FULL block height instead: a top-weighted group (the offer numeral +
  // detail line — the hero), and a bottom bar ALWAYS present (fine print +
  // element cluster flanking each other when both exist; a quiet minimal
  // accent line when neither does, so the bottom edge still reads
  // intentional rather than merely truncated).
  const topGroup = box({ flexDirection: "column", alignItems: isCentered ? "center" : "flex-start" }, [
    offerRowWrapped,
    box({ flexDirection: "column", marginTop: 22 }, offerLineRows),
    ctaUnderline ? box({ marginTop: -4 }, [ctaUnderline]) : null,
  ])

  const finePrintEl = fields.finePrint
    ? box(
        {
          flexDirection: "row",
          fontFamily,
          fontWeight: 400,
          fontSize: 20,
          color: roles.textOnAccent,
          opacity: 0.72,
        },
        fields.finePrint
      )
    : null

  const bottomBarItems = [elementCluster, finePrintEl].filter((child): child is SatoriElement => Boolean(child))
  const bottomBar =
    bottomBarItems.length > 0
      ? box(
          {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: isCentered || bottomBarItems.length === 1 ? "center" : "space-between",
            width: blockContentWidth,
          },
          isCentered && bottomBarItems.length === 2 ? [bottomBarItems[0], box({ width: 16, height: 1 }), bottomBarItems[1]] : bottomBarItems
        )
      : // Sparsest case (no fine print, no elements): a quiet minimal accent
        // line still anchors the bottom edge, so the block's content always
        // touches both the top AND bottom of the canvas — never floats
        // clustered in the middle with dead space on both sides.
        box({ flexDirection: "row", justifyContent: isCentered ? "center" : "flex-start", width: blockContentWidth }, [
          box({ opacity: 0.4 }, [accentBar(48, 3, roles.textOnAccent, 2)]),
        ])

  // Design-review fix (round 2 — tall-format mid-band guarantee): a THIRD
  // in-flow sibling between topGroup and bottomBar, whenever the canvas is
  // actually tall. Round-2-of-round-2 correction: this was originally
  // gated on `!useConnector` on the assumption an active connector already
  // occupies the middle — false for promo-v1, where curved-arrow is a thin
  // stroke confined to the margin gutter (a few dozen px wide) and never
  // fills the wide central band. So this fires regardless of connector
  // state; `justify-content: space-between` above centers it in whatever
  // gap remains — no fixed offset.
  const midBandKind = isTallFormat(size) && !hasPhoto ? pickAxis(seed, "midBandFiller", MID_BAND_FILLER_KINDS) : null
  // Wrapped with an explicit width — the block's own `alignItems` (center or
  // flex-start, never "stretch") would otherwise shrink-wrap this child to
  // its own content, leaving midBandFiller's internal flex-end/flex-start
  // margin-offset with no extra room to actually alternate sides.
  const midBandEl = midBandKind ? box({ width: blockContentWidth }, [midBandFiller(midBandKind, resolveWatermarkIconKey(ctx), roles.textOnAccent, seed)]) : null

  const block = box(
    {
      flexDirection: "column",
      justifyContent: "space-between",
      alignItems: isCentered ? "center" : "flex-start",
      position: "relative",
      width: blockWidth,
      height: size.height,
      padding: m,
      overflow: "hidden",
      ...(backgroundKind === "gradient"
        ? { backgroundImage: `linear-gradient(135deg, ${roles.accent} 0%, ${roles.primary} 100%)` }
        : { backgroundColor: roles.accent }),
    },
    [...decorationChildren, ...themeStickers, resolvedFillElement, curvedArrowEl, topGroup, midBandEl, bottomBar].filter(Boolean)
  )

  // The photo panel is left fully transparent in this (type) layer — render.ts
  // composites the actual photo + this template's photoLayer() region
  // underneath, then this PNG on top.
  const photoPanel = hasPhoto ? box({ flexDirection: "column", width: size.width - blockWidth, height: size.height }) : null

  return el("div", {
    style: {
      display: "flex",
      flexDirection: "row",
      width: size.width,
      height: size.height,
      fontFamily,
      ...(backgroundKind === "gradient"
        ? { backgroundImage: `linear-gradient(180deg, ${roles.backgroundStart} 0%, ${roles.backgroundEnd} 100%)` }
        : backgroundKind === "solid"
          ? {} // the block itself is already opaque and full-bleed in the solid case, so no separate root fill is needed.
          : {}),
    },
    children: [block, photoPanel].filter(Boolean),
  })
}

export const PROMO_V1: TemplateDef = {
  id: "promo-v1",
  name: "Promo card",
  description:
    "A punchy single-offer promo card — big offer numeral + detail line on a solid brand-accent block, with room for an optional AI photo alongside it.",
  defaultSize: SIZE,
  supportedSizes: SUPPORTED_SIZES,
  densityFields: optionalDensityFields,
  allowedBackgrounds: ["solid", "gradient", "photo_ai"],
  fields: FIELDS,
  build: buildPromo,
  photoLayer: (size) => ({
    region: {
      x: Math.round(size.width * SPLIT_BLOCK_FRACTION),
      y: 0,
      width: size.width - Math.round(size.width * SPLIT_BLOCK_FRACTION),
      height: size.height,
    },
  }),
}
