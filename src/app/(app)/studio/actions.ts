"use server"

// Server actions for the Content Studio Composer.
//
// generateDraft: when Supabase + OpenRouter are configured, calls through the
// shared model router (src/lib/ai/generate-content.ts) + fal.ai
// (src/lib/ai/generate-image.ts) and persists the result via
// src/lib/content.ts. Falls back to a canned demo draft whenever either
// isn't configured, or the model can't produce usable JSON — see
// docs/backend-notes.md for the full seam description. A real quota denial
// (AllowanceDeniedError) is NOT a demo fallback — it's surfaced to the
// composer as a typed { error: "allowance" } result.
//
// rateDraft / saveDraftAsTemplate / addToQueue persist the Composer's
// action-row buttons once a draft has been generated; all are demo-safe
// no-ops (returning { ok: true }) when Supabase isn't configured.

import { AllowanceDeniedError } from "@/lib/ai/errors"
import { generateContentDraft, type GeneratedContentDraft } from "@/lib/ai/generate-content"
import { generateImage, isFalConfigured } from "@/lib/ai/generate-image"
import { isOpenRouterConfigured } from "@/lib/ai/openrouter"
import {
  queueContentItem,
  rateContentItem,
  saveContentItem,
  saveSlideshowMediaAsset,
  saveTemplate,
} from "@/lib/content"
import { FfmpegMissingError, renderSlideshow, type SlideshowSource } from "@/lib/media/slideshow"
import { getCurrentOrgId } from "@/lib/org"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import type { ContentRating } from "@/lib/types"

import { getBusinessBrain } from "@/app/(app)/settings/brain/actions"

import { pickCannedDraft } from "./demo-drafts"
import {
  PLATFORMS,
  type GeneratedDraft,
  type GenerateDraftInput,
  type GenerateDraftResult,
  type Platform,
  type PostFormat,
} from "./types"

const FORMATS: PostFormat[] = ["single", "carousel", "slideshow"]
const MAX_PROMPT_LENGTH = 2000
const MAX_TEMPLATE_NAME_LENGTH = 48
const SIMULATED_LATENCY_MS = 1200
const OUT_OF_QUOTA_MESSAGE = "You've hit this month's generation limit"

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isValidInput(input: GenerateDraftInput): boolean {
  if (typeof input.prompt !== "string" || input.prompt.length > MAX_PROMPT_LENGTH) return false
  if (!FORMATS.includes(input.format)) return false
  if (!Array.isArray(input.platforms) || input.platforms.length === 0) return false
  return input.platforms.every((platform) => PLATFORMS.includes(platform))
}

/** `attempt` must be a non-negative integer — it indexes into a fixed canned-draft pool. */
function isValidAttempt(attempt: number): boolean {
  return Number.isInteger(attempt) && attempt >= 0
}

/**
 * Attempts real generation (content + optional image + persistence). Returns
 * null when not configured, no resolvable org, or the model couldn't produce
 * usable JSON — all of which mean "fall back to the demo draft". Throws
 * nothing except by letting AllowanceDeniedError propagate to the caller,
 * which maps it to a typed { error: "allowance" } result.
 */
async function tryRealGeneration(input: GenerateDraftInput): Promise<GeneratedDraft | null> {
  if (!isSupabaseConfigured() || !isOpenRouterConfigured()) return null

  const orgId = await getCurrentOrgId()
  if (!orgId) return null

  const businessBrain = await getBusinessBrain()

  const generated: GeneratedContentDraft | null = await generateContentDraft({
    orgId,
    businessBrain,
    prompt: input.prompt,
    format: input.format,
    platforms: input.platforms,
  })

  if (!generated) return null

  // Image generation is best-effort: never let a fal.ai failure (including a
  // quota denial on the separate "images" allowance) block an otherwise-good
  // caption/hashtag draft from being returned.
  let imageUrl: string | undefined
  if (isFalConfigured()) {
    try {
      const image = await generateImage({ orgId, prompt: generated.imageDescription })
      imageUrl = image?.url
    } catch {
      imageUrl = undefined
    }
  }

  const saved = await saveContentItem(orgId, {
    prompt: input.prompt,
    caption: generated.caption,
    hashtags: generated.hashtags,
    format: input.format,
    platforms: input.platforms,
    imageDescription: generated.imageDescription,
    mediaUrls: imageUrl ? [imageUrl] : [],
    model: generated.model,
    costUsd: generated.costUsd,
    status: "draft",
  })

  return {
    caption: generated.caption,
    hashtags: generated.hashtags,
    imageDescription: generated.imageDescription,
    contentId: saved?.id,
    imageUrl,
  }
}

