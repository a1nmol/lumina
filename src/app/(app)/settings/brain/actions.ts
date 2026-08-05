"use server"

// Server actions for the Business Brain wizard. No-ops in demo mode
// (Supabase unconfigured) so local development without a database never
// crashes; upserts business_brain via the server client — RLS scopes reads
// and writes to the signed-in user's own org — once configured.

import { createClient } from "@/lib/supabase/server"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import { DEMO_BUSINESS_BRAIN } from "@/lib/demo"
import { getCurrentOrgId } from "@/lib/org"
import type { BrandKit, BusinessBrain, BusinessFaq, BusinessHours, BusinessService, ConnectedChannels } from "@/lib/types"

import { DAY_ORDER, TONE_OPTIONS } from "./constants"

export interface SaveBrainResult {
  ok: boolean
  /** Present when ok is false, so the caller can tailor its toast copy. */
  reason?: "no-org" | "invalid-payload"
}

/** A genuinely blank Business Brain for real orgs that haven't saved anything yet. */
function blankBusinessBrain(orgId: string): BusinessBrain {
  return {
    org_id: orgId,
    business_name: null,
    category: null,
    description: null,
    hours: {},
    services: [],
    prices: {},
    faq: [],
    tone: null,
    brand_kit: {},
    connected_channels: {},
    onboarding_step: 0,
    frontdesk_auto_reply: true,
    ai_intro_enabled: false,
    ai_intro_text: null,
    ai_always_on: false,
    follow_ups_enabled: true,
    completed: false,
    updated_at: new Date(0).toISOString(),
  }
}

// --- Server-side payload validation -----------------------------------
// Manual guards (no schema-validation dependency) run before every upsert.
// A draft is the client's full wizard state, so every field is optional
// here — we validate whatever is present and reject the whole write if
// anything is malformed, rather than silently coercing bad data.

const MAX_BUSINESS_NAME = 120
const MAX_DESCRIPTION = 600
const MAX_CATEGORY = 60
const MAX_SERVICES = 50
const MAX_SERVICE_NAME = 120
const MAX_SERVICE_PRICE = 40
const MAX_FAQ = 50
const MAX_FAQ_QUESTION = 300
const MAX_FAQ_ANSWER = 1000
const MAX_HOURS_VALUE = 20
const MAX_LOGO_URL = 500
const MAX_AI_INTRO_TEXT = 500

// Contract: strictly 24-hour "HH:MM" — matches `<input type="time">` output and
// the parsing contract in src/lib/booking-slots.ts' parseTimeToMinutes. No AM/PM.
const HOURS_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

const DAY_KEYS = new Set(DAY_ORDER.map((day) => day.key))
const TONE_IDS = new Set(TONE_OPTIONS.map((tone) => tone.id))
const KNOWN_CHANNEL_KEYS = new Set([
  "google_business",
  "facebook",
  "instagram",
  "tiktok",
  "sms",
  "email",
  "web_chat",
])

/** The BusinessBrain columns a client draft is allowed to write. Anything
 *  else (org_id, onboarding_step, completed, updated_at, prices, ...) is
 *  server-controlled or unused and gets stripped rather than trusted. */
const EDITABLE_KEYS = [
  "business_name",
  "category",
  "description",
  "hours",
  "services",
  "faq",
  "tone",
  "brand_kit",
  "connected_channels",
] as const

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isValidHoursValue(value: string): boolean {
  return value.length <= MAX_HOURS_VALUE && HOURS_TIME_PATTERN.test(value)
}

function isValidHours(value: unknown): value is BusinessHours {
  if (!isPlainObject(value)) return false
  for (const [day, entry] of Object.entries(value)) {
    if (!DAY_KEYS.has(day)) return false
    if (entry === undefined) continue
    if (!isPlainObject(entry)) return false
    const { open, close, closed, ...rest } = entry as Record<string, unknown>
    if (Object.keys(rest).length > 0) return false
    if (closed !== undefined && typeof closed !== "boolean") return false
    if (open !== undefined && (typeof open !== "string" || !isValidHoursValue(open))) return false
    if (close !== undefined && (typeof close !== "string" || !isValidHoursValue(close)))
      return false
  }
  return true
}

