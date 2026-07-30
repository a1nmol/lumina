// event-poster-v1 — the flagship "announce a thing" poster (default
// 1080x1350, portrait). Hierarchy: eyebrow -> huge headline -> optional
// highlight badge -> optional subhead -> footer bar (date + location) -> CTA
// line -> logo. Background: brand-derived dark solid/gradient, or an
// optional AI photo behind a bottom scrim so the footer/CTA stay legible.
//
// Decoration system (Wave 2): small iconChips ground the date/location/prize
// lines, an accentBar underlines the headline, and — ONLY when there's no
// photo (the "empty middle" problem) — exactly one large accent (a ring
// bleeding off the top-right corner, a diagonal band behind the lower third,
// or a dot-grid texture patch) plus a faint centered rule fill the void
// between the header block and the footer. The variant (which large accent,
// and which palette role colors it) is picked deterministically from
// ctx.seed via variants.ts#pickVariant — never more than that one large
// accent alongside the small grounded ones, per the restraint rule.
//
// Themed stickers (Wave 3, opt-in via ctx.theme — see themes.ts): up to 3
// vendored decorative assets placed in this template's void zones — a
// corner cluster bleeding off the top-right, one sitting in the same empty
// mid-gap the midRule divider already proves is text-free, and one bleeding
// off the bottom-left corner. Skipped entirely when a photo background is
// active (a real photo already fills the frame) or no theme was requested.

import { autofitText } from "../autofit"
import { accentBar, dotGrid, diagonalBand, iconChip, positioned, ringAccent, stickerElement, stickerRotationJitter } from "../decorations"
import { box, el, img, type SatoriElement, type TemplateBuildContext, type TemplateDef, type TemplateFieldSchema } from "../types"
import { pickVariant } from "../variants"

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

type BigAccentKind = "ring" | "band" | "dots"

interface Variant {
  bigAccent: BigAccentKind
  /** Which resolved role colors the big accent — true rotates to primary instead of accent, per the "swap which role colors the ring vs the band" micro-rotation guidance. */
  useUnderRole: boolean
}

const VARIANTS: Variant[] = [
  { bigAccent: "ring", useUnderRole: false },
  { bigAccent: "band", useUnderRole: true },
  { bigAccent: "dots", useUnderRole: false },
]

/**
 * This template's 3 declared sticker safe zones (Wave 3 — see module
 * header): a top-right corner cluster and a bottom-left corner peek (both
 * `positioned()` bleeds into the guaranteed-empty padding gutter, same
 * proven-safe trick the big geometric accents already use — see
 * buildBigAccent above), plus a third sticker placed IN-FLOW next to the
 * midRule divider rather than absolutely positioned. The corner two are
 * genuinely position-independent of content length; the middle one is NOT
 * (the gap between the header and footer blocks shrinks/grows with
 * headline/subhead length under this root's `justify-content: space-between`
 * layout), so it must ride along as a real flex sibling of midRule — a fixed
 * pixel/percentage offset there was tried and produced a real overlap with a
 * long subhead in review, which is why this is a flow element, not a
 * `positioned()` one.
 */
const CORNER_STICKER_SLOTS: Array<{ offsets: { top?: number; left?: number; right?: number; bottom?: number }; sizePx: number }> = [
  { offsets: { top: -34, right: -18 }, sizePx: 116 },
  { offsets: { bottom: -28, left: -22 }, sizePx: 96 },
]

/** Resolves ctx.theme's assets (if any) into up to 2 positioned corner sticker elements. Returns `[]` when there's no theme, no resolved assets, or a photo background is active (never stickers over a photo — restraint rule). */
async function buildCornerStickers(ctx: TemplateBuildContext, hasPhoto: boolean): Promise<SatoriElement[]> {
  if (hasPhoto || !ctx.theme) return []
  const picks = ctx.theme.assets.slice(0, CORNER_STICKER_SLOTS.length)
  const placed = await Promise.all(
    picks.map(async (asset, index) => {
      const slot = CORNER_STICKER_SLOTS[index]
      const rotation = stickerRotationJitter(`${ctx.seed}:event-poster-corner-sticker:${index}:${asset.name}`)
      // IconPark assets are mono/two-tone and ship IconPark's own default
      // blue — recolor to the resolved accent so they read as part of THIS
      // poster's palette. Noto's multicolor illustrations keep their own
      // baked-in colors (see decorations.ts#stickerElement's contract).
      const tintHex = asset.source === "icon-park" ? ctx.roles.accent : undefined
      const sticker = await stickerElement(asset.path, slot.sizePx, rotation, 0.96, tintHex)
      return sticker ? positioned(sticker, slot.offsets) : null
    })
  )
  return placed.filter((el): el is SatoriElement => el !== null)
}

