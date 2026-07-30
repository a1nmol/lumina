// Script-style test: renders all 8 templates with representative sample data
// (a hackathon poster, a coffee-shop promo, a customer quote, an
// announcement, hours, a hiring poster, a testimonial, and a photo caption)
// to real PNG files under the OS temp dir, and asserts each output is a
// well-formed, non-trivial PNG. Also renders event-poster-v1 twice with
// different seeds to prove the decoration system (decorations.ts +
// variants.ts) actually varies deterministically rather than always picking
// the same accent. Run with `npm test` (included via vitest.config.ts's
// `include`) — or directly:
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
  it("renders all 8 templates with sample data to real PNGs", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "lumina-template-samples-"))
    const results: Array<{ name: string; path: string; bytes: number }> = []

    const record = async (name: string, bytes: Buffer) => {
      assertRealPng(bytes)
      const outPath = await renderAndSave(name, dir, bytes)
      results.push({ name, path: outPath, bytes: bytes.length })
    }

    await record(
      "event-poster-v1-hackathon",
      await renderTemplate({
        templateId: "event-poster-v1",
        colorway: "brand",
        background: { type: "gradient" },
        brandKit: SAMPLE_BRAND_KIT,
        seed: "hackathon-2026-03-14",
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
    )

    await record(
      "promo-v1-coffee",
      await renderTemplate({
        templateId: "promo-v1",
        colorway: "brand",
        background: { type: "solid" },
        brandKit: SAMPLE_BRAND_KIT,
        seed: "coffee-weekend-promo",
        fields: {
          offer: "30% OFF",
          offerLine: "All lattes and cold brew, this weekend only",
          finePrint: "In-store only. Cannot be combined with other offers.",
        },
      })
    )

    await record(
      "promo-v1-gradient-colorway",
      await renderTemplate({
        templateId: "promo-v1",
        colorway: "brand",
        background: { type: "gradient" },
        brandKit: SAMPLE_BRAND_KIT,
        seed: "coffee-weekend-promo-gradient",
        fields: {
          offer: "BOGO",
          offerLine: "Buy one pastry, get one free",
          finePrint: "",
        },
      })
    )

    await record(
      "quote-v1-testimonial",
      await renderTemplate({
        templateId: "quote-v1",
        colorway: "dark",
        background: { type: "gradient" },
        brandKit: SAMPLE_BRAND_KIT,
        seed: "quote-maria",
        fields: {
          quote:
            "This place turned our morning coffee run into the best part of the day. Genuinely can't recommend it enough.",
          attribution: "Maria R., regular customer",
        },
      })
    )

    await record(
      "announcement-v1-new-hours",
      await renderTemplate({
        templateId: "announcement-v1",
        colorway: "brand",
        background: { type: "gradient" },
        brandKit: SAMPLE_BRAND_KIT,
        seed: "announcement-sunday-hours",
        fields: {
          badge: "NEW",
          headline: "We're now open Sundays",
          body: "Starting this week, swing by 9am–2pm every Sunday for fresh pastries and coffee.",
          ctaLine: "See the new hours",
        },
      })
    )

    await record(
      "hours-v1-full-week",
      await renderTemplate({
        templateId: "hours-v1",
        colorway: "light",
        background: { type: "solid" },
        brandKit: SAMPLE_BRAND_KIT,
        seed: "hours-full-week",
        fields: {
          title: "HOURS",
          summary: "Mon–Fri 7am–6pm · Sat–Sun 8am–4pm",
          monday: "7:00 AM – 6:00 PM",
          tuesday: "7:00 AM – 6:00 PM",
          wednesday: "7:00 AM – 6:00 PM",
          thursday: "7:00 AM – 6:00 PM",
          friday: "7:00 AM – 6:00 PM",
          saturday: "8:00 AM – 4:00 PM",
          sunday: "8:00 AM – 4:00 PM",
        },
      })
    )

    await record(
      "hiring-v1-barista",
      await renderTemplate({
        templateId: "hiring-v1",
        colorway: "brand",
        background: { type: "gradient" },
        brandKit: SAMPLE_BRAND_KIT,
        seed: "hiring-barista-role",
        fields: {
          roleTitle: "Barista — Part Time",
          benefit1: "Flexible scheduling",
          benefit2: "Free drinks on shift",
          benefit3: "Growth into shift lead",
          ctaLine: "Apply today — link in bio",
        },
      })
    )

    await record(
      "testimonial-v1-jordan",
      await renderTemplate({
        templateId: "testimonial-v1",
        colorway: "dark",
        background: { type: "solid" },
        brandKit: SAMPLE_BRAND_KIT,
        seed: "testimonial-jordan",
        fields: {
          quote: "Fast, friendly, and the best haircut I've had in this city. I'm never going anywhere else.",
          attribution: "Jordan K.",
          context: "Verified customer",
        },
      })
    )

    // Wave 3 — themed decorative stickers (src/lib/templates/themes.ts +
    // decorations.ts#stickerElement). Proves the vendored Noto/IconPark SVGs
    // actually composite through Satori+resvg (a broken SVG here would
    // either throw or silently shrink the PNG well under
    // MIN_NONTRIVIAL_PNG_BYTES) and that the palette hint blends into the
    // resolved colors without breaking the render.
    await record(
      "event-poster-v1-christmas-theme",
      await renderTemplate({
        templateId: "event-poster-v1",
        colorway: "brand",
        background: { type: "gradient" },
        brandKit: SAMPLE_BRAND_KIT,
        seed: "christmas-sale-2026",
        theme: { key: "christmas" },
        fields: {
          eyebrow: "This weekend only",
          headline: "Our Christmas Open House",
          highlight: "FREE GIFT WRAP",
          subhead: "Warm drinks, live carols, and our whole holiday menu.",
          dateLine: "December 20, 5pm–9pm",
          locationLine: "Downtown location",
          ctaLine: "Save your spot — link in bio",
        },
      })
    )

    await record(
      "promo-v1-halloween-theme",
      await renderTemplate({
        templateId: "promo-v1",
        colorway: "brand",
        background: { type: "solid" },
        brandKit: SAMPLE_BRAND_KIT,
        seed: "halloween-promo-2026",
        theme: { key: "halloween" },
        fields: {
          offer: "13% OFF",
          offerLine: "Spooky season special, all week long",
          finePrint: "Costumes encouraged, not required.",
        },
      })
    )

    await record(
      "photo-caption-v1-no-photo-fallback",
      await renderTemplate({
        templateId: "photo-caption-v1",
        colorway: "brand",
        background: { type: "solid" },
        brandKit: SAMPLE_BRAND_KIT,
        seed: "photo-caption-fallback",
        fields: { caption: "Fresh batch, every morning." },
      })
    )

    // Printed (not just asserted) so a human can open + eyeball the actual
    // renders after `npm test` — see the module header.
    for (const result of results) {
      console.log(`[render-sample-templates] ${result.name} -> ${result.path} (${result.bytes} bytes)`)
    }
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

  it("varies its decorative accent across different seeds without ever failing to render (event-poster-v1)", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "lumina-template-samples-variants-"))
    const baseFields = {
      eyebrow: "Friday Night",
      headline: "Live Music on the Patio",
      dateLine: "Every Friday, 7pm–10pm",
      locationLine: "Downtown location",
      ctaLine: "No cover — just show up",
    }

    const seeds = ["variant-seed-alpha", "variant-seed-bravo", "variant-seed-charlie", "variant-seed-delta"]
    const pngs: Buffer[] = []

    for (const seed of seeds) {
      const png = await renderTemplate({
        templateId: "event-poster-v1",
        colorway: "brand",
        background: { type: "gradient" },
        brandKit: SAMPLE_BRAND_KIT,
        seed,
        fields: baseFields,
      })
      assertRealPng(png)
      pngs.push(png)
      const outPath = await renderAndSave(`event-poster-v1-variant-${seed}`, dir, png)
      console.log(`[render-sample-templates] event-poster-v1 (seed="${seed}") -> ${outPath} (${png.length} bytes)`)
    }

    // Real variety, not a no-op: with only 3 decorative arrangements and 4
    // seeds, at least two of these renders must differ (pigeonhole), so
    // asserting "not all identical" is a safe, non-flaky proof that the seed
    // actually changes the output.
    const allIdentical = pngs.every((png) => png.equals(pngs[0]))
    expect(allIdentical).toBe(false)

    // Same seed -> byte-identical output (determinism).
    const repeatPng = await renderTemplate({
      templateId: "event-poster-v1",
      colorway: "brand",
      background: { type: "gradient" },
      brandKit: SAMPLE_BRAND_KIT,
      seed: seeds[0],
      fields: baseFields,
    })
    expect(repeatPng.equals(pngs[0])).toBe(true)
  })
})