function isValidServices(value: unknown): value is BusinessService[] {
  if (!Array.isArray(value) || value.length > MAX_SERVICES) return false
  return value.every((service) => {
    if (!isPlainObject(service)) return false
    if (typeof service.name !== "string" || service.name.trim().length === 0 || service.name.length > MAX_SERVICE_NAME)
      return false
    if (
      service.price !== undefined &&
      (typeof service.price !== "string" || service.price.length > MAX_SERVICE_PRICE)
    )
      return false
    return true
  })
}

function isValidFaq(value: unknown): value is BusinessFaq[] {
  if (!Array.isArray(value) || value.length > MAX_FAQ) return false
  return value.every((item) => {
    if (!isPlainObject(item)) return false
    if (typeof item.question !== "string" || item.question.trim().length === 0 || item.question.length > MAX_FAQ_QUESTION)
      return false
    if (typeof item.answer !== "string" || item.answer.trim().length === 0 || item.answer.length > MAX_FAQ_ANSWER)
      return false
    return true
  })
}

function isValidLogoUrl(value: string): boolean {
  if (value.length === 0) return true // clearing the logo is valid
  if (value.length > MAX_LOGO_URL) return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch {
    return false
  }
}

function isValidBrandKit(value: unknown): value is BrandKit {
  if (!isPlainObject(value)) return false
  if (
    value.primary_color !== undefined &&
    (typeof value.primary_color !== "string" || !HEX_COLOR_PATTERN.test(value.primary_color))
  )
    return false
  if (
    value.logo_url !== undefined &&
    (typeof value.logo_url !== "string" || !isValidLogoUrl(value.logo_url))
  )
    return false
  return true
}

function isValidConnectedChannels(value: unknown): value is ConnectedChannels {
  if (!isPlainObject(value)) return false
  return Object.entries(value).every(([key, channelValue]) => {
    if (!KNOWN_CHANNEL_KEYS.has(key)) return false
    if (channelValue !== undefined && typeof channelValue !== "boolean") return false
    return true
  })
}

/**
 * Validates and strips a wizard draft down to only known, well-formed
 * Business Brain columns. Returns null (never throws) on any violation so
 * callers can reject the write with `{ ok: false, reason: "invalid-payload" }`.
 */
function sanitizeBusinessBrainDraft(draft: Partial<BusinessBrain>): Partial<BusinessBrain> | null {
  const sanitized: Partial<BusinessBrain> = {}

  for (const key of EDITABLE_KEYS) {
    if (!(key in draft)) continue

    switch (key) {
      case "business_name": {
        const value = draft.business_name
        if (value !== null && (typeof value !== "string" || value.length > MAX_BUSINESS_NAME))
          return null
        sanitized.business_name = value ?? null
        break
      }
      case "category": {
        const value = draft.category
        if (value !== null && (typeof value !== "string" || value.length > MAX_CATEGORY))
          return null
        sanitized.category = value ?? null
        break
      }
      case "description": {
        const value = draft.description
        if (value !== null && (typeof value !== "string" || value.length > MAX_DESCRIPTION))
          return null
        sanitized.description = value ?? null
        break
      }
      case "tone": {
        const value = draft.tone
        if (value !== null && (typeof value !== "string" || !TONE_IDS.has(value))) return null
        sanitized.tone = value ?? null
        break
      }
      case "hours": {
        if (!isValidHours(draft.hours)) return null
        sanitized.hours = draft.hours
        break
      }
      case "services": {
        if (!isValidServices(draft.services)) return null
        sanitized.services = draft.services
        break
      }
      case "faq": {
        if (!isValidFaq(draft.faq)) return null
        sanitized.faq = draft.faq
        break
      }
      case "brand_kit": {
        if (!isValidBrandKit(draft.brand_kit)) return null
        sanitized.brand_kit = draft.brand_kit
        break
      }
      case "connected_channels": {
        if (!isValidConnectedChannels(draft.connected_channels)) return null
        sanitized.connected_channels = draft.connected_channels
        break
      }
    }
  }

  return sanitized
}

