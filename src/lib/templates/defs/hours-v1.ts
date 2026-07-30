// hours-v1 — a structured "our hours" card (1080x1080, square). A required
// title + one-line summary guarantee a non-empty, calm card on their own;
// an optional day-by-day breakdown (7 independent fields, any subset) adds
// structured label/value rows with quiet rule dividers when the business
// wants the detail. Background: calm solid/gradient only — no photo, this
// is a reference card people screenshot, not a mood piece.
//
// Wave 4 variety axes (alignment + accent + connector only, per the brief —
// kept deliberately quiet to respect this template's own "calm background,
// no large bleed accent" design intent):
//   alignment: left (unchanged) or center.
//   accent: "none" (unchanged default) or a single very quiet corner dot
//     patch — real variety without breaking the calm read.
//   connector: none (weighted) / tape-strip peeking off the top edge (a
//     card "taped to the window" — an apt motif for an hours card) /
//     scribble-underline under the title.

import { autofitText, measureTextWidth } from "../autofit"
import { dotGrid, iconChip, positioned, ruleLine, scribbleUnderline, tapeStrip, type ConnectorKey } from "../decorations"
import { box, el, img, type TemplateBuildContext, type TemplateDef, type TemplateFieldSchema } from "../types"
import { pickAxis } from "../variants"

const SIZE = { width: 1080, height: 1080 }
const SAFE_MARGIN_RATIO = 0.075

const DAY_FIELDS: Array<{ key: string; label: string }> = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" },
]

const FIELDS: TemplateFieldSchema[] = [
  { key: "title", label: "Title", required: true, maxChars: 30, helpText: "e.g. HOURS, or the business name" },
  {
    key: "summary",
    label: "Summary line",
    required: true,
    maxChars: 90,
    helpText: "One-line overview shown even without the day-by-day breakdown, e.g. Mon–Fri 9am–6pm · Sat 10am–4pm · Sun Closed",
  },
  ...DAY_FIELDS.map(
    (day): TemplateFieldSchema => ({
      key: day.key,
      label: day.label,
      required: false,
      maxChars: 22,
      helpText: "Leave blank to omit this day from the breakdown — e.g. 9:00 AM – 5:00 PM, or Closed",
    })
  ),
]

function margin(width: number): number {
  return Math.round(width * SAFE_MARGIN_RATIO)
}

const ALIGNMENTS = ["left", "center"] as const
type Alignment = (typeof ALIGNMENTS)[number]
const PALETTE_ROLES = ["accent", "primary"] as const
const ACCENTS = ["none", "dots"] as const

function connectorPool(): Array<ConnectorKey | "none"> {
  return ["none", "none", "none", "tape-strip", "scribble-underline"]
}

function buildHours(ctx: TemplateBuildContext) {
  const { size, roles, fields, logoDataUri, backgroundKind, fontFamily, seed } = ctx
  const m = margin(size.width)
  const contentWidth = size.width - m * 2

  const alignment: Alignment = pickAxis(seed, "alignment", ALIGNMENTS)
  const paletteRole = pickAxis(seed, "paletteRole", PALETTE_ROLES)
  const accentOption = pickAxis(seed, "accent", ACCENTS)
  const accentColor = paletteRole === "primary" ? roles.primary : roles.accent
  const isCentered = alignment === "center"

  const connectorChoice = ctx.theme ? "none" : pickAxis(seed, "connector", connectorPool())
  const useConnector = connectorChoice !== "none"

  const titleFit = autofitText({
    text: fields.title,
    maxWidth: contentWidth * 0.8,
    maxHeight: 90,
    minFontSize: 32,
    maxFontSize: 52,
    lineHeight: 1.05,
    maxLines: 1,
  })

  const dayRows = DAY_FIELDS.filter((day) => fields[day.key])
  const hasRows = dayRows.length > 0

  const rowEls = dayRows.flatMap((day, index) => [
    box({ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 16, paddingBottom: 16 }, [
      box({ flexDirection: "row", fontFamily, fontWeight: 700, fontSize: 26, color: roles.textOnDark }, day.label),
      box({ flexDirection: "row", fontFamily, fontWeight: 400, fontSize: 26, color: roles.textOnDark, opacity: 0.78 }, fields[day.key]),
    ]),
    index < dayRows.length - 1 ? box({ opacity: 0.28 }, [ruleLine(contentWidth, accentColor, 1)]) : null,
  ])

  const rootBackgroundStyle =
    backgroundKind === "gradient"
      ? { backgroundImage: `linear-gradient(160deg, ${roles.backgroundStart} 0%, ${roles.backgroundEnd} 100%)` }
      : { backgroundColor: roles.backgroundStart }

  // Only offered in left alignment — the underline's offset math assumes a
  // left-anchored title row (icon + text), which centered mode doesn't have
  // a stable anchor for without extra measurement this template doesn't do.
  const titleUnderline =
    useConnector && connectorChoice === "scribble-underline" && !isCentered
      ? scribbleUnderline(measureTextWidth(titleFit.lines[0] ?? fields.title, titleFit.fontSize), accentColor, seed, 7)
      : null

  const tapeStripEl =
    useConnector && connectorChoice === "tape-strip"
      ? positioned(tapeStrip(110, 40, accentColor, seed, 0.7), { top: -18, left: Math.round(size.width * 0.5 - 55) })
      : null

  const cornerDots = accentOption === "dots" ? positioned(dotGrid(4, 4, 8, 13, accentColor, 0.22), { bottom: m, right: -Math.round(m * 0.3) }) : null

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
      overflow: "hidden",
      ...rootBackgroundStyle,
    },
    children: [
      tapeStripEl,
      cornerDots,
      box({ flexDirection: "row", alignItems: "center", justifyContent: isCentered ? "center" : "flex-start" }, [
        iconChip("clock", accentColor, 30),
        box({ width: 12, height: 1 }),
        box(
          { flexDirection: "row", fontFamily, fontWeight: 900, fontSize: titleFit.fontSize, letterSpacing: "0.02em", color: roles.textOnDark },
          titleFit.lines[0] ?? fields.title
        ),
      ]),
      titleUnderline ? box({ marginTop: -2, marginLeft: 42 }, [titleUnderline]) : null,
      box(
        {
          flexDirection: "row",
          justifyContent: isCentered ? "center" : "flex-start",
          textAlign: isCentered ? "center" : "left",
          marginTop: 20,
          fontFamily,
          fontWeight: 400,
          fontSize: 28,
          lineHeight: 1.35,
          color: roles.textOnDark,
          opacity: 0.82,
        },
        fields.summary
      ),
      hasRows
        ? box({ flexDirection: "column", marginTop: 36, width: contentWidth }, [
            box({ opacity: 0.4 }, [ruleLine(contentWidth, accentColor, 1)]),
            box({ flexDirection: "column" }, rowEls),
          ])
        : null,
      logoDataUri
        ? box({ flexDirection: "row", justifyContent: isCentered ? "center" : "flex-end", width: contentWidth, marginTop: hasRows ? 28 : 44 }, [
            img(logoDataUri, { width: 56, height: 56, objectFit: "contain", borderRadius: 10 }),
          ])
        : null,
    ].filter(Boolean),
  })
}

export const HOURS_V1: TemplateDef = {
  id: "hours-v1",
  name: "Hours card",
  description:
    "A structured reference card for business hours — a title + one-line summary always show, plus an optional day-by-day breakdown with rule dividers. Calm, no photo — designed to be screenshotted.",
  defaultSize: SIZE,
  allowedBackgrounds: ["solid", "gradient"],
  fields: FIELDS,
  build: buildHours,
}
