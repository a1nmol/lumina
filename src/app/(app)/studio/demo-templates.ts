// Canned demo templates for the Templates panel (Sunrise Bakery) — stands in
// for listTemplates() (src/lib/content.ts) so the "Use" → regenerate flow
// works end to end without Supabase configured. Same convention as
// demo-drafts.ts.

import type { Template } from "@/lib/types"

import { PLATFORMS, type Platform, type StudioTemplate } from "./types"

const KNOWN_PLATFORMS = new Set<string>(PLATFORMS)

export const DEMO_TEMPLATES: StudioTemplate[] = [
  {
    id: "demo-template-cinnamon-morning",
    name: "Cinnamon roll morning",
    prompt: "Announce fresh cinnamon rolls out of the oven this morning, warm and ready to go",
    format: "single",
    platforms: ["instagram", "facebook"],
    caption:
      "Fresh out of the oven and ready for you — our cinnamon rolls are best enjoyed still warm, with coffee in hand and a slow morning ahead. Swing by before they're gone!",
    hashtags: ["sunrisebakery", "freshbaked", "cinnamonrolls"],
  },
  {
    id: "demo-template-sourdough-sunday",
    name: "Sourdough Sunday",
    prompt: "Promote this weekend's batch of 24-hour fermented sourdough loaves",
    format: "carousel",
    platforms: ["instagram", "tiktok"],
    caption:
      "Sourdough Sunday is here. 24-hour fermented, hand-shaped, and baked fresh every morning — grab a loaf before we sell out. Your toast just leveled up.",
    hashtags: ["sourdough", "sunrisebakery", "freshbread"],
  },
  {
    id: "demo-template-weekend-recap",
    name: "Weekend behind-the-scenes",
    prompt: "A day-in-the-life slideshow of a Saturday at the bakery, from dough to doors-open",
    format: "slideshow",
    platforms: ["instagram", "tiktok", "facebook"],
    caption:
      "One weekend, one bakery, all the good stuff — cinnamon rolls at dawn, sourdough by noon, and the kids baking class in between. This is a Saturday at Sunrise.",
    hashtags: ["sunrisebakery", "weekendvibes", "localbakery"],
  },
]

/** Maps a persisted Template row (src/lib/content.ts#listTemplates) to the Templates panel's display shape. */
export function mapTemplate(template: Template): StudioTemplate {
  const platforms = template.platforms.filter((platform): platform is Platform =>
    KNOWN_PLATFORMS.has(platform)
  )

  return {
    id: template.id,
    name: template.name,
    prompt: template.prompt ?? "",
    format: template.format,
    platforms: platforms.length > 0 ? platforms : ["instagram"],
    caption: template.caption ?? "",
    hashtags: template.hashtags,
  }
}
