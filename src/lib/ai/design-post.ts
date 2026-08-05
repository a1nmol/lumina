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
import { elementCatalogKeys, parseElementKeys } from "@/lib/templates/elements"
import { isThemeKey, THEMES } from "@/lib/templates/themes"
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

/** A picked occasion/festival theme (Wave 3 — src/lib/templates/themes.ts). `null` means "no theme" — the overwhelming majority of requests. Callers pass `theme` straight into src/lib/templates/render.ts#renderTemplate's `RenderTemplateInput.theme`. */
export type DesignedTheme = { key: string } | null

export interface DesignedPost {
  templateId: string
  fields: Record<string, string>
  colorway: Colorway
  background: DesignedBackground
  theme: DesignedTheme
  /** Wave 4 — semantic elements (0-4 keys from elements.ts's combined catalog) chosen by breaking down the request's concepts (e.g. "hackathon" -> keyboard/code/trophy). Passed straight into render.ts#renderTemplate's `RenderTemplateInput.elements`. */
  elements: string[]
  model: string
  costUsd: number
}

const MAX_PROMPT_LENGTH = 2000
const MAX_BACKGROUND_PROMPT_LENGTH = 300
const MAX_RETRIES = 1 // one regeneration attempt on parse failure, matching generate-content.ts / frontdesk-reply.ts.
const VALID_COLORWAYS: readonly Colorway[] = ["brand", "dark", "light"]
// Owner product law (memory: graphics-style-rules): AI-image backgrounds
// are BANNED — solid/gradient shape compositions only. photo_ai remains in
// the type union solely so old stored values parse; it is never offered to
// the model and is coerced to "gradient" if it ever appears.
const VALID_BACKGROUND_TYPES: readonly DesignBackgroundType[] = ["solid", "gradient"]

/** Appended to every photo_ai background prompt so the background stays a clean, text-free plate the composited typography sits on top of. */
const PHOTO_AI_PROMPT_SUFFIX =
  ", no text, no words, no logos, muted professional tones, editorial minimal, negative space"

/** One line per theme for the system prompt's catalog — the eid line gets an extra, explicit warning since it's opt-in-only (see themes.ts#ThemeDef.optInOnly). */
function themeCatalogLines(): string[] {
  return Object.values(THEMES).map((theme) => {
    const optInNote = theme.optInOnly
      ? " This is a religious/cultural theme — ONLY pick it when the request explicitly names the occasion by name (e.g. contains the word \"Eid\"); never infer or suggest it."
      : ""
    return `- "${theme.key}": ${theme.label} (${theme.paletteHint.description}).${optInNote}`
  })
}

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
    'Pick "background": {"type": "solid"|"gradient", "prompt": null}. Never suggest photographic or AI-image backgrounds — posters are flat color/gradient/shape compositions by design.',
    'Pick "theme": {"key": string} or null. Available theme keys:',
    ...themeCatalogLines(),
    'Only set a theme when the request CLEARLY references a specific occasion, festival, or celebration by name or unmistakable implication (e.g. "Christmas sale", "Halloween special", "our anniversary party" -> "celebration-generic"). Default to null — most requests are NOT themed. Never guess a theme from a generic promo/announcement with no occasion mentioned.',
    'Pick "elements": a list of 0-4 keys from this catalog, chosen by breaking down the SPECIFIC concepts in the request (e.g. a hackathon -> ["keyboard","code","trophy"]; a yoga studio\'s new class -> ["yoga"]; a plain "20% off this weekend" with no vertical mentioned -> []). Never invent a key not in this list — drop anything you\'re unsure of instead:',
    elementCatalogKeys().join(", "),
    'Elements are a light finishing touch, not required — most requests need 0-2. Never pick "confetti" unless the request is genuinely celebratory (a party, a grand opening, a milestone) — not for routine promos.',
  ].join("\n")
}

function buildUserPrompt(prompt: string): string {
  return [
    `Design request: ${prompt}`,
    "",
    "Respond with ONLY strict JSON, no markdown code fences, no commentary before or after — exactly this shape:",
    '{"template_id": string, "fields": { [fieldKey: string]: string }, "colorway": "brand"|"dark"|"light", "background": {"type": "solid"|"gradient"|"photo_ai", "prompt": string|null}, "theme": {"key": string}|null, "elements": string[]}',
  ].join("\n")
}

interface ParsedDesignJson {
  templateId: string
  fields: Record<string, string>
  colorway: Colorway
  background: DesignedBackground
  theme: DesignedTheme
  elements: string[]
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
  const theme = parseTheme(obj.theme)
  const elements = parseElementKeys(obj.elements)

  return { templateId, fields, colorway, background, theme, elements }
}

/** Defensively parses the model's `"theme"` field — an unrecognized key (typo, invented key, or a stale key from a future/removed theme) demotes to null rather than failing the whole parse, since a theme is always optional decoration, never required content. */
function parseTheme(raw: unknown): DesignedTheme {
  if (!raw || typeof raw !== "object") return null
  const obj = raw as Record<string, unknown>
  const key = typeof obj.key === "string" ? obj.key.trim() : ""
  if (!key || !isThemeKey(key)) return null
  return { key }
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
