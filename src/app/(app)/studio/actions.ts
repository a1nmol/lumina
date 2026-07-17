"use server"

// Server action for the Content Studio Composer's "Generate" moment.
//
// DEMO MODE: returns one of a handful of canned Sunrise Bakery outputs after
// a short simulated delay, so the whole compose → edit → queue flow works
// without any LLM/image keys configured.
//
// TODO(backend): swap the body of generateDraft() for a real call through
// the shared OpenRouter model-router (MASTER_PLAN.md §5 — content gen routes
// to Gemini 2.5 Flash / DeepSeek-V4-Flash) + fal.ai FLUX schnell for the
// image, metered via checkAllowance(orgId, "content_generations") /
// recordUsage(orgId, { feature: "content_generations", model, costUsd })
// from "@/lib/usage". The input/output shape below (GenerateDraftInput ->
// GeneratedDraft) is intentionally the whole interface the client depends
// on, so that swap is contained to this file.

import { pickCannedDraft } from "./demo-drafts"
import { PLATFORMS, type GeneratedDraft, type GenerateDraftInput, type PostFormat } from "./types"

const FORMATS: PostFormat[] = ["single", "carousel", "slideshow"]
const MAX_PROMPT_LENGTH = 2000
const SIMULATED_LATENCY_MS = 1200

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
 * Generates (in demo mode: picks a canned) post draft for the Composer.
 * `attempt` lets the client ask for a *different* variant on "Regenerate"
 * without changing the prompt.
 */
export async function generateDraft(
  input: GenerateDraftInput,
  attempt = 0
): Promise<GeneratedDraft> {
  if (!isValidInput(input)) {
    throw new Error("generateDraft: invalid input")
  }
  if (!isValidAttempt(attempt)) {
    throw new Error("generateDraft: invalid attempt")
  }

  await sleep(SIMULATED_LATENCY_MS)

  return pickCannedDraft(input.format, input.prompt, attempt)
}
