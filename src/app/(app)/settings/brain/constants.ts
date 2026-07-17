// Shared constants for the Business Brain wizard — single source so step
// components and the orchestrator never drift out of sync.

import { Camera, Mail, MessageSquare, Store, Users2, type LucideIcon } from "lucide-react"

export const WIZARD_STEPS = [
  { id: "basics", label: "Basics" },
  { id: "hours", label: "Hours & Services" },
  { id: "voice", label: "Voice & Brand" },
  { id: "channels", label: "Channels" },
] as const

export type WizardStepId = (typeof WIZARD_STEPS)[number]["id"]

export const CATEGORY_OPTIONS = [
  "Bakery & Cafe",
  "Restaurant",
  "Salon & Spa",
  "Auto Repair",
  "Retail Store",
  "Home Services",
  "Fitness Studio",
  "Professional Services",
  "Other",
] as const

export const TONE_OPTIONS: { id: string; label: string; example: string }[] = [
  {
    id: "friendly",
    label: "Friendly",
    example: "“Fresh cinnamon rolls just came out of the oven — come say hi!”",
  },
  {
    id: "professional",
    label: "Professional",
    example: "“We're pleased to announce extended weekend hours starting this Saturday.”",
  },
  {
    id: "playful",
    label: "Playful",
    example: "“Warning: these cinnamon rolls may cause happy dances. You've been warned.”",
  },
  {
    id: "premium",
    label: "Premium",
    example: "“Crafted daily with imported butter and slow fermentation. Reserve yours.”",
  },
]

/** Fixed 8-swatch brand palette — hue-spaced to echo the app's own dataviz tokens. */
export const BRAND_PALETTE: { name: string; hex: string }[] = [
  { name: "Violet", hex: "#6D5EF3" },
  { name: "Teal", hex: "#0EA5B7" },
  { name: "Amber", hex: "#E1A73B" },
  { name: "Pink", hex: "#D6478D" },
  { name: "Green", hex: "#34A853" },
  { name: "Blue", hex: "#3B82F6" },
  { name: "Coral", hex: "#F97350" },
  { name: "Slate", hex: "#64748B" },
] as const

export const CHANNEL_OPTIONS: {
  key: "google_business" | "instagram" | "facebook" | "sms" | "email"
  label: string
  icon: LucideIcon
}[] = [
  { key: "google_business", label: "Google Business", icon: Store },
  { key: "instagram", label: "Instagram", icon: Camera },
  { key: "facebook", label: "Facebook", icon: Users2 },
  { key: "sms", label: "SMS", icon: MessageSquare },
  { key: "email", label: "Email", icon: Mail },
]

export const DAY_ORDER: { key: string; label: string }[] = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" },
]

/**
 * Best-effort match of a stored tone value back to one of the four tone
 * option ids. Handles both the exact id the wizard itself now stores and
 * older/free-text tone strings (e.g. seeded demo data) by substring-matching
 * the option label. Returns the matching option's id.
 */
export function inferTone(tone: string | null): string {
  if (tone) {
    const lower = tone.toLowerCase()
    const idMatch = TONE_OPTIONS.find((option) => option.id === lower)
    if (idMatch) return idMatch.id
    const labelMatch = TONE_OPTIONS.find((option) => lower.includes(option.label.toLowerCase()))
    if (labelMatch) return labelMatch.id
  }
  return TONE_OPTIONS[0].id
}
