// Platform metadata for calendar cards — mirrors the generic-icon convention
// used in src/app/(app)/settings/brain/constants.ts (lucide has no brand
// marks, so each channel gets a calm, representative glyph instead).

import { Camera, Music2, Store, Users2, type LucideIcon } from "lucide-react"

import type { PostPlatform } from "./demo-posts"

export const PLATFORM_META: Record<PostPlatform, { label: string; icon: LucideIcon }> = {
  instagram: { label: "Instagram", icon: Camera },
  facebook: { label: "Facebook", icon: Users2 },
  tiktok: { label: "TikTok", icon: Music2 },
  google_business: { label: "Google Business", icon: Store },
}