/** Loads the current org's Business Brain, falling back to demo data. */
export async function getBusinessBrain(): Promise<BusinessBrain> {
  if (!isSupabaseConfigured()) return DEMO_BUSINESS_BRAIN

  const orgId = await getCurrentOrgId()
  // Configured but no org resolved yet (e.g. bootstrap hasn't run): a blank
  // brain shape, never the seeded demo business.
  if (!orgId) return blankBusinessBrain("")

  const supabase = await createClient()
  const { data } = await supabase
    .from("business_brain")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle()

  return data ?? blankBusinessBrain(orgId)
}

/** Persists one wizard step's draft. No-ops in demo mode. */
export async function saveBusinessBrainStep(
  step: number,
  draft: Partial<BusinessBrain>
): Promise<SaveBrainResult> {
  if (!isSupabaseConfigured()) return { ok: true }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: false, reason: "no-org" }

  const sanitized = sanitizeBusinessBrainDraft(draft)
  if (!sanitized) return { ok: false, reason: "invalid-payload" }

  const supabase = await createClient()
  const { error } = await supabase
    .from("business_brain")
    .upsert({ ...sanitized, org_id: orgId, onboarding_step: step }, { onConflict: "org_id" })

  return { ok: !error }
}

export interface SaveFaqResult {
  ok: boolean
  /** Present when ok is false, so the caller can tailor its toast copy. */
  reason?: "no-org" | "invalid-payload"
}

/**
 * Persists the FAQ list on its own — used by the Settings hub's FAQ card
 * (src/app/(app)/settings/faq-card.tsx), independent of the wizard's
 * step-by-step draft flow. Reuses the same validation caps (≤50 items,
 * question ≤300 chars, answer ≤1000 chars) as the wizard. No-ops in demo
 * mode.
 */
export async function saveFaq(faq: BusinessFaq[]): Promise<SaveFaqResult> {
  if (!isSupabaseConfigured()) return { ok: true }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: false, reason: "no-org" }

  if (!isValidFaq(faq)) return { ok: false, reason: "invalid-payload" }

  const supabase = await createClient()
  const { error } = await supabase.from("business_brain").upsert({ faq, org_id: orgId }, { onConflict: "org_id" })

  return { ok: !error }
}

export interface SaveFrontdeskAutoReplyResult {
  ok: boolean
  /** Present when ok is false, so the caller can tailor its toast copy. */
  reason?: "no-org"
}

/**
 * Persists the org-wide default AI autonomy for NEW conversations (migration
 * 0011 `business_brain.frontdesk_auto_reply`) — used by the Settings hub's
 * FrontDesk auto-reply card (src/app/(app)/settings/ai/{auto-replies,ai-intro,always-on}-card.tsx).
 * true -> new conversations start with `ai_mode: 'auto'`; false -> 'off'
 * (still drafts, never sends) — see the enforcement in
 * src/app/api/frontdesk/chat/route.ts and src/app/api/twilio/sms/route.ts.
 * The owner can always override per conversation from the Inbox regardless
 * of this default. Independent of the wizard's step-by-step draft flow,
 * same standalone-card pattern as saveFaq. No-ops in demo mode.
 */
export async function saveFrontdeskAutoReply(frontdeskAutoReply: boolean): Promise<SaveFrontdeskAutoReplyResult> {
  if (!isSupabaseConfigured()) return { ok: true }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: false, reason: "no-org" }

  const supabase = await createClient()
  const { error } = await supabase
    .from("business_brain")
    .upsert({ frontdesk_auto_reply: frontdeskAutoReply, org_id: orgId }, { onConflict: "org_id" })

  return { ok: !error }
}

export interface SaveAiIntroResult {
  ok: boolean
  /** Present when ok is false, so the caller can tailor its toast copy. */
  reason?: "no-org" | "invalid-payload"
}

/**
 * Persists the owner's Honest-AI intro settings (migration 0013
 * `business_brain.ai_intro_enabled` / `.ai_intro_text`) — used by the
 * Settings hub's FrontDesk auto-reply card
 * (src/app/(app)/settings/ai/{auto-replies,ai-intro,always-on}-card.tsx). `aiIntroText` is
 * the owner's literal, one-time disclosure line — stored trimmed, and as
 * null when blank so `ai_intro_enabled` alone can't fire an empty intro (see
 * the gating contract in src/lib/ai/intro.ts#shouldSendIntro). No-ops in
 * demo mode.
 */
