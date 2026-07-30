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

import { autofitText } from "../autofit"
import { iconChip, positioned, ringAccent } from "../decorations"
import { box, el, img, type TemplateBuildContext, type TemplateDef, type TemplateFieldSchema } from "../types"
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

function buildAnnouncement(ctx: TemplateBuildContext) {
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