/**
 * Generates (in demo mode: picks a canned) post draft for the Composer.
 * `attempt` lets the client ask for a *different* variant on "Regenerate"
 * without changing the prompt.
 */
export async function generateDraft(
  input: GenerateDraftInput,
  attempt = 0
): Promise<GenerateDraftResult> {
  if (!isValidInput(input)) {
    throw new Error("generateDraft: invalid input")
  }
  if (!isValidAttempt(attempt)) {
    throw new Error("generateDraft: invalid attempt")
  }

  try {
    const real = await tryRealGeneration(input)
    if (real) return real
  } catch (error) {
    if (error instanceof AllowanceDeniedError) {
      return { error: "allowance", message: error.message || OUT_OF_QUOTA_MESSAGE }
    }
    throw error
  }

  await sleep(SIMULATED_LATENCY_MS)
  return pickCannedDraft(input.format, input.prompt, attempt)
}

export interface RateDraftResult {
  ok: boolean
}

/** Sets a persisted draft's 👍/👎 rating. Demo-safe no-op when unconfigured or the draft was never persisted. */
export async function rateDraft(
  contentId: string | undefined,
  rating: ContentRating
): Promise<RateDraftResult> {
  if (!isSupabaseConfigured() || !contentId) return { ok: true }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: true }

  try {
    await rateContentItem(orgId, contentId, rating)
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

/** Trims + shortens a prompt into a template name; falls back to a generic name for an empty prompt. */
function deriveTemplateName(prompt: string): string {
  const trimmed = prompt.trim().replace(/\s+/g, " ")
  if (!trimmed) return "Untitled template"
  return trimmed.length > MAX_TEMPLATE_NAME_LENGTH
    ? `${trimmed.slice(0, MAX_TEMPLATE_NAME_LENGTH).trimEnd()}…`
    : trimmed
}

export interface SaveDraftAsTemplateInput {
  contentId?: string
  prompt: string
  format: PostFormat
  platforms: Platform[]
  draft: GeneratedDraft
  name?: string
}

export interface SaveDraftAsTemplateResult {
  ok: boolean
  name: string
}

/** Saves the current draft as a reusable template. Demo-safe no-op when unconfigured. */
export async function saveDraftAsTemplate(
  input: SaveDraftAsTemplateInput
): Promise<SaveDraftAsTemplateResult> {
  const name = input.name?.trim() || deriveTemplateName(input.prompt)

  if (!isSupabaseConfigured()) return { ok: true, name }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: true, name }

  try {
    await saveTemplate(orgId, {
      name,
      sourceContentId: input.contentId ?? null,
      prompt: input.prompt,
      caption: input.draft.caption,
      hashtags: input.draft.hashtags,
      format: input.format,
      platforms: input.platforms,
    })
    return { ok: true, name }
  } catch {
    return { ok: false, name }
  }
}

/** Next local 9:00 AM — today if it hasn't passed yet, otherwise tomorrow. */
function nextNineAmIso(): string {
  const now = new Date()
  const next = new Date(now)
  next.setHours(9, 0, 0, 0)
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1)
  }
  return next.toISOString()
}

export interface AddToQueueInput {
  contentId?: string
  prompt: string
  format: PostFormat
  platforms: Platform[]
  draft: GeneratedDraft
  scheduledAt?: string
}

