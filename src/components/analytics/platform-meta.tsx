// Platform glyph metadata for Analytics — mirrors the generic-icon convention
// in src/app/(app)/calendar/platform.ts (lucide has no brand marks, so each
// platform gets a calm, representative glyph). Kept local to this feature
// dir rather than importing the calendar-scoped module, since content-item
// `platforms` here arrive as loose `string[]` (see LoopPostSummary/PostMetrics
// in src/lib/types.ts), not the calendar's narrower `PostPlatform` union.

import { Camera, Globe2, Music2, Store, Users2, type LucideIcon } from "lucide-react"

const KNOWN_PLATFORM_META: Record<string, { label: string; icon: LucideIcon }> = {
  instagram: { label: "Instagram", icon: Camera },
  facebook: { label: "Facebook", icon: Users2 },
  tiktok: { label: "TikTok", icon: Music2 },
  google_business: { label: "Google Business", icon: Store },
  google: { label: "Google", icon: Store },
}

const FALLBACK_PLATFORM_META = { label: "Other", icon: Globe2 }

export function platformMeta(platform: string): { label: string; icon: LucideIcon } {
  return KNOWN_PLATFORM_META[platform] ?? FALLBACK_PLATFORM_META
}

/** First platform in the list (or the fallback glyph if the post has none) — used for the primary badge on a card face. */
export function primaryPlatformMeta(platforms: string[]): { label: string; icon: LucideIcon } {
  const [first] = platforms
  return first ? platformMeta(first) : FALLBACK_PLATFORM_META
}