/** The 3rd theme asset (if any), rendered as a small IN-FLOW sticker to sit beside the midRule divider — see the safety note on CORNER_STICKER_SLOTS above for why this one can't be `positioned()`. */
async function buildMidGapSticker(ctx: TemplateBuildContext, hasPhoto: boolean): Promise<SatoriElement | null> {
  if (hasPhoto || !ctx.theme) return null
  const asset = ctx.theme.assets[2]
  if (!asset) return null
  const rotation = stickerRotationJitter(`${ctx.seed}:event-poster-midgap-sticker:${asset.name}`)
  const tintHex = asset.source === "icon-park" ? ctx.roles.accent : undefined
  return stickerElement(asset.path, 56, rotation, 0.9, tintHex)
}

function buildBigAccent(kind: BigAccentKind, colorHex: string, size: { width: number; height: number }, m: number) {
  if (kind === "ring") {
    return positioned(ringAccent(560, 3, colorHex, 0.26), { top: -170, right: -170 })
  }
  if (kind === "band") {
    return positioned(diagonalBand(colorHex, 0.1, Math.round(size.width * 1.5), 240), {
      top: Math.round(size.height * 0.6),
      left: -Math.round(size.width * 0.22),
    })
  }
  return positioned(dotGrid(5, 5, 10, 16, colorHex, 0.36), { top: Math.round(size.height * 0.47), right: m })
}

async function buildEventPoster(ctx: TemplateBuildContext): Promise<SatoriElement> {
  const { size, roles, fields, logoDataUri, backgroundKind, fontFamily, seed } = ctx
  const m = margin(size.width)
  const contentWidth = size.width - m * 2
  const hasPhoto = backgroundKind === "photo_ai"

  const variant = VARIANTS[pickVariant(seed, VARIANTS.length)]
  const accentColor = variant.useUnderRole ? roles.primary : roles.accent

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
    accentBar(96, 6, roles.accent, 4),
    fields.highlight
      ? box(
          {
            flexDirection: "row",
            alignItems: "center",
            alignSelf: "flex-start",
            marginTop: 26,
            padding: "16px 30px",
            borderRadius: 999,
            backgroundColor: roles.accent,
            color: roles.textOnAccent,
          },
          [
            iconChip("trophy", roles.textOnAccent, 26),
            box({ width: 12, height: 1 }),
            box({ flexDirection: "row", fontFamily, fontWeight: 700, fontSize: 28, letterSpacing: "0.02em" }, fields.highlight),
          ]
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
        box({ flexDirection: "row", alignItems: "center" }, [
          iconChip("calendar", accentColor, 28),
          box({ width: 10, height: 1 }),
          box(
            { flexDirection: "row", fontFamily, fontWeight: 700, fontSize: 32, color: roles.textOnDark },
            fields.dateLine
          ),
        ]),
        fields.locationLine
          ? box({ flexDirection: "row", alignItems: "center", marginTop: 8, opacity: 0.72 }, [
              iconChip("map-pin", roles.textOnDark, 22),
              box({ width: 8, height: 1 }),
              box(
                { flexDirection: "row", fontFamily, fontWeight: 400, fontSize: 26, color: roles.textOnDark },
                fields.locationLine
              ),
            ])
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

  // The big decorative accent + the void-filling rule only apply when there's
  // no photo — a real photo already fills the frame, and this is specifically
  // the "empty middle" fix for the flat solid/gradient case.
  const decorationChildren = hasPhoto ? [] : [buildBigAccent(variant.bigAccent, accentColor, size, m)]

  const midGapSticker = await buildMidGapSticker(ctx, hasPhoto)

  const midRule = hasPhoto
    ? null
    : box({ flexDirection: "row", justifyContent: "center", alignItems: "center" }, [
        el("div", {
          style: {
            display: "flex",
            width: Math.round(contentWidth * (midGapSticker ? 0.34 : 0.42)),
            height: 1,
            backgroundColor: roles.textOnDark,
            opacity: 0.3,
          },
        }),
        midGapSticker ? box({ marginLeft: 18 }, [midGapSticker]) : null,
      ].filter(Boolean))

  const cornerStickers = await buildCornerStickers(ctx, hasPhoto)

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
    children: [
      ...decorationChildren,
      ...cornerStickers,
      box({ flexDirection: "column" }, topChildren),
      midRule,
      box({ flexDirection: "column" }, bottomChildren),
    ].filter(Boolean),
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
