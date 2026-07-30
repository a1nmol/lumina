// announcement-v1 — a calm, general-purpose announcement card (1080x1080,
// square). For lower-key news than event-poster-v1's "big event energy":
// new hours, a policy change, "we're back", a new menu item, a milestone.
// Left-aligned, vertically centered content with generous whitespace, a
// small badge chip, a moderate (never huge) autofit headline, an optional
// supporting line, and an understated CTA with an arrow glyph — never a big
// button bar. Background: muted brand solid/gradient only — no photo, to
// keep the calm read.
//
// Decoration: exactly one large ring accent (per the brief), bleeding off
// a corner; the seed only rotates which corner + which resolved role colors
// it, keeping the card genuinely calm across every variant.
//
// Themed stickers (Wave 3, opt-in via ctx.theme — see themes.ts): headline
// text here is LEFT-aligned but can grow to the FULL content width (no
// centering to lean on), so — unlike a fixed mid-canvas "watermark" placement
// (tried, risked overlapping a long headline; see event-poster-v1's module
// header for the same lesson) — this template's 2 declared zones are both
// small corner peeks: one opposite the ring accent, and one on whichever of
// the two remaining corners isn't reserved for the logo. Both bleed into the
// guaranteed-empty padding gutter, same trick every geometric accent here
// already relies on. No photo background is ever allowed here, so there's
// no "skip when photo" branch.

import { autofitText } from "../autofit"
import { iconChip, positioned, ringAccent, stickerElement, stickerRotationJitter } from "../decorations"
import { box, el, img, type SatoriElement, type TemplateBuildContext, type TemplateDef, type TemplateFieldSchema } from "../types"
import { pickVariant } from "../variants"

const SIZE = { width: 1080, height: 1080 }
const SAFE_MARGIN_RATIO = 0.09 // wider than the poster templates — the whole point here is generous whitespace.

const FIELDS: TemplateFieldSchema[] = [
  { key: "badge", label: "Badge", required: false, maxChars: 22, helpText: "Small label above the headline, e.g. NEW or HEADS UP" },
  { key: "headline", label: "Headline", required: true, maxChars: 80, helpText: "The announcement itself, plain and clear" },
  { key: "body", label: "Supporting line", required: false, maxChars: 140 },
  { key: "ctaLine", label: "Call to action", required: false, maxChars: 34, helpText: "e.g. See the new menu" },
]

function margin(width: number): number {
  return Math.round(width * SAFE_MARGIN_RATIO)
}

interface Variant {
  corner: "top-right" | "bottom-right" | "bottom-left"
  useUnderRole: boolean
}

const VARIANTS: Variant[] = [
  { corner: "top-right", useUnderRole: false },
  { corner: "bottom-right", useUnderRole: true },
  { corner: "bottom-left", useUnderRole: false },
]

function ringOffsets(corner: Variant["corner"], diameter: number) {
  const bleed = -Math.round(diameter * 0.4)
  if (corner === "top-right") return { top: bleed, right: bleed }
  if (corner === "bottom-right") return { bottom: bleed, right: bleed }
  return { bottom: bleed, left: bleed }
}

type Corner = "top-left" | "top-right" | "bottom-right" | "bottom-left"
const ALL_CORNERS: Corner[] = ["top-left", "top-right", "bottom-right", "bottom-left"]

function cornerOffsets(corner: Corner, bleed = -16): { top?: number; left?: number; right?: number; bottom?: number } {
  if (corner === "top-left") return { top: bleed, left: bleed }
  if (corner === "top-right") return { top: bleed, right: bleed }
  if (corner === "bottom-right") return { bottom: bleed, right: bleed }
  return { bottom: bleed, left: bleed }
}

/** The ring accent's corner is always one of top-right/bottom-right/bottom-left, and this template's ring choice happens to already be that corner's true diagonal opposite — reused here as-is. */
function cornerOppositeRing(ringCorner: Variant["corner"]): Corner {
  if (ringCorner === "top-right") return "bottom-left"
  if (ringCorner === "bottom-right") return "top-left"
  return "top-right"
}

/** The corner for the 2nd sticker: whichever of the 2 remaining corners (after excluding the ring's corner + the 1st sticker's corner) isn't reserved for the logo, when a logo is present. Deterministic — there are always >=2 corners left after both exclusions, and at most 1 more is removed for the logo. */
function secondStickerCorner(ringCorner: Variant["corner"], firstCorner: Corner, hasLogo: boolean): Corner {
  const excluded = new Set<Corner>([ringCorner as Corner, firstCorner])
  if (hasLogo) excluded.add("bottom-right")
  return ALL_CORNERS.find((corner) => !excluded.has(corner)) ?? firstCorner
}

