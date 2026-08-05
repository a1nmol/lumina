// Permanent overflow guard (promoted from stress-overflow.diag.test.ts — see
// CHANGELOG for the bug this catches): every template x every supported
// size x every seed below, with every text field filled to its maxChars
// with WIDE glyphs ("WWMMWW HOLIDAY MMWW..." — an adversarial mix of the
// widest upper/lower-case letters this pipeline's char-width table knows
// about). This is the render-level half of the invariant that makes the
// owner's "single-line rows overflow the canvas" bug class impossible; the
// measurement-level half lives in src/lib/templates/autofit.test.ts
// (fitSingleLine's own width-budget assertions).
//
// This alone can't detect PIXEL-level clipping from a PNG's bytes — the
// real guarantee is autofit.test.ts's fitSingleLine invariant
// (measureTrackedWidth(final) <= budget + 0.5px), which every template def
// now routes its label-style text through (decorations.ts#textLine) or its
// own autofitText call for wrapping paragraph fields. What THIS test proves
// is the render-level contract: max-length wide-glyph content on every
// template/size/seed combination always produces a real, well-formed,
// non-trivial PNG — never a thrown error, never a corrupt/near-blank
// output. Run it after any decorations.ts/autofit.ts/template-def change.
import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { getTemplate, listTemplates } from "../src/lib/templates/catalog"
import { renderTemplate } from "../src/lib/templates/render"
import type { TemplateSize } from "../src/lib/templates/types"

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const MIN_NONTRIVIAL_PNG_BYTES = 6_000

/** Adversarial wide-glyph filler — heavy on W/M (this pipeline's widest upper-case letters) plus a real word, repeated and clamped to a field's exact maxChars so every field always renders at its true worst case. */
function wide(n: number): string {
  return "WWMMWW HOLIDAY MMWW ".repeat(20).slice(0, n)
}

// A few different seeds so the render-level guard also exercises the
// anti-repetition variety axes (headlineAlignment/composition/bigAccent/
// connector/etc.) rather than only ever the one arrangement "stress" picks.
const SEEDS = ["stress-overflow-alpha", "stress-overflow-bravo", "stress-overflow-charlie"]

describe("overflow stress (permanent guard)", () => {
  it("renders max-length wide-glyph fields cleanly on every template x size x seed", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "lumina-stress-"))
    let rendered = 0

    for (const meta of listTemplates()) {
      const def = getTemplate(meta.id)
      if (!def) continue

      const fields: Record<string, string> = {}
      for (const schema of def.fields) {
        fields[schema.key] = wide(schema.maxChars)
      }

      const sizes: TemplateSize[] = def.supportedSizes ?? [def.defaultSize]

      for (const size of sizes) {
        for (const seed of SEEDS) {
          const png = await renderTemplate({
            templateId: meta.id,
            fields,
            colorway: "brand",
            background: { type: "gradient" },
            brandKit: { primary_color: "#4f46e5" },
            seed,
            size,
          })

          expect(png.subarray(0, 8).equals(PNG_MAGIC)).toBe(true)
          expect(png.length).toBeGreaterThan(MIN_NONTRIVIAL_PNG_BYTES)

          const name = `${meta.id}-${size.width}x${size.height}-${seed}.png`
          await writeFile(path.join(dir, name), png)
          rendered++
        }
      }
    }

    console.log(`[stress-overflow] rendered ${rendered} PNGs -> ${dir}`)
    expect(rendered).toBeGreaterThan(0)
  }, 180_000)
})
