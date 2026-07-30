import "server-only"

// Design-post drafting for the code-rendered template engine (MASTER_PLAN.md
// — AI writes copy + picks a template + an optional text-free background
// prompt; real typography is drawn by src/lib/templates/render.ts, not the
// model). One runTextJob (job "content_gen" — same route/allowance as
// generate-content.ts's caption drafting: Gemini 2.5 Flash / DeepSeek).
//
// Mirrors generate-content.ts / frontdesk-reply.ts's shape: defensive JSON
// parsing + one retry, returns null when not configured or the model can't
// produce usable output (callers fall back to the old raw-image path — see
// src/app/(app)/studio/actions.ts), and does NOT swallow AllowanceDeniedError
// (it propagates through runTextJob so a real quota denial surfaces instead
// of silently degrading).

import { isSupabaseConfigured } from "@/lib/supabase/config"
import { clampFieldsToSchema, getTemplate, listTemplates } from "@/lib/templates/catalog"
import type { Colorway } from "@/lib/templates/types"
import type { BusinessBrain } from "@/lib/types"

import type { ChatMessage } from "./openrouter"
import { isOpenRouterConfigured } from "./openrouter"
import { runTextJob } from "./router"

export interface DesignPostInput {
  orgId: string
  prompt: string
  businessBrain: BusinessBrain | null
}

export type DesignBackgroundType = "solid" | "gradient" | "photo_ai"

export interface DesignedBackground {
  type: DesignBackgroundType
  /** A fal.ai-ready prompt, already suffixed with the text-free/negative-space rules. Always null unless type is "photo_ai". */
  prompt: string | null
}

export interface DesignedPost {
  templateId: string
  fields: Record<string, string>
  colorway: Colorway
  background: DesignedBackground
  model: string
  costUsd: number
}

const MAX_PROMPT_LENGTH = 2000
const MAX_BACKGROUND_PROMPT_LENGTH = 300
const MAX_RETRIES = 1 // one regeneration attempt on parse failure, matching generate-content.ts / frontdesk-reply.ts.
const VALID_COLORWAYS: readonly Colorway[] = ["brand", "dark", "light"]
const VALID_BACKGROUND_TYPES: readonly DesignBackgroundType[] = ["solid", "gradient", "photo_ai"]

/** Appended to every photo_ai background prompt so the background stays a clean, text-free plate the composited typography sits on top of. */
const PHOTO_AI_PROMPT_SUFFIX =
  ", no text, no words, no logos, muted professional tones, editorial minimal, negative space"

function buildSystemPrompt(brain: BusinessBrain | null): string {
  const catalogLines = listTemplates().map((def) => {
    const fieldList = def.fields
      .map((field) => `${field.key}${field.required ? "" : "?"} (max ${field.maxChars} chars${field.helpText ? `, ${field.helpText}` : ""})`)
      .join("; ")
    const backgrounds = def.allowedBackgrounds.join("/")
    return `- "${def.id}": ${def.description} Fields: ${fieldList}. Allowed backgrounds: ${backgrounds}.`
  })

  const brandLine = brain
    ? `You are a graphic designer for ${brain.business_name ?? "a local business"}${brain.category ? `, a ${brain.category}` : ""}.${brain.tone ? ` Brand voice: ${brain.tone}.` : ""}`
    : "You are a graphic designer for a local small business."

  return [
    brandLine,
    "Pick the SINGLE best-fit template below for the request and write tight, non-generic, non-cliché field copy for it.",
    ...catalogLines,
    "Every field value MUST fit within its stated max character count — write to length, don't rely on truncation.",
    'Pick "colorway": "brand" (default, uses the business\'s own brand color), "dark", or "light".',
    'Pick "background": {"type": "solid"|"gradient"|"photo_ai", "prompt": string|null}. Only set type "photo_ai" (with a vivid, text-free scene description in prompt) when a real photo would clearly elevate this specific post and the template allows it — otherwise use "solid" or "gradient" with prompt null.',
  ].join("\n")
}

function buildUserPrompt(prompt: string): string {
  return [
    `Design request: ${prompt}`,
    "",
    "Respond with ONLY strict JSON, no markdown code fences, no commentary before or after — exactly this shape:",
    '{"template_id": string, "fields": { [fieldKey: string]: string }, "colorway": "brand"|"dark"|"light", "background": {"type": "solid"|"gradient"|"photo_ai", "prompt": string|null}}',
  ].join("\n")
}

