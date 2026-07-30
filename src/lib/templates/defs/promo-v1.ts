// promo-v1 — a punchy, single-offer promo card (1080x1080, square). A solid
// brand-accent block carries the offer numeral + line (and optional fine
// print); when an AI photo background is used, the block shrinks to ~45% of
// the canvas (left) and the photo fills the rest (right, no scrim — the
// solid block already carries all the text). With no photo, the block goes
// full-bleed and the type grows to fill it.

import { autofitText } from "../autofit"
import { box, el, type TemplateBuildContext, type TemplateDef, type TemplateFieldSchema } from "../types"

const SIZE = { width: 1080, height: 1080 }
const SAFE_MARGIN_RATIO = 0.055
/** Fraction of the canvas the solid text block occupies when a photo shares the frame. */
const SPLIT_BLOCK_FRACTION = 0.45

const FIELDS: TemplateFieldSchema[] = [
  { key: "offer", label: "Offer", required: true, maxChars: 14, helpText: "e.g. 30% OFF, $10 OFF, BOGO" },
  { key: "offerLine", label: "Offer detail", required: true, maxChars: 60, helpText: "e.g. All lattes, this weekend only" },
  { key: "finePrint", label: "Fine print", required: false, maxChars: 80 },
]

function margin(width: number): number {
  return Math.round(width * SAFE_MARGIN_RATIO)
}

function buildPromo(ctx: TemplateBuildContext) {
  const { size, roles, fields, backgroundKind, fontFamily } = ctx
  const hasPhoto = backgroundKind === "photo_ai"
  const blockWidth = hasPhoto ? Math.round(size.width * SPLIT_BLOCK_FRACTION) : size.width
  const m = margin(blockWidth)
  const blockContentWidth = blockWidth - m * 2

  const offerFit = autofitText({
    text: fields.offer,
    maxWidth: blockContentWidth,
    maxHeight: size.height * (hasPhoto ? 0.34 : 0.4),
    minFontSize: 64,
    maxFontSize: hasPhoto ? 168 : 232,
    lineHeight: 1,
    maxLines: 1,
  })

  const offerLineFit = autofitText({
    text: fields.offerLine,
    maxWidth: blockContentWidth,
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

  const block = box(
    {
      flexDirection: "column",
      justifyContent: "center",
      width: blockWidth,
      height: size.height,
      padding: m,
      backgroundColor: roles.accent,
    },
    [
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
        offerFit.lines[0] ?? fields.offer
      ),
      box({ flexDirection: "column", marginTop: 22 }, offerLineRows),
      fields.finePrint
        ? box(
            {
              flexDirection: "row",
              marginTop: 34,
              fontFamily,
              fontWeight: 400,
              fontSize: 20,
              color: roles.textOnAccent,
              opacity: 0.72,
            },
            fields.finePrint
          )
        : null,
    ]
  )

  // The photo panel is left fully transparent in this (type) layer — render.ts
  // composites the actual photo + this template's photoLayer() region
  // underneath, then this PNG on top.
  const photoPanel = hasPhoto
    ? box({ flexDirection: "column", width: size.width - blockWidth, height: size.height })
    : null

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
