// Shared types for the Content Studio Composer — plain module (no "use
// server"/"use client" directive) so both the server action and client
// components can import from it freely.

export type PostFormat = "single" | "carousel" | "slideshow"

export type Platform = "instagram" | "facebook" | "tiktok" | "google_business"

export const PLATFORMS: Platform[] = ["instagram", "facebook", "tiktok", "google_business"]

export const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  google_business: "Google Business",
}

export type GenerateDraftInput = {
  prompt: string
  format: PostFormat
  platforms: Platform[]
}

export type GeneratedDraft = {
  caption: string
  hashtags: string[]
  imageDescription: string
}
