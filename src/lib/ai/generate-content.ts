import "server-only"

// Real content-draft generation for the Content Studio Composer, routed
// through the shared model router (job "content_gen" → Gemini 2.5 Flash /
// DeepSeek — see src/lib/ai/router.ts). Returns null whenever OpenRouter or
// Supabase isn't configured, or when the model can't be coaxed into valid
// JSON after one retry — callers (e.g. the studio server action) treat null
// as "fall back to demo drafts", exactly like src/app/(app)/studio/actions.ts
// already does today.
//
// AllowanceDeniedError (spend guard / quota) is NOT swallowed here — it
// propagates so the caller can surface a real "you're out of quota" message
// instead of silently serving demo content.

import { isSupabaseConfigured } from "@/lib/supabase/config"
import type { BusinessBrain, BusinessService } from "@/lib/types"

import type { ChatMessage } from "./openrouter"
import { isOpenRouterConfigured } from "./openrouter"
import { runTextJob } from "./router"

// Kept as plain string unions (not imported from the studio route group) so
// this module has no dependency on UI code — the studio server action is
// responsible for mapping to/from its own PostFormat/Platform types.
export type GenerateContentFormat = "single" | "carousel" | "slideshow"

export interface GenerateContentDraftInput {
  orgId: string
  businessBrain: BusinessBrain | null
  prompt: string
  format: GenerateContentFormat
  platforms: string[]
}

export interface GeneratedContentDraft {
  caption: string
  hashtags: string[]
  imageDescription: string
  model: string
  costUsd: number
}

const MAX_PROMPT_LENGTH = 2000
const MAX_CAPTION_LENGTH = 2200 // Instagram's own caption ceiling — a sane upper bound for any platform.
const MAX_IMAGE_DESCRIPTION_LENGTH = 500
const MAX_HASHTAGS = 10
const MAX_RETRIES = 1 // one regeneration attempt on parse failure, per spec.
const MAX_SERVICES_IN_PROMPT = 6
const MAX_DESCRIPTION_CHARS_IN_PROMPT = 400

/** Builds a tight (~350 token) system prompt from the Business Brain. */
function buildSystemPrompt(brain: BusinessBrain | null): string {
  if (!brain) {
    return "You are a social media copywriter for a local small business. Write engaging, authentic, non-generic captions for their posts."
  }

  const services = (brain.services ?? [])
    .slice(0, MAX_SERVICES_IN_PROMPT)
    .map((service: BusinessService) => service.name)
    .filter(Boolean)
    .join(", ")

  const description = brain.description?.trim().slice(0, MAX_DESCRIPTION_CHARS_IN_PROMPT)

  const lines = [
    `You are the social media copywriter for ${brain.business_name ?? "a local business"}${
      brain.category ? `, a ${brain.category}` : ""
    }.`,
    brain.tone ? `Brand voice: ${brain.tone}.` : null,
    services ? `Key services/products: ${services}.` : null,
    description ? `About the business: ${description}` : null,
    "Write like someone who actually works there — warm, specific, never generic or corporate-sounding.",
  ].filter((line): line is string => Boolean(line))

  return lines.join(" ")
}

function buildUserPrompt(input: { prompt: string; format: GenerateContentFormat; platforms: string[] }): string {
  const platforms = input.platforms.length > 0 ? input.platforms.join(", ") : "social media"

  return [
    `Create a ${input.format} post for ${platforms}.`,
    `Request: ${input.prompt.trim()}`,
    "",
    "Respond with ONLY strict JSON, no markdown code fences, no commentary before or after — exactly this shape:",
    '{"caption": string, "hashtags": string[] (5-8 lowercase words/phrases, no "#" symbol), "imageDescription": string (one vivid sentence describing the accompanying photo)}',
  ].join("\n")
}

interface ParsedDraftJson {
  caption: string
  hashtags: string[]
  imageDescription: string
}

/** Defensively extracts + validates the model's JSON reply. Returns null on any shape/length problem. */
function parseDraftJson(raw: string): ParsedDraftJson | null {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(match[0])
  } catch {
    return null
  }

  if (!parsed || typeof parsed !== "object") return null
  const obj = parsed as Record<string, unknown>

  const caption = typeof obj.caption === "string" ? obj.caption.trim() : ""
  const imageDescription = typeof obj.imageDescription === "string" ? obj.imageDescription.trim() : ""
  const hashtagsRaw = Array.isArray(obj.hashtags) ? obj.hashtags : []

  const hashtags = hashtagsRaw
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.replace(/^#/, "").trim().toLowerCase())
    .filter(Boolean)
    .slice(0, MAX_HASHTAGS)

  if (!caption || caption.length > MAX_CAPTION_LENGTH) return null
  if (!imageDescription || imageDescription.length > MAX_IMAGE_DESCRIPTION_LENGTH) return null
  if (hashtags.length === 0) return null

  return { caption, hashtags, imageDescription }
}

/**
 * Generates one content draft via the model router. Returns null when
 * OpenRouter/Supabase aren't configured (demo mode) or when the model
 * repeatedly fails to return usable JSON. Throws AllowanceDeniedError when
 * the org is out of quota — callers should NOT treat that as "fall back to
 * demo", it's a real quota state.
 */
export async function generateContentDraft(
  input: GenerateContentDraftInput
): Promise<GeneratedContentDraft | null> {
  if (!isOpenRouterConfigured() || !isSupabaseConfigured()) return null

  const prompt = input.prompt.trim().slice(0, MAX_PROMPT_LENGTH)
  if (!prompt) return null

  const baseMessages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(input.businessBrain) },
    { role: "user", content: buildUserPrompt({ prompt, format: input.format, platforms: input.platforms }) },
  ]

  const retryMessage: ChatMessage = {
    role: "user",
    content: "Your last reply was not valid JSON matching the requested shape. Respond again with ONLY the strict JSON object — nothing else.",
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const messages = attempt === 0 ? baseMessages : [...baseMessages, retryMessage]

    const result = await runTextJob({
      orgId: input.orgId,
      job: "content_gen",
      messages,
      maxTokens: 500,
      temperature: 0.8,
    })

    const parsed = parseDraftJson(result.text)
    if (parsed) {
      return { ...parsed, model: result.model, costUsd: result.costUsd }
    }
  }

  return null
}
