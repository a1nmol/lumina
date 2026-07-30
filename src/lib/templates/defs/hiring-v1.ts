// hiring-v1 — a "we're hiring" recruiting poster (1080x1350, portrait). A
// fixed "WE'RE HIRING" eyebrow (not AI-authored — it's always this phrase),
// a large role title, 2-3 benefit rows each grounded with a check iconChip,
// and a full-width CTA bar. Background: brand solid/gradient only.
//
// Decoration: one oversized, low-opacity megaphone glyph — the single large
// accent for this template — bleeding off a corner; the seed rotates which
// corner and which resolved role colors it.

import { autofitText } from "../autofit"
import { iconChip, positioned } from "../decorations"
import { box, el, img, type TemplateBuildContext, type TemplateDef, type TemplateFieldSchema } from "../types"
import { pickVariant } from "../variants"

const SIZE = { width: 1080, height: 1350 }
const SAFE_MARGIN_RATIO = 0.06
const EYEBROW_TEXT = "WE'RE HIRING"

const FIELDS: TemplateFieldSchema[] = [
  { key: "roleTitle", label: "Role", required: true, maxChars: 50, helpText: "e.g. Barista — Part Time" },
  { key: "benefit1", label: "Benefit 1", required: true, maxChars: 50, helpText: "e.g. Flexible scheduling" },
  { key: "benefit2", label: "Benefit 2", required: false, maxChars: 50 },
  { key: "benefit3", label: "Benefit 3", required: false, maxChars: 50 },
  { key: "ctaLine", label: "Call to action", required: true, maxChars: 40, helpText: "e.g. Apply today — link in bio" },
]

function margin(width: number): number {
  return Math.round(width * SAFE_MARGIN_RATIO)
}

interface Variant {
  corner: "top-right" | "top-left"
  useUnderRole: boolean
}

const VARIANTS: Variant[] = [
  { corner: "top-right", useUnderRole: false },
  { corner: "top-left", useUnderRole: true },
]

// Vertically centered on the canvas (not pinned to the top) so this one
// large accent also occupies the gap between the benefit rows and the CTA
// bar — the same "empty middle" fix event-poster-v1 needed, since a
// recruiting poster with a big dead void between content and CTA reads
// unfinished, not calm.
function megaphoneOffsets(corner: Variant["corner"], size: number, canvasHeight: number) {
  const bleed = -Math.round(size * 0.3)
  const top = Math.round(canvasHeight * 0.5 - size * 0.5)
  return corner === "top-right" ? { top, right: bleed } : { top, left: bleed }
}

function buildHiring(ctx: TemplateBuildContext) {
  const { size, roles, fields, logoDataUri, backgroundKind, fontFamily, seed } = ctx
  const m = margin(size.width)
  const contentWidth = size.width - m * 2

  const variant = VARIANTS[pickVariant(seed, VARIANTS.length)]
  const accentColor = variant.useUnderRole ? roles.primary : roles.accent
  const megaphoneSize = Math.round(size.width * 0.62)

  const roleTitleFit = autofitText({
    text: fields.roleTitle,
    maxWidth: contentWidth,
    maxHeight: size.height * 0.24,
    minFontSize: 48,
    maxFontSize: 108,
    lineHeight: 1.06,
    maxLines: 3,
  })

  const roleTitleLines = roleTitleFit.lines.map((line, index) =>
    box(
      {
        flexDirection: "row",
        fontFamily,
        fontWeight: 900,
        fontSize: roleTitleFit.fontSize,
        lineHeight: 1.06,
        letterSpacing: "-0.015em",
        color: roles.textOnDark,
        marginTop: index === 0 ? 0 : 2,
      },
      line
    )
  )

  const benefits = [fields.benefit1, fields.benefit2, fields.benefit3].filter(Boolean)
  const benefitRows = benefits.map((benefit, index) =>
    box({ flexDirection: "row", alignItems: "center", marginTop: index === 0 ? 0 : 20 }, [
      iconChip("check", accentColor, 26),
      box({ width: 14, height: 1 }),
      box({ flexDirection: "row", fontFamily, fontWeight: 400, fontSize: 28, color: roles.textOnDark, opacity: 0.86 }, benefit),
    ])
  )

  const rootBackgroundStyle =
    backgroundKind === "gradient"
      ? { backgroundImage: `linear-gradient(180deg, ${roles.backgroundStart} 0%, ${roles.backgroundEnd} 100%)` }
      : { backgroundColor: roles.backgroundStart }

  return el("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      position: "relative",
      width: size.width,
      height: size.height,
      padding: m,
      fontFamily,
      ...rootBackgroundStyle,
    },
    children: [
      positioned(
        box({ opacity: 0.14 }, [iconChip("megaphone", accentColor, megaphoneSize)]),
        megaphoneOffsets(variant.corner, megaphoneSize, size.height)
      ),
      box({ flexDirection: "column" }, [
        box(
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
          EYEBROW_TEXT
        ),
        box({ flexDirection: "column" }, roleTitleLines),
        box({ flexDirection: "column", marginTop: 40 }, benefitRows),
      ]),
      // Quiet centered rule filling the gap between the benefit list and the
      // CTA bar — the "space-between" root would otherwise leave a stark
      // dead void here on shorter role titles/benefit lists. A plain
      // symmetric bar (not ruleLine's dot-terminal version, which reads
      // left-anchored rather than centered) so it balances visually.
      box({ flexDirection: "row", justifyContent: "center", opacity: 0.3 }, [
        el("div", { style: { display: "flex", width: Math.round(contentWidth * 0.32), height: 1, backgroundColor: roles.textOnDark } }),
      ]),
      box({ flexDirection: "column" }, [
        box(
          {
            flexDirection: "row",
            justifyContent: "center",
            fontFamily,
            fontWeight: 700,
            fontSize: 26,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: roles.textOnAccent,
            backgroundColor: roles.accent,
            padding: "20px 0",
            borderRadius: 14,
          },
          fields.ctaLine
        ),
        logoDataUri
          ? box({ flexDirection: "row", justifyContent: "center", marginTop: 24 }, [
              img(logoDataUri, { width: 56, height: 56, objectFit: "contain", borderRadius: 10 }),
            ])
          : null,
      ]),
    ].filter(Boolean),
  })
}

export const HIRING_V1: TemplateDef = {
  id: "hiring-v1",
  name: "Hiring poster",
  description:
    "A recruiting poster — fixed 'WE'RE HIRING' eyebrow, large role title, 2-3 check-marked benefit rows, and a full-width CTA bar. Use for job openings.",
  defaultSize: SIZE,
  allowedBackgrounds: ["solid", "gradient"],
  fields: FIELDS,
  build: buildHiring,
}
