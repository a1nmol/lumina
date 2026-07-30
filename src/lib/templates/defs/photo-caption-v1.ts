// photo-caption-v1 — a full-bleed photo poster with a single caption line
// (1080x1350, portrait). The smallest text surface of the whole catalog on
// purpose: this template is for letting a great photo do the work, with
// just enough type to caption it. A bottom scrim keeps the caption legible
// over the photo; when no photo is supplied, the whole canvas falls back to
// a brand-toned diagonal gradient (never a flat single color — a bare block
// with one line of text reads unfinished).
//
// Decoration: intentionally almost none — a thin accentBar above the
// caption is the only accent, and it's a coin-flip per seed whether it even
// shows, exactly per the "restraint" half of the design method. The logo
// (when present) sits opposite the caption so it never has to fight it.

import { autofitText } from "../autofit"
import { accentBar } from "../decorations"
import { box, el, img, type PhotoLayerSpec, type TemplateBuildContext, type TemplateDef, type TemplateFieldSchema, type TemplateSize } from "../types"
import { pickVariant } from "../variants"

const SIZE = { width: 1080, height: 1350 }
const SAFE_MARGIN_RATIO = 0.06
const SCRIM_HEIGHT_FRACTION = 0.32

const FIELDS: TemplateFieldSchema[] = [
  { key: "caption", label: "Caption", required: true, maxChars: 90, helpText: "One short line — this template keeps text minimal by design" },
]

const VARIANTS = [{ showAccentBar: true, logoCorner: "top-left" as const }, { showAccentBar: false, logoCorner: "top-right" as const }]

function margin(width: number): number {
  return Math.round(width * SAFE_MARGIN_RATIO)
}

function buildPhotoCaption(ctx: TemplateBuildContext) {
  const { size, roles, fields, logoDataUri, backgroundKind, fontFamily, seed } = ctx
  const m = margin(size.width)
  const contentWidth = size.width - m * 2
  const hasPhoto = backgroundKind === "photo_ai"

  const variant = VARIANTS[pickVariant(seed, VARIANTS.length)]

  const captionFit = autofitText({
    text: fields.caption,
    maxWidth: contentWidth,
    maxHeight: 130,
    minFontSize: 28,
    maxFontSize: 46,
    lineHeight: 1.25,
    maxLines: 2,
  })

  const captionLines = captionFit.lines.map((line, index) =>
    box(
      {
        flexDirection: "row",
        fontFamily,
        fontWeight: 700,
        fontSize: captionFit.fontSize,
        lineHeight: 1.25,
        color: roles.textOnDark,
        marginTop: index === 0 ? 0 : 2,
      },
      line
    )
  )

  // No flat single-color fallback here — a bare block behind one caption
  // line reads unfinished, so solid and gradient requests both render the
  // same brand-toned diagonal gradient. See module header.
  const rootBackgroundStyle = hasPhoto
    ? {} // photo_ai: leave transparent — render.ts composites the photo + scrim underneath.
    : { backgroundImage: `linear-gradient(150deg, ${roles.backgroundStart} 0%, ${roles.backgroundEnd} 100%)` }

  return el("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      justifyContent: "flex-end",
      position: "relative",
      width: size.width,
      height: size.height,
      padding: m,
      fontFamily,
      ...rootBackgroundStyle,
    },
    children: [
      logoDataUri
        ? box({
            position: "absolute",
            top: m,
            ...(variant.logoCorner === "top-left" ? { left: m } : { right: m }),
          }, [img(logoDataUri, { width: 60, height: 60, objectFit: "contain", borderRadius: 10 })])
        : null,
      box({ flexDirection: "column" }, [
        variant.showAccentBar ? box({ marginBottom: 18 }, [accentBar(64, 4, roles.accent, 3)]) : null,
        box({ flexDirection: "column" }, captionLines),
      ]),
    ].filter(Boolean),
  })
}

export const PHOTO_CAPTION_V1: TemplateDef = {
  id: "photo-caption-v1",
  name: "Photo caption",
  description:
    "A full-bleed photo poster with a single short caption line over a bottom scrim — the smallest text surface in the catalog, for when a great photo should carry the post. Falls back to a brand gradient with no photo.",
  defaultSize: SIZE,
  allowedBackgrounds: ["solid", "gradient", "photo_ai"],
  fields: FIELDS,
  build: buildPhotoCaption,
  photoLayer: (size: TemplateSize): PhotoLayerSpec => ({
    region: { x: 0, y: 0, width: size.width, height: size.height },
    scrim: { heightFraction: SCRIM_HEIGHT_FRACTION, colorHex: "#05050A", maxOpacityPercent: 85 },
  }),
}
