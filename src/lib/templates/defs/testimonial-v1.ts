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

import { autofitText, measureTextWidth } from "../autofit"
import { accentBar, iconChip, positioned, scribbleUnderline, tapeStrip, type ConnectorKey } from "../decorations"
import { box, el, img, type TemplateBuildContext, type TemplateDef, type TemplateFieldSchema } from "../types"
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

function buildTestimonial(ctx: TemplateBuildContext) {
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

  const attributionUnderline =
    useConnector && connectorChoice === "scribble-underline"
      ? scribbleUnderline(measureTextWidth(fields.attribution, 26), roles.accent, seed, 7)
      : null

  const tapeStripEl =
    useConnector && connectorChoice === "tape-strip" ? positioned(tapeStrip(120, 44, roles.accent, seed, 0.8), { top: -14, left: Math.round(size.width * 0.5 - 60) }) : null

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
      starsRow,
      box({ flexDirection: "column", alignItems: isCentered ? "center" : "flex-start", overflow: "hidden", marginTop: 30 }, quoteLines),
      showAccentBar ? box({ marginTop: 26 }, [accentBar(56, 4, roles.accent, 3)]) : null,
      box({ flexDirection: "column", alignItems: isCentered ? "center" : "flex-start", marginTop: showAccentBar ? 22 : 32 }, [
        box(
          { flexDirection: "row", fontFamily, fontWeight: 700, fontSize: 26, color: roles.accent, letterSpacing: "0.01em" },
          fields.attribution
        ),
        attributionUnderline ? box({ marginTop: -4 }, [attributionUnderline]) : null,
      ]),
      fields.context
        ? box(
            {
              flexDirection: "row",
              justifyContent: isCentered ? "center" : "flex-start",
              marginTop: 6,
              fontFamily,
              fontWeight: 400,
              fontSize: 22,
              color: roles.textOnDark,
              opacity: 0.66,
            },
            fields.context
          )
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
