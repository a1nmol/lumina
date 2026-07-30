// quote-v1 — a centered quote card (1080x1080, square). THE auto-fit stress
// case: quoteText can be anywhere from ~20 to ~240 characters and must
// always read well, so this template leans entirely on autofit.ts (no fixed
// font size) plus an ellipsis-truncation safety net for pathological input.
// Background is muted solid or a subtle two-tone gradient ONLY — never a
// photo (a busy photo behind long-form quote text is never legible).
//
// Decoration system (Wave 2): the header glyph is now a bold, solid-filled
// vendored quote mark (decorations.ts#quoteMark) instead of a thin
// font-rendered `“` character (the flagged Wave 1 bug — a font glyph at
// this size reads spindly, not designed). One of two per-render variants
// (picked from ctx.seed) adds a single restrained accent: either an
// oversized, very-low-opacity quote-mark watermark sitting behind the whole
// card, or a quiet rule-star-rule row under the attribution line.
//
// Themed stickers (Wave 3, opt-in via ctx.theme — see themes.ts): quote-v1's
// content is centered both ways and can grow tall (a long quote at a small
// autofit size can occupy nearly the full card height), so the only zone
// that's SAFE regardless of quote length is the corner padding gutter itself
// — this template gets 2 small corner peeks (top-left + bottom-right,
// mirroring the existing "bleed into the margin band" trick every geometric
// accent in this pipeline already relies on), not a large mid-canvas
// "watermark" sticker (that was tried and risked overlapping a long quote —
// see event-poster-v1's module header for the same lesson learned there).
// quote-v1 never allows a photo background, so there's no "skip when photo"
// branch needed here.

import { autofitText } from "../autofit"
import { iconChip, positioned, quoteMark, ruleLine, stickerElement, stickerRotationJitter } from "../decorations"
import { box, el, img, type SatoriElement, type TemplateBuildContext, type TemplateDef, type TemplateFieldSchema } from "../types"
import { pickVariant } from "../variants"

const SIZE = { width: 1080, height: 1080 }
const SAFE_MARGIN_RATIO = 0.055
const GLYPH_ZONE_HEIGHT = 170
const GLYPH_SIZE = 100
const LOGO_SIZE = 72

const FIELDS: TemplateFieldSchema[] = [
  { key: "quote", label: "Quote", required: true, maxChars: 240, minChars: 20 },
  { key: "attribution", label: "Attribution", required: false, maxChars: 40, helpText: "e.g. — Maria, owner" },
]

type Variant = "watermark" | "rule-star"
const VARIANTS: Variant[] = ["watermark", "rule-star"]

function margin(width: number): number {
  return Math.round(width * SAFE_MARGIN_RATIO)
}

/** This template's 2 declared sticker safe zones (Wave 3 — see module header): a small corner peek top-left, and a mirrored one bottom-right. Returns `[]` with no theme or no resolved assets. */
async function buildThemeStickers(ctx: TemplateBuildContext): Promise<SatoriElement[]> {
  if (!ctx.theme) return []
  const slots: Array<{ offsets: { top?: number; left?: number; right?: number; bottom?: number }; sizePx: number; opacity: number }> = [
    { offsets: { top: -18, left: -18 }, sizePx: 88, opacity: 0.95 },
    { offsets: { bottom: -18, right: -18 }, sizePx: 88, opacity: 0.95 },
  ]
  const picks = ctx.theme.assets.slice(0, slots.length)
  const placed = await Promise.all(
    picks.map(async (asset, index) => {
      const slot = slots[index]
      const rotation = stickerRotationJitter(`${ctx.seed}:quote-sticker:${index}:${asset.name}`)
      const tintHex = asset.source === "icon-park" ? ctx.roles.accent : undefined
      const sticker = await stickerElement(asset.path, slot.sizePx, rotation, slot.opacity, tintHex)
      return sticker ? positioned(sticker, slot.offsets) : null
    })
  )
  return placed.filter((el): el is SatoriElement => el !== null)
}

async function buildQuote(ctx: TemplateBuildContext): Promise<SatoriElement> {
  const { size, roles, fields, logoDataUri, backgroundKind, fontFamily, seed } = ctx
  const m = margin(size.width)
  const contentWidth = size.width - m * 2

  const variant = VARIANTS[pickVariant(seed, VARIANTS.length)]

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

  const ruleStarRow =
    variant === "rule-star"
      ? box({ flexDirection: "row", justifyContent: "center", alignItems: "center", marginTop: fields.attribution ? 18 : 30 }, [
          ruleLine(56, roles.accent),
          box({ width: 14, height: 1 }),
          iconChip("star", roles.accent, 20),
          box({ width: 14, height: 1 }),
          ruleLine(56, roles.accent),
        ])
      : null

  // Positioned + sized in one box (not a separate opacity wrapper around a
  // positioned() child) so the absolute offsets resolve against the root
  // directly — the root's own centering (justifyContent/alignItems) only
  // applies to in-flow children, so this must be a direct root child.
  const watermark =
    variant === "watermark"
      ? box(
          {
            position: "absolute",
            top: Math.round(size.height * 0.09),
            left: Math.round(size.width * 0.09),
            opacity: 0.055,
          },
          [quoteMark(roles.accent, Math.round(size.width * 0.82))]
        )
      : null

  const children = [
    box(
      { flexDirection: "row", justifyContent: "center", alignItems: "center", height: GLYPH_ZONE_HEIGHT },
      [quoteMark(roles.accent, GLYPH_SIZE)]
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
    ruleStarRow,
    logoDataUri
      ? box({ flexDirection: "row", justifyContent: "center", marginTop: 24 }, [
          img(logoDataUri, { width: LOGO_SIZE, height: LOGO_SIZE, objectFit: "contain", borderRadius: 8 }),
        ])
      : null,
  ]

  const themeStickers = await buildThemeStickers(ctx)

  return el("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      position: "relative",
      width: size.width,
      height: size.height,
      padding: m,
      fontFamily,
      ...rootBackgroundStyle,
    },
    children: [watermark, ...themeStickers, ...children].filter(Boolean),
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