interface ParsedDesignJson {
  templateId: string
  fields: Record<string, string>
  colorway: Colorway
  background: DesignedBackground
}

/** Defensively extracts + validates the model's JSON reply. Returns null on any shape/length/unknown-template problem, which callers treat as "retry, then give up." */
function parseDesignJson(raw: string): ParsedDesignJson | null {
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

  const templateId = typeof obj.template_id === "string" ? obj.template_id.trim() : ""
  const def = getTemplate(templateId)
  if (!def) return null

  const rawFields = obj.fields
  if (!rawFields || typeof rawFields !== "object") return null
  const fieldsInput: Record<string, string> = {}
  for (const [key, value] of Object.entries(rawFields as Record<string, unknown>)) {
    if (typeof value === "string") fieldsInput[key] = value
  }

  let fields: Record<string, string>
  try {
    fields = clampFieldsToSchema(def, fieldsInput)
  } catch {
    return null // a required field is missing — treat exactly like any other malformed reply (retry, then fall back).
  }

  const colorwayRaw = typeof obj.colorway === "string" ? obj.colorway : ""
  const colorway: Colorway = (VALID_COLORWAYS as readonly string[]).includes(colorwayRaw)
    ? (colorwayRaw as Colorway)
    : "brand"

  const background = parseBackground(def.allowedBackgrounds, obj.background)

  return { templateId, fields, colorway, background }
}

function parseBackground(allowed: string[], raw: unknown): DesignedBackground {
  if (!raw || typeof raw !== "object") return { type: "solid", prompt: null }

  const obj = raw as Record<string, unknown>
  const typeRaw = typeof obj.type === "string" ? obj.type : ""
  const requestedType: DesignBackgroundType = (VALID_BACKGROUND_TYPES as readonly string[]).includes(typeRaw)
    ? (typeRaw as DesignBackgroundType)
    : "solid"

  // A template that doesn't allow this background kind (e.g. quote-v1 +
  // photo_ai) demotes to solid here — render.ts also demotes defensively,
  // but resolving it early keeps designPost's contract self-consistent.
  const type = allowed.includes(requestedType) ? requestedType : "solid"

  if (type !== "photo_ai") return { type, prompt: null }

  const promptText = typeof obj.prompt === "string" ? obj.prompt.trim().slice(0, MAX_BACKGROUND_PROMPT_LENGTH) : ""
  if (!promptText) return { type: "solid", prompt: null } // photo_ai with no usable scene description isn't renderable — demote rather than fail.

  return { type: "photo_ai", prompt: `${promptText}${PHOTO_AI_PROMPT_SUFFIX}` }
}

/**
 * Drafts one designed post (template pick + field copy + colorway +
 * optional background prompt) via the model router. Returns null when
 * OpenRouter/Supabase aren't configured or the model can't produce usable
 * JSON after one retry. Throws AllowanceDeniedError when the org is out of
 * `content_generations` quota (same allowance as generate-content.ts).
 */
export async function designPost(input: DesignPostInput): Promise<DesignedPost | null> {
  if (!isOpenRouterConfigured() || !isSupabaseConfigured()) return null

  const prompt = input.prompt.trim().slice(0, MAX_PROMPT_LENGTH)
  if (!prompt) return null

  const baseMessages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(input.businessBrain) },
    { role: "user", content: buildUserPrompt(prompt) },
  ]
  const retryMessage: ChatMessage = {
    role: "user",
    content:
      "Your last reply was not valid JSON matching the requested shape (or picked an unknown template, or missed a required field). Respond again with ONLY the strict JSON object — nothing else.",
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const messages = attempt === 0 ? baseMessages : [...baseMessages, retryMessage]

    const result = await runTextJob({
      orgId: input.orgId,
      job: "content_gen",
      messages,
      maxTokens: 500,
      temperature: 0.7,
    })

    const parsed = parseDesignJson(result.text)
    if (parsed) {
      return { ...parsed, model: result.model, costUsd: result.costUsd }
    }
  }

  return null
}
