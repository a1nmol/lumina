"use server"

// Server actions for the Growth page's Reviews section.
//
// Demo-safe throughout, mirroring src/app/(app)/inbox/actions.ts:
// draftReviewReplyAction falls back to a canned/generated-style draft when
// Supabase/OpenRouter aren't configured (or there's no resolvable org), and
// a real quota denial (AllowanceDeniedError) is surfaced as a typed
// { error: "allowance" } result rather than swallowed.
// sendReviewReplyAction persists via src/lib/analytics.ts#saveReviewReply
// (or synthesizes a demo Review update) so the client can do an optimistic
// update + revert, exactly like the inbox's sendReply.
//
// getReviewAutoReplySettings / saveReviewSettings implement the Phase 3
// design brief's "Auto-publish threshold setting": there is no dedicated
// business_brain column for this yet, so it's namespaced inside the
// existing jsonb `connected_channels` column as `review_auto_reply: {
// enabled, minStars }` — additive, no migration required. A dedicated
// column can replace this later if it outgrows being a nested value.

import { AllowanceDeniedError } from "@/lib/ai/errors"
import { isOpenRouterConfigured } from "@/lib/ai/openrouter"
import { draftReviewReply } from "@/lib/ai/review-reply"
import { listReviews, saveReviewReply } from "@/lib/analytics"
import { DEMO_REVIEWS } from "@/lib/demo"
import { getCurrentOrgId } from "@/lib/org"
import { createClient } from "@/lib/supabase/server"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import type { ConnectedChannels, Review } from "@/lib/types"

import { getBusinessBrain } from "@/app/(app)/settings/brain/actions"

const DEMO_DRAFT_DELAY_MS = 900
const MAX_REPLY_LENGTH = 600

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function firstName(name: string | null): string {
  if (!name) return "there"
  return name.trim().split(/\s+/)[0] || "there"
}

/** A plausible generated-style fallback draft when there's no canned demo reply to reuse. */
function genericDemoReviewDraft(review: Review): string {
  const name = firstName(review.reviewer_name)
  if (review.rating >= 4) {
    return `Thank you so much, ${name} — this really made our day! We can't wait to see you again soon.`
  }
  return `Hi ${name}, thanks for the honest feedback — we're sorry it wasn't a perfect visit. We'd love the chance to make it right, please reach out anytime.`
}

// ---------------------------------------------------------------------------
// Drafting + sending replies
// ---------------------------------------------------------------------------

export type DraftReviewReplyResult =
  | { draft: string; model?: string; costUsd?: number }
  | { error: "allowance"; message: string }
  | { error: "not_found"; message: string }

/**
 * Drafts a reply to one review.
 *
 * - Supabase not configured (true demo mode): returns the review's canned
 *   `reply` (the ai_draft rows in DEMO_REVIEWS) or a plausible generated-
 *   style line after a short simulated delay.
 * - Supabase configured but OpenRouter not configured: loads the REAL review
 *   and falls back to genericDemoReviewDraft(review) built from that real
 *   object, rather than looking up DEMO_REVIEWS (which won't have a match).
 * - Both configured: calls draftReviewReply (Claude Haiku 4.5, PII-safe) — a
 *   quota denial is surfaced distinctly so the composer can toast a real
 *   "out of quota" state.
 */
export async function draftReviewReplyAction(reviewId: string): Promise<DraftReviewReplyResult> {
  if (!isSupabaseConfigured()) {
    await sleep(DEMO_DRAFT_DELAY_MS)
    const demoReview = DEMO_REVIEWS.find((review) => review.id === reviewId)
    if (!demoReview) return { error: "not_found", message: "This review could not be found." }
    return { draft: demoReview.reply ?? genericDemoReviewDraft(demoReview) }
  }

  const orgId = await getCurrentOrgId()
  if (!orgId) {
    await sleep(DEMO_DRAFT_DELAY_MS)
    return { error: "not_found", message: "This review could not be found." }
  }

  const reviews = await listReviews(orgId)
  const review = reviews.find((item) => item.id === reviewId)
  if (!review) return { error: "not_found", message: "This review could not be found." }

  if (!isOpenRouterConfigured()) {
    await sleep(DEMO_DRAFT_DELAY_MS)
    return { draft: genericDemoReviewDraft(review) }
  }

  try {
    const businessBrain = await getBusinessBrain()
    const result = await draftReviewReply({ orgId, businessBrain, review })
    if (!result) return { draft: genericDemoReviewDraft(review) }
    return { draft: result.reply, model: result.model, costUsd: result.costUsd }
  } catch (error) {
    if (error instanceof AllowanceDeniedError) {
      return { error: "allowance", message: error.message || "You're out of AI reply quota this month." }
    }
    throw error
  }
}

