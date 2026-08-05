"use server"

// Server actions for the Content Studio Composer.
//
// generateDraft:
// - Supabase not configured (true demo mode): returns a canned demo draft
//   (pickCannedDraft, written for the demo Sunrise Bakery org) after a short
//   simulated delay.
// - Supabase configured: calls through the shared model router
//   (src/lib/ai/generate-content.ts) + fal.ai (src/lib/ai/generate-image.ts)
//   and persists the result via src/lib/content.ts when OpenRouter is
//   configured and produces usable JSON. When OpenRouter isn't configured,
//   there's no resolvable org, or the model can't produce usable JSON, it
//   falls back to groundedFallbackDraft — a real draft built from the org's
//   OWN Business Brain data, never the demo bakery's fictional copy. See
//   docs/backend-notes.md for the full seam description. A real quota denial
//   (AllowanceDeniedError) is NOT a fallback case — it's surfaced to the
//   composer as a typed { error: "allowance" } result.
//
// rateDraft / saveDraftAsTemplate / addToQueue persist the Composer's
// action-row buttons once a draft has been generated; all are demo-safe
// no-ops (returning { ok: true }) when Supabase isn't configured.

import { randomUUID } from "node:crypto"
import { AllowanceDeniedError } from "@/lib/ai/errors"
import { designPost } from "@/lib/ai/design-post"
import { generateContentDraft, refineCaption, type GeneratedContentDraft } from "@/lib/ai/generate-content"
import { generateImage, isFalConfigured } from "@/lib/ai/generate-image"
import { isOpenRouterConfigured } from "@/lib/ai/openrouter"
import {
  deleteTemplate,
  getContentItem,
  queueContentItem,
  rateContentItem,
  saveContentItem,
  saveRenderedPosterAsset,
  saveSlideshowMediaAsset,
  saveTemplate,
} from "@/lib/content"
import {
  cleanupSlideshowWorkDir,
  FfmpegMissingError,
  renderSlideshow,
  SlideshowBusyError,
  type SlideshowSource,
} from "@/lib/media/slideshow"
import { getCurrentOrgId } from "@/lib/org"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import { renderTemplate, type RenderBackgroundInput } from "@/lib/templates/render"
import { recordUsage } from "@/lib/usage"
import type { BusinessBrain, ContentRating } from "@/lib/types"

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
 * The code-rendered template pipeline for a single-image post: designPost
 * (pick a template + write field copy — src/lib/ai/design-post.ts) ->
 * optionally generate a text-free AI background photo (fal.ai) -> renderTemplate
 * (src/lib/templates/render.ts, Satori+resvg+sharp) -> upload the flattened
 * PNG exactly where a raw generated image would otherwise go. Returns
 * undefined (never throws) when designPost itself says "not available" (demo
 * mode, no OpenRouter, or the model couldn't produce usable JSON) — that's
 * not a failure, it's "nothing to render yet", so the caller falls through
 * to the raw-image path below. A real render/upload failure IS caught here
 * and logged, then also falls through — a template render is strictly an
 * upgrade over the old raw-image path, never a way to lose the image
 * entirely.
 */
async function tryTemplateRenderedPoster(params: {
  orgId: string
  prompt: string
  businessBrain: BusinessBrain | null
}): Promise<string | undefined> {
  const designed = await designPost({ orgId: params.orgId, prompt: params.prompt, businessBrain: params.businessBrain })
  if (!designed) return undefined

  // Owner product law (memory: graphics-style-rules): AI-image poster
  // backgrounds are banned — flat color/gradient/shape compositions only.
  // designPost no longer offers photo_ai; this coercion guards against any
  // stale/misparsed value ever reaching the renderer.
  const background: RenderBackgroundInput = {
    type: designed.background.type === "photo_ai" ? "gradient" : designed.background.type,
  }

  const png = await renderTemplate({
    templateId: designed.templateId,
    fields: designed.fields,
    colorway: designed.colorway,
    background,
    theme: designed.theme ?? undefined,
    elements: designed.elements,
    brandKit: params.businessBrain?.brand_kit ?? null,
    // Fresh seed per render: accent-arrangement variety across
    // generations (and honest variety on Regenerate). Tests use fixed
    // seeds for determinism; production wants difference.
    seed: randomUUID(),
  })

  const publicUrl = await saveRenderedPosterAsset(params.orgId, { bytes: png, templateId: designed.templateId })
  if (!publicUrl) throw new Error("Rendered poster PNG failed to upload to Storage")

  // Records the code-render step itself (distinct from the background
  // photo's own "images" event above, which — if it happened — already
  // carried the real fal.ai dollar cost). This event's cost is $0 (the
  // render itself is local CPU, like src/lib/media/slideshow.ts's own
  // units:1/cost:0 pattern) — it exists so a template-rendered poster still
  // consumes one unit of the org's "images" allowance, same as the raw-image
  // path it replaces.
  await recordUsage(params.orgId, {
    feature: "images",
    model: "template-render",
    units: 1,
    costUsd: 0,
    metadata: { templateId: designed.templateId, background: designed.background.type },
  })

  return publicUrl
}

/** Single-image post art: tries the code-rendered template pipeline first, silently falling back to the old raw fal.ai image on any failure (never blocks the draft). */
async function generateSingleImagePost(params: {
  orgId: string
  prompt: string
  businessBrain: BusinessBrain | null
  rawImageDescription: string
}): Promise<string | undefined> {
  try {
    const rendered = await tryTemplateRenderedPoster(params)
    if (rendered) return rendered
  } catch (error) {
    console.error(
      `[studio] Template-rendered poster failed, falling back to raw image generation: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }

  if (!isFalConfigured()) return undefined
  try {
    const image = await generateImage({ orgId: params.orgId, prompt: params.rawImageDescription })
    return image?.url
  } catch {
    return undefined
  }
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

  // Image generation is best-effort: never let a rendering/fal.ai failure
  // (including a quota denial on the separate "images" allowance) block an
  // otherwise-good caption/hashtag draft from being returned. Single-image
  // posts get the code-rendered template treatment (real typography, not
  // raw diffusion text) with the old raw-image path kept as a silent
  // fallback; carousel/slideshow formats are unaffected and keep using the
  // raw fal.ai image directly (a template is one flattened poster, not
  // several slides).
  let imageUrl: string | undefined
  if (input.format === "single") {
    imageUrl = await generateSingleImagePost({
      orgId,
      prompt: input.prompt,
      businessBrain,
      rawImageDescription: generated.imageDescription,
    })
  } else if (isFalConfigured()) {
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

const NO_OPENROUTER_PREFIX = "Add your OpenRouter key to generate posts — here's a starter:"
const GENERIC_VERTICAL_HASHTAGS = ["smallbusiness", "shoplocal", "supportlocal"]
const MAX_FALLBACK_HASHTAGS = 5
// Small rotation so "Regenerate" on the fallback path isn't a dead click —
// it still reads as one honest, grounded draft, just phrased differently.
const FALLBACK_CLOSERS = [
  "Stop by or reach out — we'd love to help.",
  "We'd love to see you soon.",
  "Reach out anytime — happy to help.",
]

function capitalizeFirst(value: string): string {
  return value.length > 0 ? value[0].toUpperCase() + value.slice(1) : value
}

function slugifyHashtag(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 30)
}

/** Real, honest hashtags from the org's own name/category — never fictional demo copy. */
function deriveFallbackHashtags(businessName: string | null, category: string | null): string[] {
  const tags = new Set<string>()
  const businessSlug = businessName ? slugifyHashtag(businessName) : ""
  if (businessSlug) tags.add(businessSlug)
  const categorySlug = category ? slugifyHashtag(category) : ""
  if (categorySlug) tags.add(categorySlug)
  for (const tag of GENERIC_VERTICAL_HASHTAGS) {
    if (tags.size >= MAX_FALLBACK_HASHTAGS) break
    tags.add(tag)
  }
  return Array.from(tags)
}

/**
 * A graceful, non-AI fallback draft for when Supabase is configured but a
 * real AI draft couldn't be produced (OpenRouter not configured, no
 * resolvable org, or the model failed to return usable JSON). Mirrors
 * src/app/(app)/inbox/actions.ts's groundedFallbackDraft: built from the
 * org's own real Business Brain data (business name + top service) rather
 * than serving fictional demo-bakery copy to a real org. When the Brain
 * itself is empty, the caption says so honestly instead of inventing
 * anything, and doubles as a nudge to add an OpenRouter key.
 */
function groundedFallbackDraft(
  input: GenerateDraftInput,
  businessBrain: BusinessBrain | null,
  attempt: number
): GeneratedDraft {
  const businessName = businessBrain?.business_name?.trim() || null
  const topService = businessBrain?.services?.[0]?.name?.trim() || null
  const topic = input.prompt.trim()
  const hashtags = deriveFallbackHashtags(businessName, businessBrain?.category?.trim() || null)
  const closer = FALLBACK_CLOSERS[attempt % FALLBACK_CLOSERS.length]

  if (!businessName && !topService) {
    const subject = topic || "what's new"
    return {
      caption: `${NO_OPENROUTER_PREFIX} "${capitalizeFirst(subject)}" — add a few real details from your Business Brain and you're ready to post!`,
      hashtags,
      imageDescription: topic || "Your business",
    }
  }

  const name = businessName ?? "Your business"
  const parts = [topic ? `${capitalizeFirst(topic)} at ${name}!` : `Something new at ${name}!`]
  if (topService) parts.push(`Ask us about ${topService}.`)
  parts.push(closer)

  return {
    caption: parts.join(" "),
    hashtags,
    imageDescription: topic || topService || name,
  }
}

/**
 * Generates a post draft for the Composer:
 * - Demo mode (Supabase unconfigured): picks a canned draft.
 * - Configured, AI available: a real routed generation.
 * - Configured, AI unavailable for this call: a grounded fallback built from
 *   the org's own Business Brain (see groundedFallbackDraft) — never the
 *   canned demo copy.
 *
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

  if (!isSupabaseConfigured()) {
    await sleep(SIMULATED_LATENCY_MS)
    return pickCannedDraft(input.format, input.prompt, attempt)
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

  const businessBrain = await getBusinessBrain()
  await sleep(SIMULATED_LATENCY_MS)
  return groundedFallbackDraft(input, businessBrain, attempt)
}

// ---------------------------------------------------------------------------
// AI Assist rail (redesign wave R5) — real caption refinement.
//
// Previously the rail (src/components/studio/ai-assist-rail.tsx) applied
// hard-coded string transforms — append a fixed "🥐✨" suffix, append a
// fixed "Made right here in the neighborhood…" sentence — to EVERY caption
// for EVERY business, and presented that as AI. This is the honest
// replacement:
// - True demo mode (Supabase not configured): the whole app is already
//   running on canned data (pickCannedDraft above does the same), so the
//   rail keeps a labeled, honest canned-transform fallback here — never a
//   network call, always deterministic, exactly like the old behavior
//   minus the "presented as AI" deception.
// - A real, signed-in org with OpenRouter configured: refineCaption
//   (src/lib/ai/generate-content.ts) makes one real routed "content_gen"
//   call grounded in the org's own Business Brain.
// - A real, signed-in org WITHOUT an OpenRouter key: there is no honest
//   fallback available (unlike generateDraft's groundedFallbackDraft, a
//   canned transform on a REAL business's caption would just be the same
//   dishonest behavior we're removing) — the composer must disable the
//   rail's buttons instead. isAiAssistAvailable() below is what the page
//   uses to compute that up front; a denial mid-session (e.g. the key gets
//   revoked) still surfaces cleanly as { error: "unavailable" }.
// ---------------------------------------------------------------------------

const MAX_REFINE_CAPTION_LENGTH = 2200 // mirrors generate-content.ts's MAX_CAPTION_LENGTH
const MAX_REFINE_INSTRUCTION_LENGTH = 300

/**
 * True when the AI Assist rail has SOME honest path available — demo mode's
 * labeled canned fallback, or a real configured OpenRouter route. False only
 * for a real, signed-in org missing an OpenRouter key (the one case with no
 * honest fallback). Server-computed so the client never has to guess from
 * env vars it can't see. Async (despite doing no I/O) because every export
 * of a "use server" file must be an async function — see page.tsx's call.
 */
export async function isAiAssistAvailable(): Promise<boolean> {
  return !isSupabaseConfigured() || isOpenRouterConfigured()
}

/** Demo-mode-only canned transforms — deterministic, no network call. Honest because demo mode is never presented as a real business's own AI (the whole app is running on seed data). Kept intentionally simple; real orgs never reach this path (see isAiAssistAvailable). */
function applyDemoCaptionTransform(caption: string, instructionId: string): string {
  const trimmed = caption.trim()
  switch (instructionId) {
    case "punchier":
      return trimmed.endsWith("!") ? trimmed : `${trimmed.replace(/[.!?]+$/, "")}!`
    case "shorter": {
      const match = trimmed.match(/^[^.!?]*[.!?]/)
      if (match) return match[0].trim()
      const words = trimmed.split(/\s+/)
      return words.slice(0, 12).join(" ") + (words.length > 12 ? "…" : "")
    }
    case "emoji": {
      const suffix = "🥐✨"
      return trimmed.endsWith(suffix) ? trimmed : `${trimmed} ${suffix}`
    }
    case "local": {
      const suffix = "Made right here in the neighborhood, for the neighborhood."
      return trimmed.includes(suffix) ? trimmed : `${trimmed} ${suffix}`
    }
    default:
      return `${trimmed} ✨`
  }
}

export type RefineCaptionResult =
  | { caption: string }
  | { error: "allowance"; message: string }
  | { error: "unavailable"; message: string }

/**
 * Refines the Composer's current caption per one short instruction (a quick
 * action id, or free text from "Tell the AI what to change"). See the
 * section header above for the three-path behavior. `instructionId` is only
 * used to pick a demo-mode canned transform when Supabase isn't configured;
 * `instructionText` is always what's actually sent to the model in real mode.
 */
export async function refineCaptionAction(
  caption: string,
  instructionText: string,
  instructionId = "freeform"
): Promise<RefineCaptionResult> {
  if (typeof caption !== "string" || typeof instructionText !== "string" || typeof instructionId !== "string") {
    throw new Error("refineCaptionAction: invalid input")
  }

  const trimmedCaption = caption.trim().slice(0, MAX_REFINE_CAPTION_LENGTH)
  const trimmedInstruction = instructionText.trim().slice(0, MAX_REFINE_INSTRUCTION_LENGTH)
  if (!trimmedCaption || !trimmedInstruction) {
    return { error: "unavailable", message: "Nothing to refine yet." }
  }

  if (!isSupabaseConfigured()) {
    await sleep(500)
    return { caption: applyDemoCaptionTransform(trimmedCaption, instructionId) }
  }

  if (!isOpenRouterConfigured()) {
    return {
      error: "unavailable",
      message: "Add your OpenRouter key in Settings to turn on AI Assist.",
    }
  }

  const orgId = await getCurrentOrgId()
  if (!orgId) {
    // Not a key problem — the session/org couldn't be resolved (review fix:
    // the OpenRouter copy here pointed users at the wrong remedy).
    return { error: "unavailable", message: "Couldn't verify your account — refresh and try again." }
  }

  const businessBrain = await getBusinessBrain()

  try {
    const refined = await refineCaption({
      orgId,
      businessBrain,
      caption: trimmedCaption,
      instruction: trimmedInstruction,
    })
    if (!refined) {
      return { error: "unavailable", message: "Couldn't refine that caption — please try again." }
    }
    return { caption: refined.caption }
  } catch (error) {
    if (error instanceof AllowanceDeniedError) {
      return { error: "allowance", message: error.message || OUT_OF_QUOTA_MESSAGE }
    }
    throw error
  }
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

/** Real fal.ai image URL (already validated) as slide 1, padded to 4 slides with brand-hue placeholders; else 4 placeholders. */
function buildSlideshowSources(imageUrl?: string): SlideshowSource[] {
  if (imageUrl) {
    return [imageUrl, ...BRAND_HUE_COLORS.slice(0, 3).map((color) => ({ color }))]
  }
  return BRAND_HUE_COLORS.map((color) => ({ color }))
}

/**
 * SSRF hardening: a slideshow's real image URL is NEVER taken from the
 * client-supplied `draft.imageUrl` — that field arrives over the wire in a
 * server action call and cannot be trusted (nothing stops a client from
 * passing an arbitrary URL for the server to fetch). Instead, when the draft
 * was actually persisted (`draft.contentId`), the server re-loads its own
 * content_items row (RLS-scoped to the caller's org) and only ever renders
 * with the image URL *it* saved there via fal.ai. If there's no persisted
 * row to check against (demo mode, or the draft never made it to Supabase),
 * the slideshow renders with placeholder colors only — never a fetched URL.
 */
async function resolveTrustedSlideshowImageUrl(
  orgId: string | null,
  draft: GeneratedDraft
): Promise<string | undefined> {
  if (!isSupabaseConfigured() || !orgId || !draft.contentId) return undefined

  try {
    const item = await getContentItem(orgId, draft.contentId)
    const candidate = item?.media_urls?.[0]
    return typeof candidate === "string" ? candidate : undefined
  } catch {
    return undefined
  }
}

export type RenderSlideshowResult =
  | { videoUrl: string; durationSec: number }
  | { error: "allowance"; message: string }
  | { error: "ffmpeg-missing"; message: string }
  | { error: "busy"; message: string }
  | { error: "render"; message: string }

/**
 * Renders a slideshow MP4 via src/lib/media/slideshow.ts, served back from
 * /api/slideshow/[id]. Uses the org's own server-verified image (or
 * brand-hue placeholders — see resolveTrustedSlideshowImageUrl above), never
 * the client-supplied draft.imageUrl directly. A real quota denial, a
 * missing ffmpeg binary, or the render concurrency cap being saturated are
 * surfaced as typed errors, not silently swallowed, so the composer can show
 * the right toast.
 */
export async function renderSlideshowAction(draft: GeneratedDraft): Promise<RenderSlideshowResult> {
  const orgId = await getCurrentOrgId()
  // renderSlideshow's metering (checkAllowance/recordUsage) already no-ops
  // in demo mode regardless of orgId value, so any stable placeholder works
  // when there's no signed-in org to resolve.
  const resolvedOrgId = orgId ?? "demo-org"

  const trustedImageUrl = await resolveTrustedSlideshowImageUrl(orgId, draft)

  try {
    const result = await renderSlideshow({
      orgId: resolvedOrgId,
      images: buildSlideshowSources(trustedImageUrl),
    })

    if (isSupabaseConfigured() && orgId) {
      const uploaded = await saveSlideshowMediaAsset(orgId, { ...result, contentId: draft.contentId }).catch(
        () => false
      )
      // Only safe to delete the local copy once it's durably in Storage —
      // otherwise leave it for the 60-minute opportunistic sweep so
      // /api/slideshow/[id] can still serve it in the meantime.
      if (uploaded) {
        await cleanupSlideshowWorkDir(result.id).catch(() => {})
      }
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
    if (error instanceof SlideshowBusyError) {
      return { error: "busy", message: error.message }
    }
    return { error: "render", message: "Couldn't render the slideshow. Please try again." }
  }
}

export interface DeleteTemplateResult {
  ok: boolean
  /** True when Supabase isn't configured (or there's no resolvable org) — nothing was persisted, so the removal only lasted this session. */
  demoOnly?: boolean
}

/** Deletes a saved template (RLS-scoped to org owner/admin — see src/lib/content.ts#deleteTemplate). Demo-safe session-only no-op when unconfigured. */
export async function deleteTemplateAction(templateId: string): Promise<DeleteTemplateResult> {
  if (!isSupabaseConfigured()) return { ok: true, demoOnly: true }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: true, demoOnly: true }

  try {
    const deleted = await deleteTemplate(orgId, templateId)
    return { ok: deleted }
  } catch {
    return { ok: false }
  }
}
