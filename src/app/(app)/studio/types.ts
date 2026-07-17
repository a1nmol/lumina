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
  /** Present once the draft is persisted to Supabase (real backend only) — required by rate/save-template/queue actions. */
  contentId?: string
  /** Present when fal.ai generated an accompanying image (real backend only). */
  imageUrl?: string
}

/** Returned by generateDraft when the org is out of quota — distinct from a demo/real draft so the composer can show a clear "out of quota" toast instead of treating it as content. */
export type GenerateDraftError = {
  error: "allowance"
  message: string
}

export type GenerateDraftResult = GeneratedDraft | GenerateDraftError
