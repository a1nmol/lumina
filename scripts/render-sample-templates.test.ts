// Script-style test: renders all 3 Wave 1 templates with representative
// sample data (a hackathon poster, a coffee-shop promo, a customer quote) to
// real PNG files under the OS temp dir, and asserts each output is a
// well-formed, non-trivial PNG. Run with `npm test` (included via
// vitest.config.ts's `include`) — or directly:
//   npx vitest run scripts/render-sample-templates.test.ts
//
// This is the fastest way to eyeball the actual rendered output: after a run,
// open the paths printed to the console.

import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { renderTemplate } from "@/lib/templates/render"
import type { BrandKit } from "@/lib/types"

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
/** A real rendered poster (1080-wide, real typography) should always be well above this — a corrupt/near-blank render would be far smaller. */
const MIN_NONTRIVIAL_PNG_BYTES = 8_000

const SAMPLE_BRAND_KIT: BrandKit = { primary_color: "#6D4AFF" }

function assertRealPng(bytes: Buffer) {
  expect(bytes.subarray(0, 8).equals(PNG_MAGIC)).toBe(true)
  expect(bytes.length).toBeGreaterThan(MIN_NONTRIVIAL_PNG_BYTES)
}

async function renderAndSave(name: string, dir: string, bytes: Buffer): Promise<string> {
  const outPath = path.join(dir, `${name}.png`)
  await writeFile(outPath, bytes)
  return outPath
}

describe("render-sample-templates (script)", () => {
  it("renders event-poster-v1, promo-v1, and quote-v1 with sample data to real PNGs", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "lumina-template-samples-"))

    const eventPosterPng = await renderTemplate({
      templateId: "event-poster-v1",
      colorway: "brand",
      background: { type: "gradient" },
      brandKit: SAMPLE_BRAND_KIT,
      fields: {
        eyebrow: "Saturday, March 14",
        headline: "Local Business AI Hackathon",
        highlight: "$1,000 PRIZE POOL",
        subhead: "Build the future of small-business tools in 24 hours.",
        dateLine: "March 14–15, 2026",
        locationLine: "Downtown Innovation Hub",
        ctaLine: "Register free — link in bio",
      },
    })
    assertRealPng(eventPosterPng)
    const eventPosterPath = await renderAndSave("event-poster-v1-hackathon", dir, eventPosterPng)

    const promoPng = await renderTemplate({
      templateId: "promo-v1",
      colorway: "brand",
      background: { type: "solid" },
      brandKit: SAMPLE_BRAND_KIT,
      fields: {
        offer: "30% OFF",
        offerLine: "All lattes and cold brew, this weekend only",
        finePrint: "In-store only. Cannot be combined with other offers.",
      },
    })
    assertRealPng(promoPng)
    const promoPath = await renderAndSave("promo-v1-coffee", dir, promoPng)

    const quotePng = await renderTemplate({
      templateId: "quote-v1",
      colorway: "dark",
      background: { type: "gradient" },
      brandKit: SAMPLE_BRAND_KIT,
      fields: {
        quote:
          "This place turned our morning coffee run into the best part of the day. Genuinely can't recommend it enough.",
        attribution: "Maria R., regular customer",
      },
    })
    assertRealPng(quotePng)
    const quotePath = await renderAndSave("quote-v1-testimonial", dir, quotePng)

    // Printed (not just asserted) so a human can open + eyeball the actual
    // renders after `npm test` — see the module header.
    console.log(`[render-sample-templates] event-poster-v1 -> ${eventPosterPath} (${eventPosterPng.length} bytes)`)
    console.log(`[render-sample-templates] promo-v1        -> ${promoPath} (${promoPng.length} bytes)`)
    console.log(`[render-sample-templates] quote-v1        -> ${quotePath} (${quotePng.length} bytes)`)
  })

  it("still renders event-poster-v1 cleanly with no optional fields and no brand kit at all", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "lumina-template-samples-minimal-"))
    const png = await renderTemplate({
      templateId: "event-poster-v1",
      brandKit: null,
      fields: {
        headline: "Fresh Bagels Every Morning",
        dateLine: "Every day, 7am–2pm",
        ctaLine: "Stop by today",
      },
    })
    assertRealPng(png)
    const outPath = await renderAndSave("event-poster-v1-minimal", dir, png)
    console.log(`[render-sample-templates] event-poster-v1 (minimal) -> ${outPath} (${png.length} bytes)`)
  })
})
