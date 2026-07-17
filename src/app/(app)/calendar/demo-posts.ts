// Demo/seed data for the Calendar/Queue — Sunrise Bakery's scheduled content,
// spread across the current month. Never used for real accounts; gate all
// reads behind isSupabaseConfigured() checks upstream once this is wired to
// Supabase (see src/lib/demo.ts for the same convention).

import { addDays, setHours, setMinutes, startOfMonth } from "date-fns"

export type PostFormat = "single" | "carousel" | "slideshow"
export type PostPlatform = "instagram" | "facebook" | "tiktok" | "google_business"
export type PostStatus = "scheduled" | "posted" | "draft"

export type DemoPost = {
  id: string
  /** ISO datetime — the scheduled (or posted) moment. */
  date: string
  /** Full caption; cards only ever show a snippet. */
  caption: string
  format: PostFormat
  platforms: PostPlatform[]
  /** Hue (0-360) driving the brand-consistent gradient thumbnail. */
  thumbnailHue: number
  status: PostStatus
}

/**
 * `DemoPost` doubles as the shared display shape every calendar view (Month/
 * Week/Queue/PostCard) renders — both the demo seed data below AND real
 * Supabase content_items mapped by ./map-content-item.ts. `CalendarPost` is
 * just a more honest name to reach for at real-data call sites; it's the
 * exact same type.
 */
export type CalendarPost = DemoPost

/** Anchors demo dates to whatever month the app happens to run in. */
function dayAt(offsetFromMonthStart: number, hour: number, minute = 0): string {
  const day = addDays(startOfMonth(new Date()), offsetFromMonthStart)
  return setMinutes(setHours(day, hour), minute).toISOString()
}

export const DEMO_POSTS: DemoPost[] = [
  {
    id: "post-1",
    date: dayAt(1, 8, 30),
    caption:
      "Fresh sourdough just came out of the oven — crackly crust, open crumb, ready by 9am. Come grab a loaf before they're gone!",
    format: "single",
    platforms: ["instagram", "facebook"],
    thumbnailHue: 28,
    status: "posted",
  },
  {
    id: "post-2",
    date: dayAt(3, 12, 0),
    caption:
      "Weekend special: buy a dozen cinnamon rolls, get a free coffee subscription trial. Tag a friend who needs this in their life.",
    format: "carousel",
    platforms: ["instagram", "tiktok"],
    thumbnailHue: 340,
    status: "posted",
  },
  {
    id: "post-3",
    date: dayAt(4, 9, 0),
    caption:
      "Behind the scenes: our 24-hour fermentation process, from mix to bake. A little patience makes a big difference.",
    format: "slideshow",
    platforms: ["tiktok", "instagram"],
    thumbnailHue: 200,
    status: "posted",
  },
  {
    id: "post-6",
    date: dayAt(6, 15, 0),
    caption: "Draft: birthday cake flavor poll — pick our next seasonal special.",
    format: "single",
    platforms: ["instagram"],
    thumbnailHue: 300,
    status: "draft",
  },
  {
    id: "post-4",
    date: dayAt(8, 10, 0),
    caption:
      "Kids Baking Class this Saturday at 10am! 8 spots left — ages 6-12 roll up their sleeves and decorate their own cupcakes.",
    format: "single",
    platforms: ["facebook", "google_business"],
    thumbnailHue: 95,
    status: "scheduled",
  },
  {
    id: "post-5",
    date: dayAt(11, 7, 30),
    caption:
      "New this month: vegan chocolate loaf, baked fresh daily. Dairy-free, egg-free, still ridiculously moist.",
    format: "carousel",
    platforms: ["instagram", "facebook", "google_business"],
    thumbnailHue: 20,
    status: "scheduled",
  },
  {
    id: "post-7",
    date: dayAt(14, 11, 0),
    caption:
      "Catering season is here — mixed pastry trays for your next office meeting or family gathering. 24hr notice, we've got you.",
    format: "single",
    platforms: ["facebook"],
    thumbnailHue: 250,
    status: "scheduled",
  },
  {
    id: "post-8",
    date: dayAt(17, 9, 0),
    caption:
      "Meet the baker: Dana has been perfecting our cinnamon roll recipe for six years and counting. Ask her your dough questions today.",
    format: "slideshow",
    platforms: ["instagram", "tiktok", "facebook"],
    thumbnailHue: 160,
    status: "scheduled",
  },
  {
    id: "post-9",
    date: dayAt(21, 8, 0),
    caption:
      "Coffee subscription reminder: this week's roast is a bright Ethiopian single-origin. Subscribers get first pick.",
    format: "single",
    platforms: ["instagram", "google_business"],
    thumbnailHue: 60,
    status: "scheduled",
  },
  {
    id: "post-10",
    date: dayAt(24, 13, 0),
    caption:
      "Draft: end-of-summer flavor lineup teaser — needs final photos before it goes out.",
    format: "carousel",
    platforms: ["instagram"],
    thumbnailHue: 15,
    status: "draft",
  },
  {
    id: "post-11",
    date: dayAt(27, 9, 30),
    caption:
      "Local delivery reminder: orders over $30 within 5 miles ship free — just say the word when you order.",
    format: "single",
    platforms: ["facebook", "google_business"],
    thumbnailHue: 220,
    status: "scheduled",
  },
]
