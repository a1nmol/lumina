// Wave 4 — adaptive density ("fill the canvas"): a template's own optional
// fields tell it how sparse the input is, and a sparse render picks exactly
// ONE dominant fill strategy (seeded) so a minimal-input poster never reads
// as unfinished. Framework-free math lives here; the actual fill BUILDERS
// mostly reuse existing decorations.ts primitives directly in each template
// (iconChip/stickerElement + positioned() for "watermark-scale icon",
// dotGrid for "expanded dot/stripe field") — echoText below is the one
// fill strategy that needs its own helper, since it has to reuse an
// autofit.ts result's ALREADY-WRAPPED lines rather than re-measuring.

import { positioned } from "./decorations"
import { box, type SatoriElement } from "./types"
import { pickAxis } from "./variants"

export type DensityMode = "rich" | "standard" | "minimal"

/**
 * densityMode from the count of non-empty OPTIONAL fields (required fields
 * never count — a template with only required fields filled is the
 * sparsest possible input, i.e. "rich" fill territory): 0-1 -> rich,
 * 2 -> standard, 3+ -> minimal. Pass the template's own optional field
 * values (e.g. `[fields.subhead, fields.highlight, fields.locationLine]`).
 */
export function computeDensityMode(optionalFieldValues: ReadonlyArray<string | undefined | null>): DensityMode {
  const count = optionalFieldValues.filter((value) => Boolean(value && value.trim())).length
  if (count <= 1) return "rich"
  if (count === 2) return "standard"
  return "minimal"
}

export type FillStrategy = "oversized-hero" | "echo-text" | "watermark-icon" | "expanded-dots"
const FILL_STRATEGIES: readonly FillStrategy[] = ["oversized-hero", "echo-text", "watermark-icon", "expanded-dots"]

/**
 * Picks exactly ONE dominant fill strategy for a rich-density render, seeded
 * so repeat renders of the same content stay byte-identical. Only meaningful
 * when computeDensityMode(...) === "rich" — callers gate on that first, then
 * branch on this to decide which single fill treatment to apply. Never
 * combine more than one — that's how "fill the canvas" stays restrained
 * instead of busy (see the hard cap on total decorative elements, section 5
 * of the Wave 4 brief).
 */
export function pickFillStrategy(seed: string): FillStrategy {
  return pickAxis(seed, "fill-strategy", FILL_STRATEGIES)
}

/**
 * Ghost/echo text: re-renders `lines` — an autofit.ts#AutofitResult.lines
 * array the template ALREADY computed for its hero field, no new
 * measurement — at `scaledFontSize` (larger than the original) and a very
 * low opacity, absolutely positioned so it never affects normal-flow layout
 * or line-wrapping (an unconstrained absolutely-positioned box sizes to its
 * own content in Satori's flexbox model, so the bigger text never re-wraps
 * against the original box width). Caller supplies `offsets` to place/bleed
 * it (e.g. behind the hero field, partially off one edge).
 */
export function echoText(
  lines: string[],
  fontFamily: string,
  scaledFontSize: number,
  colorHex: string,
  offsets: { top?: number; left?: number; right?: number; bottom?: number },
  opacity = 0.07
): SatoriElement {
  const lineEls = lines.map((line, index) =>
    box(
      {
        flexDirection: "row",
        fontFamily,
        fontWeight: 900,
        fontSize: scaledFontSize,
        lineHeight: 1,
        letterSpacing: "-0.02em",
        color: colorHex,
        marginTop: index === 0 ? 0 : 2,
      },
      line
    )
  )
  return positioned(box({ flexDirection: "column", opacity }, lineEls), offsets)
}