export async function saveAiIntro(aiIntroEnabled: boolean, aiIntroText: string): Promise<SaveAiIntroResult> {
  if (!isSupabaseConfigured()) return { ok: true }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: false, reason: "no-org" }

  const trimmed = aiIntroText.trim()
  if (trimmed.length > MAX_AI_INTRO_TEXT) return { ok: false, reason: "invalid-payload" }

  const supabase = await createClient()
  const { error } = await supabase
    .from("business_brain")
    .upsert({ ai_intro_enabled: aiIntroEnabled, ai_intro_text: trimmed || null, org_id: orgId }, { onConflict: "org_id" })

  return { ok: !error }
}

export interface SaveAiAlwaysOnResult {
  ok: boolean
  /** Present when ok is false, so the caller can tailor its toast copy. */
  reason?: "no-org"
}

/**
 * Persists the org-wide "Always on" switch (Commander update, migration
 * 0015 `business_brain.ai_always_on`) — used by the Settings hub's FrontDesk
 * auto-reply card (src/app/(app)/settings/ai/{auto-replies,ai-intro,always-on}-card.tsx).
 * When true, src/lib/ai/frontdesk-reply.ts's buildSystemPrompt tells the
 * model to never fully hand a conversation off — it can still flag a topic
 * for the owner (ai_state 'escalated'), it just keeps engaging with
 * everything else instead of going quiet. No-ops in demo mode.
 */
export async function saveAiAlwaysOn(aiAlwaysOn: boolean): Promise<SaveAiAlwaysOnResult> {
  if (!isSupabaseConfigured()) return { ok: true }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: false, reason: "no-org" }

  const supabase = await createClient()
  const { error } = await supabase
    .from("business_brain")
    .upsert({ ai_always_on: aiAlwaysOn, org_id: orgId }, { onConflict: "org_id" })

  return { ok: !error }
}

export interface SaveFollowUpsEnabledResult {
  ok: boolean
  /** Present when ok is false, so the caller can tailor its toast copy. */
  reason?: "no-org"
}

/**
 * Persists the org-wide "Proactive follow-ups" toggle (migration 0022
 * `business_brain.follow_ups_enabled`) — used by the Settings hub's
 * Proactive follow-ups card (src/app/(app)/settings/ai/follow-ups-card.tsx).
 * This is the real gate src/lib/follow-ups.ts's daily scan checks before
 * drafting a check-in nudge for a quiet conversation; the "[no-followups]"
 * standing-order token remains a legacy escape hatch on top of this toggle.
 * Same standalone-card pattern as saveFrontdeskAutoReply. No-ops in demo
 * mode.
 */
export async function saveFollowUpsEnabled(followUpsEnabled: boolean): Promise<SaveFollowUpsEnabledResult> {
  if (!isSupabaseConfigured()) return { ok: true }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: false, reason: "no-org" }

  const supabase = await createClient()
  const { error } = await supabase
    .from("business_brain")
    .upsert({ follow_ups_enabled: followUpsEnabled, org_id: orgId }, { onConflict: "org_id" })

  return { ok: !error }
}

/**
 * Marks the Business Brain complete on the final wizard step. `stepCount`
 * is the wizard's total step count (WIZARD_STEPS.length), passed in by the
 * caller rather than hardcoded here so the two never drift. No-ops in demo
 * mode.
 */
export async function completeBusinessBrain(
  draft: Partial<BusinessBrain>,
  stepCount: number
): Promise<SaveBrainResult> {
  if (!isSupabaseConfigured()) return { ok: true }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: false, reason: "no-org" }

  const sanitized = sanitizeBusinessBrainDraft(draft)
  if (!sanitized) return { ok: false, reason: "invalid-payload" }

  const supabase = await createClient()
  const { error } = await supabase.from("business_brain").upsert(
    { ...sanitized, org_id: orgId, onboarding_step: stepCount, completed: true },
    { onConflict: "org_id" }
  )

  return { ok: !error }
}