export interface AddToQueueResult {
  ok: boolean
  scheduledAt?: string
}

/** Adds the current draft to the queue (persisting it first if it wasn't already saved). Demo-safe no-op when unconfigured. */
export async function addToQueue(input: AddToQueueInput): Promise<AddToQueueResult> {
  const scheduledAt = input.scheduledAt ?? nextNineAmIso()

  if (!isSupabaseConfigured()) return { ok: true, scheduledAt }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: true, scheduledAt }

  try {
    let contentId = input.contentId
    if (!contentId) {
      const saved = await saveContentItem(orgId, {
        prompt: input.prompt,
        caption: input.draft.caption,
        hashtags: input.draft.hashtags,
        format: input.format,
        platforms: input.platforms,
        imageDescription: input.draft.imageDescription,
        mediaUrls: input.draft.imageUrl ? [input.draft.imageUrl] : [],
        status: "draft",
      })
      contentId = saved?.id
    }

    if (!contentId) return { ok: false }

    const queued = await queueContentItem(orgId, contentId, scheduledAt)
    return { ok: queued !== null, scheduledAt }
  } catch {
    return { ok: false }
  }
}

/**
 * Approximate hex swatches for the DESIGN_SYSTEM.md dataviz chart hues
 * (chart-1 violet / chart-2 teal / chart-3 amber / chart-4 magenta,
 * globals.css). Not a UI token itself — these are plain hex values because
 * they're consumed by FFmpeg's lavfi `color=` source (src/lib/media/slideshow.ts),
 * not rendered as CSS, so they can't reference the oklch CSS custom
 * properties directly.
 */
const BRAND_HUE_COLORS = ["#6D4AFF", "#3FA79E", "#D9A441", "#C24F97"] as const

/** Real fal.ai image (if the draft has one) as slide 1, padded to 4 slides with brand-hue placeholders; else 4 placeholders. */
function buildSlideshowSources(draft: GeneratedDraft): SlideshowSource[] {
  if (draft.imageUrl) {
    return [draft.imageUrl, ...BRAND_HUE_COLORS.slice(0, 3).map((color) => ({ color }))]
  }
  return BRAND_HUE_COLORS.map((color) => ({ color }))
}

export type RenderSlideshowResult =
  | { videoUrl: string; durationSec: number }
  | { error: "allowance"; message: string }
  | { error: "ffmpeg-missing"; message: string }
  | { error: "render"; message: string }

/**
 * Renders the current draft's image (or brand-hue placeholders, in demo
 * mode / when no image exists) into a slideshow MP4 via
 * src/lib/media/slideshow.ts, served back from /api/slideshow/[id]. A real
 * quota denial or a missing ffmpeg binary are surfaced as typed errors, not
 * silently swallowed, so the composer can show the right toast.
 */
export async function renderSlideshowAction(draft: GeneratedDraft): Promise<RenderSlideshowResult> {
  const orgId = await getCurrentOrgId()
  // renderSlideshow's metering (checkAllowance/recordUsage) already no-ops
  // in demo mode regardless of orgId value, so any stable placeholder works
  // when there's no signed-in org to resolve.
  const resolvedOrgId = orgId ?? "demo-org"

  try {
    const result = await renderSlideshow({
      orgId: resolvedOrgId,
      images: buildSlideshowSources(draft),
    })

    if (isSupabaseConfigured() && orgId) {
      await saveSlideshowMediaAsset(orgId, { ...result, contentId: draft.contentId }).catch(() => {})
    }

    return { videoUrl: `/api/slideshow/${result.id}`, durationSec: result.durationSec }
  } catch (error) {
    if (error instanceof AllowanceDeniedError) {
      return { error: "allowance", message: error.message || "You've hit this month's slideshow limit" }
    }
    if (error instanceof FfmpegMissingError) {
      return {
        error: "ffmpeg-missing",
        message: "Video rendering isn't available on this server yet (ffmpeg is missing).",
      }
    }
    return { error: "render", message: "Couldn't render the slideshow. Please try again." }
  }
}
