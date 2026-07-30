// event-poster-v1 — the flagship "announce a thing" poster (default
// 1080x1350, portrait). Hierarchy: eyebrow -> huge headline -> optional
// highlight badge -> optional subhead -> footer bar (date + location) -> CTA
// line -> logo. Background: brand-derived dark solid/gradient, or an
// optional AI photo behind a bottom scrim so the footer/CTA stay legible.

import { autofitText } from "../autofit"
import { box, el, img, type TemplateBuildContext, type TemplateDef, type TemplateFieldSchema } from "../types"

const SIZE = { width: 1080, height: 1350 }
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

function buildEventPoster(ctx: TemplateBuildContext) {
  const { size, roles, fields, logoDataUri, backgroundKind, fontFamily } = ctx
  const m = margin(size.width)
  const contentWidth = size.width - m * 2

  const headlineFit = autofitText({
    text: fields.headline,
    maxWidth: contentWidth * 0.96,
    maxHeight: size.height * 0.34,
    minFontSize: 60,
    maxFontSize: 152,
    lineHeight: 1.03,
    maxLines: 3,
  })

  const headlineLines = headlineFit.lines.map((line, index) =>
    box(
      {
        flexDirection: "row",
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

  const topChildren = [
    fields.eyebrow
      ? box(
          {
            flexDirection: "row",
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
    box({ flexDirection: "column" }, headlineLines),
    fields.highlight
      ? box(
          {
            flexDirection: "row",
            alignSelf: "flex-start",
            marginTop: 26,
            padding: "16px 30px",
            borderRadius: 999,
            backgroundColor: roles.accent,
            color: roles.textOnAccent,
            fontFamily,
            fontWeight: 700,
            fontSize: 28,
            letterSpacing: "0.02em",
          },
          fields.highlight
        )
      : null,
    fields.subhead
      ? box(
          {
            flexDirection: "row",
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

  const bottomChildren = [
    box({ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }, [
      box({ flexDirection: "column" }, [
        box(
          { flexDirection: "row", fontFamily, fontWeight: 700, fontSize: 32, color: roles.textOnDark },
          fields.dateLine
        ),
        fields.locationLine
          ? box(
              {
                flexDirection: "row",
                marginTop: 6,
                fontFamily,
                fontWeight: 400,
                fontSize: 26,
                color: roles.textOnDark,
                opacity: 0.72,
              },
              fields.locationLine
            )
          : null,
      ]),
    ]),
    box(
      { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 28 },
      [
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
        logoDataUri ? img(logoDataUri, { width: 88, height: 88, objectFit: "contain", borderRadius: 12 }) : null,
      ]
    ),
  ]

  const rootBackgroundStyle =
    backgroundKind === "solid"
      ? { backgroundColor: roles.backgroundStart }
      : backgroundKind === "gradient"
        ? { backgroundImage: `linear-gradient(180deg, ${roles.backgroundStart} 0%, ${roles.backgroundEnd} 100%)` }
        : {} // photo_ai: leave transparent — render.ts composites the photo + scrim underneath, this layer is type/logo only.

  return el("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      width: size.width,
      height: size.height,
      padding: m,
      fontFamily,
      ...rootBackgroundStyle,
    },
    children: [box({ flexDirection: "column" }, topChildren), box({ flexDirection: "column" }, bottomChildren)],
  })
}

export const EVENT_POSTER_V1: TemplateDef = {
  id: "event-poster-v1",
  name: "Event poster",
  description:
    "A bold, full-bleed poster for announcing an event, sale, or workshop — huge headline, optional highlight badge, date/location footer, and a CTA line.",
  defaultSize: SIZE,
  allowedBackgrounds: ["solid", "gradient", "photo_ai"],
  fields: FIELDS,
  build: buildEventPoster,
  photoLayer: (size) => ({
    region: { x: 0, y: 0, width: size.width, height: size.height },
    scrim: { heightFraction: 0.62, colorHex: "#05050A", maxOpacityPercent: 88 },
  }),
}
