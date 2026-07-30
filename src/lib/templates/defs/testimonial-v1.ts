// testimonial-v1 — a customer-review card (1080x1080, square). A fixed row
// of 5 star iconChips up top, an autofit quote (same auto-fit discipline as
// quote-v1), then attribution + an optional role/context line. Restrained
// by design — no watermark, no bleed accent. Background: calm solid/
// gradient only — never a photo, for the same long-form-text-legibility
// reason as quote-v1.
//
// Wave 4 variety axes (alignment + accent + connector only, per the brief):
//   alignment: center (unchanged) or left.
//   accentBar (the existing show/hide toggle, now a named pickAxis-driven
//     axis) x paletteRole (which resolved role colors the stars/bar) — two
//     independent axes instead of one combined 3-option VARIANTS array, so
//     they vary independently.
//   connector: none (weighted) / scribble-underline under the attribution
//     line (always present, required) / tape-strip pinned at the top —
//     a review card "pinned up" is a natural, restrained motif fit.
//
// Design-review fix (Bug 2 — "sparse+theme reads flat"): this template
// previously had NO theme sticker placement at all (it only gated its own
// connector pool on `ctx.theme`) — a themed render here showed zero visual
// acknowledgment of the theme beyond the global palette blend. Now places 2
// small corner stickers, same discipline as quote-v1.

import { autofitText, fitSingleLine, measureTextWidth } from "../autofit"
import {
  accentBar,
  iconChip,
  positioned,
  scribbleUnderline,
  stickerElement,
  stickerRotationJitter,
  tapeStrip,
  textLine,
  type ConnectorKey,
} from "../decorations"
import { box, el, img, type SatoriElement, type TemplateBuildContext, type TemplateDef, type TemplateFieldSchema } from "../types"
import { pickAxis } from "../variants"

const SIZE = { width: 1080, height: 1080 }
const SAFE_MARGIN_RATIO = 0.08
const LOGO_SIZE = 64

const FIELDS: TemplateFieldSchema[] = [
  { key: "quote", label: "Quote", required: true, maxChars: 220, minChars: 20 },
  { key: "attribution", label: "Attribution", required: true, maxChars: 40, helpText: "e.g. Maria R." },
  { key: "context", label: "Context", required: false, maxChars: 40, helpText: "e.g. Verified customer, regular since 2019" },
]

const ALIGNMENTS = ["center", "left"] as const
type Alignment = (typeof ALIGNMENTS)[number]
const PALETTE_ROLES = ["accent", "primary"] as const
const ACCENT_BAR_OPTIONS = ["show", "hide"] as const

function margin(width: number): number {
  return Math.round(width * SAFE_MARGIN_RATIO)
}

function connectorPool(): Array<ConnectorKey | "none"> {
  return ["none", "none", "none", "scribble-underline", "tape-strip"]
}

/** This template's 2 declared sticker safe zones (design-review fix — Bug 2) — small corner peeks top-left and bottom-right, mirroring quote-v1's own pattern (safe regardless of quote length since content is vertically centered). Returns `[]` with no theme or no resolved assets. */
async function buildThemeStickers(ctx: TemplateBuildContext): Promise<SatoriElement[]> {
  if (!ctx.theme) return []
  const slots: Array<{ offsets: { top?: number; left?: number; right?: number; bottom?: number }; sizePx: number }> = [
    { offsets: { top: -18, left: -18 }, sizePx: 84 },
    { offsets: { bottom: -18, right: -18 }, sizePx: 84 },
  ]
  const picks = ctx.theme.assets.slice(0, slots.length)
  const placed = await Promise.all(
    picks.map(async (asset, index) => {
      const slot = slots[index]
      const rotation = stickerRotationJitter(`${ctx.seed}:testimonial-sticker:${index}:${asset.name}`)
      const tintHex = ctx.roles.accent
      const sticker = await stickerElement(asset.path, slot.sizePx, rotation, 0.95, tintHex)
      return sticker ? positioned(sticker, slot.offsets) : null
    })
  )
  return placed.filter((el): el is SatoriElement => el !== null)
}

