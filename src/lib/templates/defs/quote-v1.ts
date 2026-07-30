// quote-v1 — a centered quote card (1080x1080, square). THE auto-fit stress
// case: quoteText can be anywhere from ~20 to ~240 characters and must
// always read well, so this template leans entirely on autofit.ts (no fixed
// font size) plus an ellipsis-truncation safety net for pathological input.
// Background is muted solid or a subtle two-tone gradient ONLY — never a
// photo (a busy photo behind long-form quote text is never legible).
//
// Wave 4 variety axes (per the brief, this template gets alignment + accent
// + connector only — no composition/scalePlay/density/format, since a
// variable-length quote already dictates its own sizing via autofit):
//   alignment: center (unchanged) or left (quote block left-aligned instead
//     of centered — a genuinely different read, still safe under autofit).
//   bigAccent (was a plain 2-option VARIANTS array — now a named,
//     pickAxis-driven axis): watermark quote-mark, or a quiet rule-star row.
//   connector: none (weighted) / scribble-underline under the attribution
//     line (when present) / callout-bubble-outline wrapping the whole quote
//     block — thematically apt (a quote IS a speech bubble), sized from the
//     same content-width box autofit already used, no new measurement.
//
// Themed stickers (Wave 3, unchanged): 2 small corner peeks (top-left +
// bottom-right) — the only zone that's safe regardless of quote length.
// quote-v1 never allows a photo background, so there's no "skip when photo"
// branch needed anywhere in this file.

import { autofitText, measureTextWidth } from "../autofit"
import { calloutBubbleOutline, iconChip, positioned, quoteMark, ruleLine, scribbleUnderline, stickerElement, stickerRotationJitter, type ConnectorKey } from "../decorations"
import { box, el, img, type SatoriElement, type TemplateBuildContext, type TemplateDef, type TemplateFieldSchema } from "../types"
import { pickAxis } from "../variants"

const SIZE = { width: 1080, height: 1080 }
const SAFE_MARGIN_RATIO = 0.055
const GLYPH_ZONE_HEIGHT = 170
const GLYPH_SIZE = 100
const LOGO_SIZE = 72

const FIELDS: TemplateFieldSchema[] = [
  { key: "quote", label: "Quote", required: true, maxChars: 240, minChars: 20 },
  { key: "attribution", label: "Attribution", required: false, maxChars: 40, helpText: "e.g. — Maria, owner" },
]

const ALIGNMENTS = ["center", "left"] as const
type Alignment = (typeof ALIGNMENTS)[number]
const BIG_ACCENTS = ["watermark", "rule-star"] as const
type BigAccentKind = (typeof BIG_ACCENTS)[number]

function margin(width: number): number {
  return Math.round(width * SAFE_MARGIN_RATIO)
}

/** This template's 2 declared sticker safe zones (Wave 3): a small corner peek top-left, and a mirrored one bottom-right. Returns `[]` with no theme or no resolved assets. */
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
      const tintHex = ctx.roles.accent
      const sticker = await stickerElement(asset.path, slot.sizePx, rotation, slot.opacity, tintHex)
      return sticker ? positioned(sticker, slot.offsets) : null
    })
  )
  return placed.filter((el): el is SatoriElement => el !== null)
}

/** Field-dependent connector pool, weighted toward "none". */
function connectorPool(fields: Record<string, string>): Array<ConnectorKey | "none"> {
  const pool: Array<ConnectorKey | "none"> = ["none", "none", "none", "callout-bubble-outline"]
  if (fields.attribution) pool.push("scribble-underline")
  return pool
}

async function buildQuote(ctx: TemplateBuildContext): Promise<SatoriElement> {
  const { size, roles, fields, logoDataUri, backgroundKind, fontFamily, seed } = ctx
  const m = margin(size.width)
  const contentWidth = size.width - m * 2

  const alignment: Alignment = pickAxis(seed, "alignment", ALIGNMENTS)
  const bigAccentKind: BigAccentKind = pickAxis(seed, "bigAccent", BIG_ACCENTS)
  const connectorChoice = ctx.theme ? "none" : pickAxis(seed, "connector", connectorPool(fields))
  const useConnector = connectorChoice !== "none"
  const isCentered = alignment === "center"

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
        justifyContent: isCentered ? "center" : "flex-start",
        textAlign: isCentered ? "center" : "left",
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
    bigAccentKind === "rule-star"
      ? box({ flexDirection: "row", justifyContent: "center", alignItems: "center", marginTop: fields.attribution ? 18 : 30 }, [
          ruleLine(56, roles.accent),
          box({ width: 14, height: 1 }),
          iconChip("star", roles.accent, 20),
          box({ width: 14, height: 1 }),
          ruleLine(56, roles.accent),
        ])
      : null

  const watermark =
    bigAccentKind === "watermark"
      ? box(
          { position: "absolute", top: Math.round(size.height * 0.09), left: Math.round(size.width * 0.09), opacity: 0.055 },
          [quoteMark(roles.accent, Math.round(size.width * 0.82))]
        )
      : null

  const attributionUnderline =
    useConnector && connectorChoice === "scribble-underline" && fields.attribution
      ? scribbleUnderline(measureTextWidth(fields.attribution, 26), roles.accent, seed, 7)
      : null

  // callout-bubble-outline wraps the whole quote block — a speech-bubble
  // outline is thematically apt for a quote card. Sized from the same
  // content-width box autofit already computed (no new measurement): width
  // = the box autofit wrapped into, height = its own line count * line
  // height, +14-30% padding both ways.
  const calloutWrap =
    useConnector && connectorChoice === "callout-bubble-outline"
      ? (() => {
          const innerWidth = contentWidth * 0.92
          const innerHeight = quoteFit.lines.length * quoteFit.lineHeightPx
          const wrapW = Math.round(innerWidth * 1.14)
          const wrapH = Math.round(innerHeight * 1.3)
          return positioned(calloutBubbleOutline(wrapW, wrapH, roles.accent, seed, 6), {
            top: -Math.round((wrapH - innerHeight) / 2),
            left: -Math.round((wrapW - innerWidth) / 2),
          })
        })()
      : null

  const children = [
    box(
      { flexDirection: "row", justifyContent: "center", alignItems: "center", height: GLYPH_ZONE_HEIGHT },
      [quoteMark(roles.accent, GLYPH_SIZE)]
    ),
    box({ flexDirection: "column", alignItems: isCentered ? "center" : "flex-start", position: "relative", overflow: "hidden" }, [
      calloutWrap,
      ...quoteLines,
    ]),
    fields.attribution
      ? box({ flexDirection: "column", alignItems: isCentered ? "center" : "flex-start", marginTop: 28 }, [
          box(
            { flexDirection: "row", fontFamily, fontWeight: 700, fontSize: 26, letterSpacing: "0.02em", color: roles.accent },
            fields.attribution
          ),
          attributionUnderline ? box({ marginTop: -4 }, [attributionUnderline]) : null,
        ])
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
      overflow: "hidden",
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
