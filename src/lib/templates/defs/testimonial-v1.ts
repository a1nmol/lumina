// testimonial-v1 — a customer-review card (1080x1080, square). A fixed row
// of 5 star iconChips up top, an autofit quote (same auto-fit discipline as
// quote-v1), then attribution + an optional role/context line. Restrained
// by design (per the brief) — no watermark, no bleed accent; the only
// per-render variety is which resolved role colors the stars and whether a
// short accentBar sits under the attribution. Background: calm solid/
// gradient only — never a photo, for the same long-form-text-legibility
// reason as quote-v1.

import { autofitText } from "../autofit"
import { accentBar, iconChip } from "../decorations"
import { box, el, img, type TemplateBuildContext, type TemplateDef, type TemplateFieldSchema } from "../types"
import { pickVariant } from "../variants"

const SIZE = { width: 1080, height: 1080 }
const SAFE_MARGIN_RATIO = 0.08
const LOGO_SIZE = 64

const FIELDS: TemplateFieldSchema[] = [
  { key: "quote", label: "Quote", required: true, maxChars: 220, minChars: 20 },
  { key: "attribution", label: "Attribution", required: true, maxChars: 40, helpText: "e.g. Maria R." },
  { key: "context", label: "Context", required: false, maxChars: 40, helpText: "e.g. Verified customer, regular since 2019" },
]

interface Variant {
  useUnderRole: boolean
  showAccentBar: boolean
}

const VARIANTS: Variant[] = [
  { useUnderRole: false, showAccentBar: false },
  { useUnderRole: true, showAccentBar: true },
  { useUnderRole: false, showAccentBar: true },
]

function margin(width: number): number {
  return Math.round(width * SAFE_MARGIN_RATIO)
}

function buildTestimonial(ctx: TemplateBuildContext) {
  const { size, roles, fields, logoDataUri, backgroundKind, fontFamily, seed } = ctx
  const m = margin(size.width)
  const contentWidth = size.width - m * 2

  const variant = VARIANTS[pickVariant(seed, VARIANTS.length)]
  const starColor = variant.useUnderRole ? roles.primary : roles.accent

  const starsRow = box(
    { flexDirection: "row", justifyContent: "center" },
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
        justifyContent: "center",
        textAlign: "center",
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
    children: [
      starsRow,
      box({ flexDirection: "column", alignItems: "center", overflow: "hidden", marginTop: 30 }, quoteLines),
      variant.showAccentBar ? box({ marginTop: 26 }, [accentBar(56, 4, roles.accent, 3)]) : null,
      box(
        {
          flexDirection: "row",
          justifyContent: "center",
          marginTop: variant.showAccentBar ? 22 : 32,
          fontFamily,
          fontWeight: 700,
          fontSize: 26,
          color: roles.accent,
          letterSpacing: "0.01em",
        },
        fields.attribution
      ),
      fields.context
        ? box(
            {
              flexDirection: "row",
              justifyContent: "center",
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
        ? box({ flexDirection: "row", justifyContent: "center", marginTop: 24 }, [
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
