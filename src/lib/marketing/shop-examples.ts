// Per-vertical example content for the "Pick your shop" section
// (docs/design-briefs/landing-copy.md §12; brand-redesign-plan.md §5.9).
// Switching the shop tab swaps: the shop-picker's own hero-style post/demo
// preview, the Problem section's "missed DM" row, and the outcome cards'
// small demo line — while every VERBATIM copy-deck string elsewhere on the
// page (headlines, body copy, the hero's fixed cake-DM loop) stays exactly
// as written. Plausible, specific examples per vertical, not placeholders.
//
// `icon` replaces the previous `emoji: string` field (readability-audit
// build report, "remove all emoji" pass) — same Lucide set trust-bar.tsx
// already uses per vertical (Croissant/Scissors/Wrench/Coffee), so the
// picker tabs and this file's icon language stay consistent.

import { Coffee, Croissant, Scissors, Wrench, type LucideIcon } from "lucide-react"

export type ShopVerticalId = "bakery" | "salon" | "plumber" | "cafe"

export interface ShopExample {
  id: ShopVerticalId
  label: string
  icon: LucideIcon
  /** Shown in the shop-picker's own post-preview chip + the "Get known" outcome card. */
  postCaption: string
  postMeta: string
  /** The DM/text bubble shown in the Problem section's missed-items phone card. */
  missedQuestion: string
  /** Booking chip shown in the shop-picker demo + the "Get booked" outcome card. */
  bookedExample: string
  /** One-line "while you slept" style stat for the "Get your evenings back" outcome card. */
  eveningsExample: string
}

export const SHOP_EXAMPLES: ShopExample[] = [
  {
    id: "bakery",
    label: "Bakery",
    icon: Croissant,
    postCaption: "Fresh sourdough out at 7. The first loaf's crackle is for the early birds.",
    postMeta: "Queued for 8:00 AM",
    missedQuestion: "Do you do birthday cakes for Saturday?",
    bookedExample: "Sat 10:00 AM · Cake pickup",
    eveningsExample: "2 leads · 1 booking (Sat 10:00 AM) · 1 five-star review",
  },
  {
    id: "salon",
    label: "Salon",
    icon: Scissors,
    postCaption: "Balayage today — walk-ins welcome after 2pm.",
    postMeta: "Queued for 9:30 AM",
    missedQuestion: "Do you have Saturday appointments?",
    bookedExample: "Sat 1:30 PM · Balayage + trim",
    eveningsExample: "3 leads · 2 bookings (Sat) · 1 five-star review",
  },
  {
    id: "plumber",
    label: "Plumber",
    icon: Wrench,
    postCaption: "Water heater tune-ups this week — book before the cold snap.",
    postMeta: "Queued for 7:00 AM",
    missedQuestion: "Emergency — burst pipe, can you come today?",
    bookedExample: "Today 2:00 PM · Emergency call",
    eveningsExample: "1 emergency lead · 1 booking (Today 2:00 PM) · 1 five-star review",
  },
  {
    id: "cafe",
    label: "Café",
    icon: Coffee,
    postCaption: "New oat-milk latte art on the menu — come say hi.",
    postMeta: "Queued for 6:30 AM",
    missedQuestion: "Do you cater office meetings?",
    bookedExample: "Fri 9:00 AM · Catering drop-off",
    eveningsExample: "2 leads · 1 booking (Fri 9:00 AM) · 1 five-star review",
  },
]

export const DEFAULT_SHOP_VERTICAL: ShopVerticalId = "bakery"

export function getShopExample(id: ShopVerticalId): ShopExample {
  return SHOP_EXAMPLES.find((example) => example.id === id) ?? SHOP_EXAMPLES[0]
}
