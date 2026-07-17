// Canned demo outputs for the Content Studio Composer, keyed by format.
// Stands in for the real OpenRouter/fal.ai pipeline (see actions.ts) so the
// whole generate → edit → queue flow works end to end without API keys.
// Copy is written for Sunrise Bakery (src/lib/demo.ts DEMO_BUSINESS_BRAIN).

import type { GeneratedDraft, PostFormat } from "./types"

const SINGLE_DRAFTS: GeneratedDraft[] = [
  {
    caption:
      "Fresh out of the oven and ready for you — our cinnamon rolls are best enjoyed still warm, with coffee in hand and a slow morning ahead. Swing by before they're gone!",
    hashtags: ["sunrisebakery", "freshbaked", "cinnamonrolls", "neighborhoodbakery", "morningcoffee"],
    imageDescription: "Close-up of a glazed cinnamon roll on a wooden board, steam rising, warm morning light",
  },
  {
    caption:
      "Sourdough Sunday is here. 24-hour fermented, hand-shaped, and baked fresh every morning — grab a loaf before we sell out. Your toast just leveled up.",
    hashtags: ["sourdough", "sunrisebakery", "freshbread", "bakedaily", "smallbusiness"],
    imageDescription: "Rustic sourdough loaf with a golden crust, flour dusted, sliced open showing the crumb",
  },
  {
    caption:
      "Birthdays deserve a cake made just for them. Tell us the flavor, the colors, the vibe — we'll handle the rest. 48 hours notice and it's yours.",
    hashtags: ["customcakes", "birthdaycake", "sunrisebakery", "madewithlove", "localbakery"],
    imageDescription: "Custom birthday cake with pastel buttercream swirls and a candle, on a cafe table",
  },
]

const CAROUSEL_DRAFTS: GeneratedDraft[] = [
  {
    caption:
      "A little behind-the-scenes: dough at 5am, ovens by 6, doors open at 7. Swipe through our morning bake — every loaf and roll made from scratch, every single day.",
    hashtags: ["behindthescenes", "sunrisebakery", "freshdaily", "bakerylife", "smallbusiness"],
    imageDescription: "Bakery kitchen at sunrise — flour-dusted hands shaping dough, trays sliding into the oven",
  },
  {
    caption:
      "Meet the lineup: cinnamon rolls, sourdough, and our catering trays — perfect for the office, a party, or just because. Swipe to see what's fresh this week.",
    hashtags: ["bakerymenu", "sunrisebakery", "catering", "freshbaked", "treatyourself"],
    imageDescription: "A spread of pastries, sourdough loaves, and a catering tray arranged on a marble counter",
  },
]

const SLIDESHOW_DRAFTS: GeneratedDraft[] = [
  {
    caption:
      "One weekend, one bakery, all the good stuff — cinnamon rolls at dawn, sourdough by noon, and the kids baking class in between. This is a Saturday at Sunrise.",
    hashtags: ["sunrisebakery", "weekendvibes", "localbakery", "bakedwithlove", "communitystaple"],
    imageDescription: "A day-in-the-life montage — dough, ovens, the storefront, kids decorating cookies",
  },
  {
    caption:
      "From our oven to your table in under an hour. Here's what fresh really looks like — watch the whole batch come together.",
    hashtags: ["freshbaked", "sunrisebakery", "bakingprocess", "smallbusiness", "neighborhoodfavorite"],
    imageDescription: "Time-lapse style shots of pastries rising, baking, and being boxed up for the counter",
  },
]

const DRAFTS_BY_FORMAT: Record<PostFormat, GeneratedDraft[]> = {
  single: SINGLE_DRAFTS,
  carousel: CAROUSEL_DRAFTS,
  slideshow: SLIDESHOW_DRAFTS,
}

/**
 * Deterministic-ish pick so the same prompt tends to surface variety across
 * repeated "Generate"/"Regenerate" calls, without needing real randomness
 * plumbed through a server action. Falls back to Date.now() jitter when the
 * prompt is empty.
 */
export function pickCannedDraft(format: PostFormat, prompt: string, attempt = 0): GeneratedDraft {
  const pool = DRAFTS_BY_FORMAT[format]
  const seed = prompt.trim().length > 0 ? prompt.trim().length : Date.now()
  // Modulo-safe: JS `%` can return a negative remainder for negative operands,
  // and `seed + attempt` shouldn't be negative today but this keeps the index
  // valid even if that invariant ever slips.
  const index = (((seed + attempt) % pool.length) + pool.length) % pool.length
  return pool[index]
}