async function buildTestimonial(ctx: TemplateBuildContext): Promise<SatoriElement> {
  const { size, roles, fields, logoDataUri, backgroundKind, fontFamily, seed } = ctx
  const m = margin(size.width)
  const contentWidth = size.width - m * 2

  const alignment: Alignment = pickAxis(seed, "alignment", ALIGNMENTS)
  const paletteRole = pickAxis(seed, "paletteRole", PALETTE_ROLES)
  const showAccentBar = pickAxis(seed, "accentBar", ACCENT_BAR_OPTIONS) === "show"
  const starColor = paletteRole === "primary" ? roles.primary : roles.accent
  const isCentered = alignment === "center"

  const connectorChoice = ctx.theme ? "none" : pickAxis(seed, "connector", connectorPool())
  const useConnector = connectorChoice !== "none"

  const starsRow = box(
    { flexDirection: "row", justifyContent: isCentered ? "center" : "flex-start" },
    Array.from({ length: 5 }, (_, index) => box({ marginLeft: index === 0 ? 0 : 6 }, [iconChip("star", starColor, 28)]))
  )

  const contextZoneHeight = fields.context ? 46 : 0
  const attributionZoneHeight = 44
  const logoZoneHeight = logoDataUri ? LOGO_SIZE + 24 : 0
  const starsZoneHeight = 28 + 30
  const gaps = 32 + 12 + (fields.context ? 8 : 0) + (logoDataUri ? 24 : 0)
  const quoteMaxHeight =
    size.height - m * 2 - starsZoneHeight - attributionZoneHeight - contextZoneHeight - logoZoneHeight - gaps

  const quoteFit = autofitText({
    text: fields.quote,
    maxWidth: contentWidth * 0.9,
    maxHeight: Math.max(quoteMaxHeight, 120),
    minFontSize: 28,
    maxFontSize: 88,
    lineHeight: 1.3,
  })

  const quoteLines = quoteFit.lines.map((line, index) =>
    box(
      {
        flexDirection: "row",
        justifyContent: isCentered ? "center" : "flex-start",
        textAlign: isCentered ? "center" : "left",
        fontFamily,
        fontWeight: 700,
        fontSize: quoteFit.fontSize,
        lineHeight: 1.3,
        color: roles.textOnDark,
        marginTop: index === 0 ? 0 : 2,
      },
      line
    )
  )

  const rootBackgroundStyle =
    backgroundKind === "gradient"
      ? { backgroundImage: `linear-gradient(135deg, ${roles.backgroundStart} 0%, ${roles.backgroundEnd} 100%)` }
      : { backgroundColor: roles.backgroundStart }

  // Reuses textLine's own fit math (same fontSize/minFontSize/letterSpacing
  // inputs) so the underline width matches whatever the attribution row
  // actually rendered at, even in the rare case it had to shrink.
  const attributionFit = fitSingleLine({
    text: fields.attribution,
    maxWidthPx: contentWidth,
    minFontSize: 13,
    maxFontSize: 26,
    letterSpacingEm: 0.01,
  })
  const attributionUnderline =
    useConnector && connectorChoice === "scribble-underline"
      ? scribbleUnderline(measureTextWidth(attributionFit.text, attributionFit.fontSize), roles.accent, seed, 7)
      : null

  const tapeStripEl =
    useConnector && connectorChoice === "tape-strip" ? positioned(tapeStrip(120, 44, roles.accent, seed, 0.8), { top: -14, left: Math.round(size.width * 0.5 - 60) }) : null

  const themeStickers = await buildThemeStickers(ctx)

  return el("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: isCentered ? "center" : "flex-start",
      position: "relative",
      width: size.width,
      height: size.height,
      padding: m,
      fontFamily,
      overflow: "hidden",
      ...rootBackgroundStyle,
    },
    children: [
      tapeStripEl,
      ...themeStickers,
      starsRow,
      box({ flexDirection: "column", alignItems: isCentered ? "center" : "flex-start", overflow: "hidden", marginTop: 30 }, quoteLines),
      showAccentBar ? box({ marginTop: 26 }, [accentBar(56, 4, roles.accent, 3)]) : null,
      box({ flexDirection: "column", alignItems: isCentered ? "center" : "flex-start", marginTop: showAccentBar ? 22 : 32 }, [
        textLine({
          text: fields.attribution,
          maxWidthPx: contentWidth,
          fontFamily,
          fontWeight: 700,
          fontSize: 26,
          colorHex: roles.accent,
          letterSpacing: "0.01em",
        }),
        attributionUnderline ? box({ marginTop: -4 }, [attributionUnderline]) : null,
      ]),
      fields.context
        ? textLine({
            text: fields.context,
            maxWidthPx: contentWidth,
            fontFamily,
            fontWeight: 400,
            fontSize: 22,
            colorHex: roles.textOnDark,
            opacity: 0.66,
            style: { justifyContent: isCentered ? "center" : "flex-start", marginTop: 6 },
          })
        : null,
      logoDataUri
        ? box({ flexDirection: "row", justifyContent: isCentered ? "center" : "flex-start", marginTop: 24 }, [
            img(logoDataUri, { width: LOGO_SIZE, height: LOGO_SIZE, objectFit: "contain", borderRadius: 8 }),
          ])
        : null,
    ].filter(Boolean),
  })
}

export const TESTIMONIAL_V1: TemplateDef = {
  id: "testimonial-v1",
  name: "Testimonial card",
  description:
    "A customer-review card — 5-star row, autofit quote, attribution + optional context (e.g. 'Verified customer'). Restrained, no photo. Use for real customer reviews/testimonials, distinct from quote-v1's brand mottos.",
  defaultSize: SIZE,
  allowedBackgrounds: ["solid", "gradient"],
  fields: FIELDS,
  build: buildTestimonial,
}
