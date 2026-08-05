// photo-caption-v1 — a full-bleed photo poster with a single caption line
// (1080x1350, portrait). The smallest text surface of the whole catalog on
// purpose: this template is for letting a great photo do the work, with
// just enough type to caption it. A bottom scrim keeps the caption legible
// over the photo; when no photo is supplied, the whole canvas falls back to
// a brand-toned diagonal gradient (never a flat single color — a bare block
// with one line of text reads unfinished).
//
// Wave 4 variety axes (alignment + accent + connector only, per the brief —
// this template has exactly one field, so there's no room for
// composition/scalePlay/density to mean anything):
//   alignment: left (unchanged) or center — the caption line's own
//     alignment; the logo corner still independently alternates per seed.
//   accentBar: the existing show/hide coin-flip, now a named axis.
//   connector: none (weighted, restraint is the whole point of this
//     template) / scribble-underline under the caption.
//
// Design-review fix (Bug 2 — "sparse+theme reads flat"): this template
// previously had NO theme sticker placement at all. Adds up to 2 small
// stickers at the TOP corners (never colliding with the bottom-anchored
// caption block) — using only the corner opposite the logo when one is
// present, both corners otherwise.

import { autofitText, measureTextWidth } from "../autofit"
import { accentBar, positioned, scribbleUnderline, stickerElement, stickerRotationJitter, type ConnectorKey } from "../decorations"
import { box, el, img, type PhotoLayerSpec, type SatoriElement, type TemplateBuildContext, type TemplateDef, type TemplateFieldSchema, type TemplateSize } from "../types"
import { pickAxis } from "../variants"

const SIZE = { width: 1080, height: 1350 }
const SAFE_MARGIN_RATIO = 0.06
const SCRIM_HEIGHT_FRACTION = 0.32

const FIELDS: TemplateFieldSchema[] = [
  { key: "caption", label: "Caption", required: true, maxChars: 90, helpText: "One short line — this template keeps text minimal by design" },
]

const ALIGNMENTS = ["left", "center"] as const
type Alignment = (typeof ALIGNMENTS)[number]
const ACCENT_BAR_OPTIONS = ["show", "hide"] as const
const LOGO_CORNERS = ["top-left", "top-right"] as const

function margin(width: number): number {
  return Math.round(width * SAFE_MARGIN_RATIO)
}

function connectorPool(): Array<ConnectorKey | "none"> {
  return ["none", "none", "none", "none", "scribble-underline"]
}

/** Sticker safe zones — TOP corners only, well clear of the bottom-anchored caption block. Uses only the corner opposite `logoCorner` when a logo is present (1 sticker), both top corners otherwise (2). Skips entirely with an active photo (never sticker over a photo, same restraint rule every other template follows) or no theme. */
async function buildThemeStickers(
  ctx: TemplateBuildContext,
  logoCorner: (typeof LOGO_CORNERS)[number],
  hasLogo: boolean,
  hasPhoto: boolean
): Promise<SatoriElement[]> {
  if (hasPhoto || !ctx.theme) return []
  const topLeft = { offsets: { top: -18, left: -18 }, sizePx: 84 }
  const topRight = { offsets: { top: -18, right: -18 }, sizePx: 84 }
  const slots = hasLogo ? [logoCorner === "top-left" ? topRight : topLeft] : [topLeft, topRight]
  const picks = ctx.theme.assets.slice(0, slots.length)
  const placed = await Promise.all(
    picks.map(async (asset, index) => {
      const slot = slots[index]
      const rotation = stickerRotationJitter(`${ctx.seed}:photo-caption-sticker:${index}:${asset.name}`)
      const tintHex = ctx.roles.accent
      const sticker = await stickerElement(asset.path, slot.sizePx, rotation, 0.95, tintHex)
      return sticker ? positioned(sticker, slot.offsets) : null
    })
  )
  return placed.filter((el): el is SatoriElement => el !== null)
}

async function buildPhotoCaption(ctx: TemplateBuildContext): Promise<SatoriElement> {
  const { size, roles, fields, logoDataUri, backgroundKind, fontFamily, seed } = ctx
  const m = margin(size.width)
  const contentWidth = size.width - m * 2
  const hasPhoto = backgroundKind === "photo_ai"

  const alignment: Alignment = pickAxis(seed, "alignment", ALIGNMENTS)
  const showAccentBar = pickAxis(seed, "accentBar", ACCENT_BAR_OPTIONS) === "show"
  const logoCorner = pickAxis(seed, "logoCorner", LOGO_CORNERS)
  const isCentered = alignment === "center"

  const connectorChoice = pickAxis(seed, "connector", connectorPool())
  const useConnector = connectorChoice !== "none"

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
        justifyContent: isCentered ? "center" : "flex-start",
        textAlign: isCentered ? "center" : "left",
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

  const captionUnderline =
    useConnector && connectorChoice === "scribble-underline"
      ? scribbleUnderline(measureTextWidth(captionFit.lines[captionFit.lines.length - 1] ?? fields.caption, captionFit.fontSize), roles.accent, seed, 7)
      : null

  const themeStickers = await buildThemeStickers(ctx, logoCorner, Boolean(logoDataUri), hasPhoto)

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
      ...themeStickers,
      logoDataUri
        ? box({
            position: "absolute",
            top: m,
            ...(logoCorner === "top-left" ? { left: m } : { right: m }),
          }, [img(logoDataUri, { width: 60, height: 60, objectFit: "contain", borderRadius: 10 })])
        : null,
      box({ flexDirection: "column", alignItems: isCentered ? "center" : "flex-start" }, [
        showAccentBar ? box({ marginBottom: 18 }, [accentBar(64, 4, roles.accent, 3)]) : null,
        box({ flexDirection: "column" }, captionLines),
        captionUnderline ? box({ marginTop: 2 }, [captionUnderline]) : null,
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