export interface SendReviewReplyInput {
  reviewId: string
  reply: string
}

/** Sends (persists) a review reply, marking it `replied`. Demo mode synthesizes an updated Review for optimistic UI. */
export async function sendReviewReplyAction(input: SendReviewReplyInput): Promise<Review | null> {
  const trimmed = input.reply.trim()
  if (!trimmed || trimmed.length > MAX_REPLY_LENGTH) {
    throw new Error("sendReviewReplyAction: invalid reply")
  }

  if (!isSupabaseConfigured()) {
    const demoReview = DEMO_REVIEWS.find((review) => review.id === input.reviewId)
    if (!demoReview) return null
    return {
      ...demoReview,
      reply: trimmed,
      reply_status: "replied",
      updated_at: new Date().toISOString(),
    }
  }

  const orgId = await getCurrentOrgId()
  if (!orgId) return null

  return await saveReviewReply(orgId, input.reviewId, { reply: trimmed, replyStatus: "replied" })
}

// ---------------------------------------------------------------------------
// Auto-reply threshold setting
// ---------------------------------------------------------------------------

export interface ReviewAutoReplySettings {
  enabled: boolean
  minStars: 3 | 4 | 5
}

const DEFAULT_REVIEW_AUTO_REPLY_SETTINGS: ReviewAutoReplySettings = { enabled: false, minStars: 4 }

const VALID_MIN_STARS = new Set([3, 4, 5])

function parseReviewAutoReplySettings(value: unknown): ReviewAutoReplySettings {
  if (!value || typeof value !== "object") return DEFAULT_REVIEW_AUTO_REPLY_SETTINGS
  const raw = value as Record<string, unknown>
  const enabled = typeof raw.enabled === "boolean" ? raw.enabled : DEFAULT_REVIEW_AUTO_REPLY_SETTINGS.enabled
  const minStars = VALID_MIN_STARS.has(raw.minStars as number)
    ? (raw.minStars as 3 | 4 | 5)
    : DEFAULT_REVIEW_AUTO_REPLY_SETTINGS.minStars
  return { enabled, minStars }
}

/** Reads the org's review auto-reply setting from business_brain.connected_channels.review_auto_reply (see module header). */
export async function getReviewAutoReplySettings(): Promise<ReviewAutoReplySettings> {
  const brain = await getBusinessBrain()
  const raw = (brain.connected_channels as Record<string, unknown> | null)?.review_auto_reply
  return parseReviewAutoReplySettings(raw)
}

export interface SaveReviewSettingsResult {
  ok: boolean
}

/** Persists the review auto-reply setting. No-ops in demo mode (client already updates local state + toasts). */
export async function saveReviewSettings(settings: ReviewAutoReplySettings): Promise<SaveReviewSettingsResult> {
  if (!isSupabaseConfigured()) return { ok: true }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: false }

  const sanitized: ReviewAutoReplySettings = {
    enabled: settings.enabled === true,
    minStars: VALID_MIN_STARS.has(settings.minStars) ? settings.minStars : DEFAULT_REVIEW_AUTO_REPLY_SETTINGS.minStars,
  }

  const brain = await getBusinessBrain()
  const nextConnectedChannels = {
    ...brain.connected_channels,
    review_auto_reply: sanitized,
  }

  const supabase = await createClient()
  const { error } = await supabase.from("business_brain").upsert(
    {
      // review_auto_reply isn't part of the ConnectedChannels type (its index
      // signature is boolean-only) — see the module header for why this
      // namespaced jsonb value is the deliberate, additive stopgap.
      connected_channels: nextConnectedChannels as unknown as ConnectedChannels,
      org_id: orgId,
    },
    { onConflict: "org_id" }
  )

  return { ok: !error }
}
