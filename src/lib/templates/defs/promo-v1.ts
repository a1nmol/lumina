// promo-v1 — a punchy, single-offer promo card (1080x1080, square). A solid
// brand-accent block carries the offer numeral + line (and optional fine
// print); when an AI photo background is used, the block shrinks to ~45% of
// the canvas (left) and the photo fills the rest (right, no scrim — the
// solid block already carries all the text). With no photo, the block goes
// full-bleed and the type grows to fill it.
//
// Decoration system (Wave 2): a low-opacity highlightSweep always sits
// behind the offer numeral (a "highlighter stroke" in the brand primary,
// distinct from the block's own accent fill — fixes the Wave 1 "gradient
// colorway looks identical to solid" bug too, since gradient colorway now
// paints a real two-tone diagonal on the block itself). One large accent
// (a bleeding ring, a 4-corner tick frame, or a small dot-grid patch) is
// picked per-render from ctx.seed, scaled to the block's own width so it
// still reads right in the narrower photo-split layout.
//
// Themed stickers (Wave 3, opt-in via ctx.theme — see themes.ts): up to 2
// vendored decorative assets peeking off the block's top-right and
// bottom-right corners — the offer numeral/line/fine-print are all
// left-aligned, so the right-side corner gutters stay text-free regardless
// of copy length. Skipped when a photo background is active (per the
// restraint rule — the split-block layout's right side is the photo itself).

import { autofitText, measureTextWidth } from "../autofit"
import { cornerTicks, dotGrid, highlightSweep, positioned, ringAccent, stickerElement, stickerRotationJitter } from "../decorations"
import { box, el, type SatoriElement, type TemplateBuildContext, type TemplateDef, type TemplateFieldSchema } from "../types"
import { pickVariant } from "../variants"

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

type BigAccentKind = "ring" | "ticks" | "dots"

interface Variant {
  bigAccent: BigAccentKind
  /** Which resolved role colors the big accent — the block itself is already `roles.accent`, so every option here uses a role that actually shows up against it. */
  role: "textOnAccent" | "primary"
}

const VARIANTS: Variant[] = [
  { bigAccent: "ring", role: "textOnAccent" },
  { bigAccent: "ticks", role: "primary" },
  { bigAccent: "dots", role: "textOnAccent" },
]

/** 4-corner tick frame inset from the block's edges — each tick is the same top-left-oriented shape, rotated per corner. */
function cornerFrame(colorHex: string, inset: number): ReturnType<typeof positioned>[] {
  const tick = () => cornerTicks(colorHex)
  return [
    positioned(tick(), { top: inset, left: inset }),
    positioned(box({ transform: "rotate(90deg)" }, [tick()]), { top: inset, right: inset }),
    positioned(box({ transform: "rotate(180deg)" }, [tick()]), { bottom: inset, right: inset }),
    positioned(box({ transform: "rotate(270deg)" }, [tick()]), { bottom: inset, left: inset }),
  ]
}

function buildBigAccent(kind: BigAccentKind, colorHex: string, blockWidth: number, blockHeight: number, m: number) {
  if (kind === "ring") {
    const diameter = Math.round(Math.min(blockWidth, blockHeight) * 0.6)
    return [positioned(ringAccent(diameter, 3, colorHex, 0.18), { bottom: -Math.round(diameter * 0.34), left: -Math.round(diameter * 0.34) })]
  }
  if (kind === "ticks") {
    return cornerFrame(colorHex, Math.round(m * 0.65))
  }
  return [positioned(dotGrid(4, 4, 8, 14, colorHex, 0.3), { bottom: m, right: m })]
}

/** This template's 2 declared sticker safe zones (Wave 3 — see module header): the block's top-right and bottom-right corners, opposite the left-aligned text column. Returns `[]` with no theme, no resolved assets, or an active photo background. */
async function buildThemeStickers(ctx: TemplateBuildContext, hasPhoto: boolean): Promise<SatoriElement[]> {
  if (hasPhoto || !ctx.theme) return []
  const slots: Array<{ offsets: { top?: number; right?: number; bottom?: number }; sizePx: number }> = [
    { offsets: { top: -20, right: -16 }, sizePx: 100 },
    { offsets: { bottom: -18, right: -14 }, sizePx: 84 },
  ]
  const picks = ctx.theme.assets.slice(0, slots.length)
  const placed = await Promise.all(
    picks.map(async (asset, index) => {
      const slot = slots[index]
      const rotation = stickerRotationJitter(`${ctx.seed}:promo-sticker:${index}:${asset.name}`)
      // The block's own background IS roles.accent, so an IconPark glyph
      // must tint to roles.textOnAccent (not roles.accent, which would make
      // it invisible against its own background) to actually show up.
      const tintHex = asset.source === "icon-park" ? ctx.roles.textOnAccent : undefined
      const sticker = await stickerElement(asset.path, slot.sizePx, rotation, 0.96, tintHex)
      return sticker ? positioned(sticker, slot.offsets) : null
    })
  )
  return placed.filter((el): el is SatoriElement => el !== null)
}

async function buildPromo(ctx: TemplateBuildContext): Promise<SatoriElement> {
  const { size, roles, fields, backgroundKind, fontFamily, seed } = ctx
  const hasPhoto = backgroundKind === "photo_ai"
  const blockWidth = hasPhoto ? Math.round(size.width * SPLIT_BLOCK_FRACTION) : size.width
  const m = margin(blockWidth)
  const blockContentWidth = blockWidth - m * 2

  const variant = VARIANTS[pickVariant(seed, VARIANTS.length)]
  const accentColor = variant.role === "primary" ? roles.primary : roles.textOnAccent

  const offerFit = autofitText({
    text: fields.offer,
    maxWidth: blockContentWidth,
    maxHeight: size.height * (hasPhoto ? 0.34 : 0.4),
    minFontSize: 64,
    maxFontSize: hasPhoto ? 168 : 232,
    lineHeight: 1,
    maxLines: 1,
  })

  const offerText = offerFit.lines[0] ?? fields.offer
  const offerTextWidth = measureTextWidth(offerText, offerFit.fontSize)
  const sweepWidth = Math.round(offerTextWidth * 1.14)
  const sweepHeight = Math.round(offerFit.fontSize * 1.3)

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

  const decorationChildren = buildBigAccent(variant.bigAccent, accentColor, blockWidth, size.height, m)

  const offerNumberBlock = box({ flexDirection: "row", position: "relative" }, [
    positioned(highlightSweep(sweepWidth, sweepHeight, roles.primary, 0.22), {
      top: -Math.round((sweepHeight - offerFit.fontSize) / 2),
      left: -Math.round(sweepWidth * 0.05),
    }),
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
      offerText
    ),
  ])

  const themeStickers = await buildThemeStickers(ctx, hasPhoto)

  const block = box(
    {
      flexDirection: "column",
      justifyContent: "center",
      position: "relative",
      width: blockWidth,
      height: size.height,
      padding: m,
      ...(backgroundKind === "gradient"
        ? { backgroundImage: `linear-gradient(135deg, ${roles.accent} 0%, ${roles.primary} 100%)` }
        : { backgroundColor: roles.accent }),
    },
    [
      ...decorationChildren,
      ...themeStickers,
      offerNumberBlock,
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