/** This template's 2 declared sticker safe zones (Wave 3 — see module header): 2 small corner peeks, chosen to never land on the ring accent's own corner or (when present) the logo's corner. Returns `[]` with no theme or no resolved assets. */
async function buildThemeStickers(ctx: TemplateBuildContext, ringCorner: Variant["corner"], hasLogo: boolean): Promise<SatoriElement[]> {
  if (!ctx.theme) return []
  const firstCorner = cornerOppositeRing(ringCorner)
  const secondCorner = secondStickerCorner(ringCorner, firstCorner, hasLogo)
  const slots: Array<{ offsets: { top?: number; left?: number; right?: number; bottom?: number }; sizePx: number; opacity: number }> = [
    { offsets: cornerOffsets(firstCorner), sizePx: 84, opacity: 0.95 },
    { offsets: cornerOffsets(secondCorner), sizePx: 84, opacity: 0.95 },
  ]
  const picks = ctx.theme.assets.slice(0, slots.length)
  const placed = await Promise.all(
    picks.map(async (asset, index) => {
      const slot = slots[index]
      const rotation = stickerRotationJitter(`${ctx.seed}:announcement-sticker:${index}:${asset.name}`)
      const tintHex = asset.source === "icon-park" ? ctx.roles.accent : undefined
      const sticker = await stickerElement(asset.path, slot.sizePx, rotation, slot.opacity, tintHex)
      return sticker ? positioned(sticker, slot.offsets) : null
    })
  )
  return placed.filter((el): el is SatoriElement => el !== null)
}

async function buildAnnouncement(ctx: TemplateBuildContext): Promise<SatoriElement> {
  const { size, roles, fields, logoDataUri, backgroundKind, fontFamily, seed } = ctx
  const m = margin(size.width)
  const contentWidth = size.width - m * 2

  const variant = VARIANTS[pickVariant(seed, VARIANTS.length)]
  const accentColor = variant.useUnderRole ? roles.primary : roles.accent
  const ringDiameter = Math.round(size.width * 0.62)

  const headlineFit = autofitText({
    text: fields.headline,
    maxWidth: contentWidth,
    maxHeight: size.height * 0.3,
    minFontSize: 44,
    maxFontSize: 92,
    lineHeight: 1.08,
    maxLines: 3,
  })

  const headlineLines = headlineFit.lines.map((line, index) =>
    box(
      {
        flexDirection: "row",
        fontFamily,
        fontWeight: 900,
        fontSize: headlineFit.fontSize,
        lineHeight: 1.08,
        letterSpacing: "-0.015em",
        color: roles.textOnDark,
        marginTop: index === 0 ? 0 : 2,
      },
      line
    )
  )

  const content = box({ flexDirection: "column" }, [
    fields.badge
      ? box(
          {
            flexDirection: "row",
            alignSelf: "flex-start",
            marginBottom: 24,
            padding: "10px 20px",
            borderRadius: 999,
            backgroundColor: roles.accent,
            color: roles.textOnAccent,
            fontFamily,
            fontWeight: 700,
            fontSize: 20,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          },
          fields.badge
        )
      : null,
    box({ flexDirection: "column" }, headlineLines),
    fields.body
      ? box(
          { flexDirection: "row", marginTop: 22, fontFamily, fontWeight: 400, fontSize: 28, color: roles.textOnDark, opacity: 0.76 },
          fields.body
        )
      : null,
    fields.ctaLine
      ? box({ flexDirection: "row", alignItems: "center", marginTop: 36 }, [
          box(
            { flexDirection: "row", fontFamily, fontWeight: 700, fontSize: 24, color: roles.accent, letterSpacing: "0.01em" },
            fields.ctaLine
          ),
          box({ width: 10, height: 1 }),
          iconChip("arrow-right", roles.accent, 22),
        ])
      : null,
  ])

  const rootBackgroundStyle =
    backgroundKind === "gradient"
      ? { backgroundImage: `linear-gradient(160deg, ${roles.backgroundStart} 0%, ${roles.backgroundEnd} 100%)` }
      : { backgroundColor: roles.backgroundStart }

  const themeStickers = await buildThemeStickers(ctx, variant.corner, Boolean(logoDataUri))

  return el("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      position: "relative",
      width: size.width,
      height: size.height,
      padding: m,
      fontFamily,
      ...rootBackgroundStyle,
    },
    children: [
      positioned(ringAccent(ringDiameter, 3, accentColor, 0.2), ringOffsets(variant.corner, ringDiameter)),
      ...themeStickers,
      content,
      logoDataUri
        ? box({ position: "absolute", bottom: m, right: m }, [
            img(logoDataUri, { width: 64, height: 64, objectFit: "contain", borderRadius: 10 }),
          ])
        : null,
    ].filter(Boolean),
  })
}

export const ANNOUNCEMENT_V1: TemplateDef = {
  id: "announcement-v1",
  name: "Announcement",
  description:
    "A calm, understated card for lower-key news — new hours, a policy change, a small milestone, 'we're back' — plain badge + headline + optional supporting line, never a loud CTA button. No photo.",
  defaultSize: SIZE,
  allowedBackgrounds: ["solid", "gradient"],
  fields: FIELDS,
  build: buildAnnouncement,
}
