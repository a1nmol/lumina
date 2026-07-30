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

import { pickFillStrategy } from "@/lib/templates/density"
import { renderTemplate } from "@/lib/templates/render"
import { TEMPLATE_SIZES } from "@/lib/templates/types"
import type { BrandKit } from "@/lib/types"
import { pickAxis } from "@/lib/templates/variants"

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
    // decorations.ts#stickerElement). Proves the vendored IconPark/MingCute
    // SVGs (Wave 4 — drawn-style, Noto retired) actually composite through
    // Satori+resvg (a broken SVG here would
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

  // ==========================================================================
  // Wave 4 — semantic elements + connectors + anti-repetition + fill-the-canvas
  // ==========================================================================

  it("(a) renders a hackathon event-poster with THREE different seeds — pairwise distinct compositions, never identical", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "lumina-template-samples-wave4-hackathon-"))
    const hackathonFields = {
      eyebrow: "Saturday, March 14",
      headline: "Local Business AI Hackathon",
      highlight: "$1,000 PRIZE POOL",
      subhead: "Build the future of small-business tools in 24 hours.",
      dateLine: "March 14–15, 2026",
      locationLine: "Downtown Innovation Hub",
      ctaLine: "Register free — link in bio",
    }
    const seeds = ["hackathon-alpha", "hackathon-bravo", "hackathon-charlie"]

    // Eyeball-report which axes actually differ per seed, straight from the
    // same pure pickAxis() the template itself uses — a cheap, honest way to
    // confirm this isn't a no-op before even looking at the PNGs.
    const HEADLINE_ALIGNMENTS = ["left", "center", "stacked-banner"] as const
    const COMPOSITIONS = ["type-dominant", "element-dominant", "split"] as const
    const BIG_ACCENTS = ["ring", "band", "dots", "blob"] as const
    for (const seed of seeds) {
      console.log(
        `[render-sample-templates] event-poster-v1 axis report seed="${seed}": ` +
          `headlineAlignment=${pickAxis(seed, "headlineAlignment", HEADLINE_ALIGNMENTS)}, ` +
          `composition=${pickAxis(seed, "composition", COMPOSITIONS)}, ` +
          `bigAccent=${pickAxis(seed, "bigAccent", BIG_ACCENTS)}`
      )
    }

    const pngs: Buffer[] = []
    for (const seed of seeds) {
      const png = await renderTemplate({
        templateId: "event-poster-v1",
        colorway: "brand",
        background: { type: "gradient" },
        brandKit: SAMPLE_BRAND_KIT,
        seed,
        fields: hackathonFields,
      })
      assertRealPng(png)
      pngs.push(png)
      const outPath = await renderAndSave(`wave4-hackathon-${seed}`, dir, png)
      console.log(`[render-sample-templates] (a) event-poster-v1 (seed="${seed}") -> ${outPath} (${png.length} bytes)`)
    }

    expect(pngs[0].equals(pngs[1])).toBe(false)
    expect(pngs[0].equals(pngs[2])).toBe(false)
    expect(pngs[1].equals(pngs[2])).toBe(false)
  })

  it("(b) sparse-input promo-v1 (offer field only, rich density) fills the canvas via exactly one fill strategy", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "lumina-template-samples-wave4-sparse-"))
    // No finePrint at all — the only optional field on promo-v1 — so
    // computeDensityMode(...) is always "rich" for this render (see
    // promo-v1.ts's module header). "promo-sparse-2" is a hand-picked seed
    // whose connector axis lands on "none" (verified via pickAxis below) so
    // the fill strategy is guaranteed to actually apply (applyFill requires
    // !useConnector) rather than being silently skipped.
    const seed = "promo-sparse-2"
    const connectorPool = ["none", "none", "none", "scribble-circle", "starburst", "scribble-underline", "curved-arrow"] as const
    const connectorChoice = pickAxis(seed, "connector", connectorPool)
    expect(connectorChoice).toBe("none")
    const firedStrategy = pickFillStrategy(seed)
    console.log(`[render-sample-templates] (b) promo-v1 sparse-fill seed="${seed}" fired fillStrategy="${firedStrategy}"`)

    const png = await renderTemplate({
      templateId: "promo-v1",
      colorway: "brand",
      background: { type: "solid" },
      brandKit: SAMPLE_BRAND_KIT,
      seed,
      fields: {
        offer: "20% OFF",
        offerLine: "Everything in store, this weekend",
        finePrint: "",
      },
    })
    assertRealPng(png)
    const outPath = await renderAndSave(`wave4-promo-sparse-${firedStrategy}`, dir, png)
    console.log(`[render-sample-templates] (b) promo-v1 (seed="${seed}") -> ${outPath} (${png.length} bytes)`)
  })

  it("(c) café promo renders with semantic Tier-B topic elements (vendored coffee/cake icons) — square, per format-density coupling", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "lumina-template-samples-wave4-cafe-"))
    // Unpinned — this is the "café promo square seed" proof: promo-v1's
    // densityMode is always "rich" (only one optional field), so
    // render.ts's format-density coupling (resolveFormat) now keeps the
    // seeded auto-pick on square for this content rather than portrait.
    const png = await renderTemplate({
      templateId: "promo-v1",
      colorway: "brand",
      background: { type: "solid" },
      brandKit: SAMPLE_BRAND_KIT,
      seed: "cafe-promo-elements",
      elements: ["coffee-machine", "cake-slice"],
      fields: {
        offer: "BOGO",
        offerLine: "Buy one latte, get one free — this week only",
        finePrint: "Dine-in only.",
      },
    })
    assertRealPng(png)
    const outPath = await renderAndSave("wave4-cafe-promo-elements-square", dir, png)
    console.log(`[render-sample-templates] (c) promo-v1 with elements=["coffee-machine","cake-slice"] (auto-picked square) -> ${outPath} (${png.length} bytes)`)
  })

  it("(c2) design-review round 2 proof: the SAME café promo copy, explicitly pinned to portrait, must still read full (tall-format mid-band guarantee)", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "lumina-template-samples-wave4-cafe-portrait-"))
    // An explicit size pin always overrides the format-density coupling
    // (real callers — e.g. the Composer's own format picker — can and do
    // request portrait for sparse content) — this is exactly the scenario
    // decorations.ts#midBandFiller exists to cover.
    const png = await renderTemplate({
      templateId: "promo-v1",
      colorway: "brand",
      background: { type: "solid" },
      brandKit: SAMPLE_BRAND_KIT,
      seed: "cafe-promo-elements",
      size: TEMPLATE_SIZES.portrait,
      elements: ["coffee-machine", "cake-slice"],
      fields: {
        offer: "BOGO",
        offerLine: "Buy one latte, get one free — this week only",
        finePrint: "Dine-in only.",
      },
    })
    assertRealPng(png)
    const outPath = await renderAndSave("wave4-cafe-promo-elements-portrait-pinned", dir, png)
    console.log(`[render-sample-templates] (c2) promo-v1 with elements (pinned portrait) -> ${outPath} (${png.length} bytes)`)
  })

  it("(d) connector showcase: event poster with a scribble-circle wrapping the prize badge", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "lumina-template-samples-wave4-connector-"))
    // "probe-seed-2" is a hand-picked seed whose connector axis lands on
    // "scribble-circle" for a render with both `highlight` and `subhead`
    // present (verified via pickAxis below) — the exact pairing rule this
    // proves: a connector wraps ONLY the highlight/price field.
    const seed = "probe-seed-2"
    const connectorPool = [
      "none",
      "none",
      "none",
      "curved-arrow",
      "scribble-underline",
      "scribble-circle",
      "starburst",
    ] as const
    const connectorChoice = pickAxis(seed, "connector", connectorPool)
    expect(["scribble-circle", "starburst", "curved-arrow"]).toContain(connectorChoice)
    console.log(`[render-sample-templates] (d) event-poster-v1 connector showcase seed="${seed}" fired connector="${connectorChoice}"`)

    const png = await renderTemplate({
      templateId: "event-poster-v1",
      colorway: "brand",
      background: { type: "gradient" },
      brandKit: SAMPLE_BRAND_KIT,
      seed,
      fields: {
        eyebrow: "Saturday Night",
        headline: "Trivia Night Championship",
        highlight: "$500 CASH PRIZE",
        subhead: "Six rounds, top team takes it all.",
        dateLine: "Every Thursday, 8pm",
        locationLine: "The Tap Room",
        ctaLine: "Reserve your table",
      },
    })
    assertRealPng(png)
    const outPath = await renderAndSave(`wave4-connector-showcase-${connectorChoice}`, dir, png)
    console.log(`[render-sample-templates] (d) event-poster-v1 (seed="${seed}") -> ${outPath} (${png.length} bytes)`)
  })

  it("(e) design-review fix proof: promo-v1 café with ALL fields filled + elements — balanced full-height fill, no connector", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "lumina-template-samples-wave4-cafe-full-"))
    // "cafe-full-0" is a hand-picked seed whose connector axis lands on
    // "none" (verified via pickAxis below) — isolates the pure
    // space-between vertical-fill layout (top-weighted offer + bottom bar
    // flanking fine print with the element chip cluster) from any
    // connector's own visual interest.
    const seed = "cafe-full-0"
    const connectorPool = ["none", "none", "none", "scribble-circle", "starburst", "scribble-underline", "curved-arrow"] as const
    const connectorChoice = pickAxis(seed, "connector", connectorPool)
    expect(connectorChoice).toBe("none")

    const png = await renderTemplate({
      templateId: "promo-v1",
      colorway: "brand",
      background: { type: "solid" },
      brandKit: SAMPLE_BRAND_KIT,
      seed,
      elements: ["coffee-machine", "cake-slice"],
      fields: {
        offer: "15% OFF",
        offerLine: "All pastries, every weekday morning",
        finePrint: "While supplies last. One per customer.",
      },
    })
    assertRealPng(png)
    const outPath = await renderAndSave("wave4-cafe-promo-all-fields", dir, png)
    console.log(`[render-sample-templates] (e) promo-v1 all-fields (seed="${seed}", connector="${connectorChoice}") -> ${outPath} (${png.length} bytes)`)
  })

  it("(f) design-review round 2 proof: story-format (1080x1920) event poster proves the tall-format mid-band guarantee scales past portrait", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "lumina-template-samples-wave4-story-"))
    // Explicitly pinned to story — event-poster-v1's densest sample content
    // (the hackathon fields) is rich enough it could plausibly auto-pick a
    // tall format on its own, but pinning removes any doubt and directly
    // proves the guarantee at the tallest aspect ratio this catalog ships.
    const seed = "story-format-proof"
    const png = await renderTemplate({
      templateId: "event-poster-v1",
      colorway: "brand",
      background: { type: "gradient" },
      brandKit: SAMPLE_BRAND_KIT,
      seed,
      size: TEMPLATE_SIZES.story,
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
    assertRealPng(png)
    const outPath = await renderAndSave("wave4-event-poster-story-format", dir, png)
    console.log(`[render-sample-templates] (f) event-poster-v1 story-format (seed="${seed}") -> ${outPath} (${png.length} bytes)`)
  })

  it("(g) design-review round 2 proof: sparse-input story-format event poster (no highlight/subhead/location) still fills the mid-band", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "lumina-template-samples-wave4-story-sparse-"))
    // Required fields only — the sparsest case, and the one most likely to
    // land in the "elements-only"/"sparse-plain" branch where nothing else
    // would otherwise occupy the mid-gap.
    const seed = "story-sparse-proof"
    const png = await renderTemplate({
      templateId: "event-poster-v1",
      colorway: "brand",
      background: { type: "gradient" },
      brandKit: SAMPLE_BRAND_KIT,
      seed,
      size: TEMPLATE_SIZES.story,
      fields: {
        headline: "Fresh Bagels Every Morning",
        dateLine: "Every day, 7am–2pm",
        ctaLine: "Stop by today",
      },
    })
    assertRealPng(png)
    const outPath = await renderAndSave("wave4-event-poster-story-sparse", dir, png)
    console.log(`[render-sample-templates] (g) event-poster-v1 story-format sparse (seed="${seed}") -> ${outPath} (${png.length} bytes)`)
  })
})
