// quote-v1 — a centered quote card (1080x1080, square). THE auto-fit stress
// case: quoteText can be anywhere from ~20 to ~240 characters and must
// always read well, so this template leans entirely on autofit.ts (no fixed
// font size) plus an ellipsis-truncation safety net for pathological input.
// Background is muted solid or a subtle two-tone gradient ONLY — never a
// photo (a busy photo behind long-form quote text is never legible).

import { autofitText } from "../autofit"
import { box, el, img, type TemplateBuildContext, type TemplateDef, type TemplateFieldSchema } from "../types"

const SIZE = { width: 1080, height: 1080 }
const SAFE_MARGIN_RATIO = 0.055
const GLYPH_ZONE_HEIGHT = 170
const LOGO_SIZE = 72

const FIELDS: TemplateFieldSchema[] = [
  { key: "quote", label: "Quote", required: true, maxChars: 240, minChars: 20 },
  { key: "attribution", label: "Attribution", required: false, maxChars: 40, helpText: "e.g. — Maria, owner" },
]

function margin(width: number): number {
  return Math.round(width * SAFE_MARGIN_RATIO)
}

function buildQuote(ctx: TemplateBuildContext) {
  const { size, roles, fields, logoDataUri, backgroundKind, fontFamily } = ctx
  const m = margin(size.width)
  const contentWidth = size.width - m * 2

  const attributionZoneHeight = fields.attribution ? 64 : 0
  const logoZoneHeight = logoDataUri ? LOGO_SIZE + 28 : 0
  const gapsHeight = 28 + (fields.attribution ? 20 : 0) + (logoDataUri ? 20 : 0)
  const quoteMaxHeight = size.height - m * 2 - GLYPH_ZONE_HEIGHT - attributionZoneHeight - logoZoneHeight - gapsHeight

  const quoteFit = autofitText({
    text: fields.quote,
    maxWidth: contentWidth * 0.92,
    maxHeight: Math.max(quoteMaxHeight, 120),
    minFontSize: 30,
    maxFontSize: 96,
    lineHeight: 1.28,
  })

  const quoteLines = quoteFit.lines.map((line, index) =>
    box(
      {
        flexDirection: "row",
        justifyContent: "center",
        textAlign: "center",
        fontFamily,
        fontWeight: 700,
        fontSize: quoteFit.fontSize,
        lineHeight: 1.28,
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

  const children = [
    box(
      {
        flexDirection: "row",
        justifyContent: "center",
        height: GLYPH_ZONE_HEIGHT,
        fontFamily,
        fontWeight: 900,
        fontSize: 168,
        lineHeight: 1,
        color: roles.accent,
        opacity: 0.42,
      },
      "“"
    ),
    box({ flexDirection: "column", alignItems: "center", overflow: "hidden" }, quoteLines),
    fields.attribution
      ? box(
          {
            flexDirection: "row",
            justifyContent: "center",
            marginTop: 28,
            fontFamily,
            fontWeight: 700,
            fontSize: 26,
            letterSpacing: "0.02em",
            color: roles.accent,
          },
          fields.attribution
        )
      : null,
    logoDataUri
      ? box({ flexDirection: "row", justifyContent: "center", marginTop: 24 }, [
          img(logoDataUri, { width: LOGO_SIZE, height: LOGO_SIZE, objectFit: "contain", borderRadius: 8 }),
        ])
      : null,
  ]

  return el("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      width: size.width,
      height: size.height,
      padding: m,
      fontFamily,
      ...rootBackgroundStyle,
    },
    children,
  })
}

export const QUOTE_V1: TemplateDef = {
  id: "quote-v1",
  name: "Quote card",
  description:
    "A centered quote card for testimonials, mottos, or a short brand statement — muted solid/gradient background only, never a photo.",
  defaultSize: SIZE,
  allowedBackgrounds: ["solid", "gradient"],
  fields: FIELDS,
  build: buildQuote,
}
