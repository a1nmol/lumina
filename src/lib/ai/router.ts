import "server-only"

// Model routing per MASTER_PLAN.md §5 ("cheapest effective; route per job,
// never one model"). This is the ONLY place OpenRouter model ids + $/Mtok
// pricing are pinned — update both together when swapping a route.
//
// Model ids below are pinned to current (as of writing) cheap OpenRouter
// routes for each job family described in the plan. OpenRouter's catalog
// changes over time — re-verify ids/pricing at https://openrouter.ai/models
// before relying on them at real scale; a wrong id simply 400s and this
// module falls through to the next candidate, so it fails safe either way.

import { checkAllowance, recordUsage } from "@/lib/usage"
import type { UsageFeature } from "@/lib/types"

import { AllowanceDeniedError } from "./errors"
import { chatComplete, type ChatMessage } from "./openrouter"

export type AiJob = "classify" | "content_gen" | "customer_reply" | "reasoning"

/**
 * Ordered candidate model ids per job. runTextJob tries them in order,
 * falling back to the next on any request failure (rate limit, model
 * unavailable, etc). First entry is the "cheapest effective" pick for the
 * job per MASTER_PLAN §5; later entries trade cost for reliability.
 */
const MODEL_CANDIDATES: Record<AiJob, string[]> = {
  // Classify/route/intent/sentiment/spam → free tier first, then cheap fallbacks.
  classify: ["meta-llama/llama-3.1-8b-instruct:free", "google/gemini-2.0-flash-lite-001", "openai/gpt-5-nano"],
  // Content generation → Gemini 2.5 Flash ($0.30/$2.50) or DeepSeek-V4-Flash ($0.14/$0.28).
  content_gen: ["google/gemini-2.5-flash", "deepseek/deepseek-chat"],
  // Customer-facing replies (chat/DM/SMS) → Claude Haiku 4.5 for reliability, PII-safe.
  customer_reply: ["anthropic/claude-haiku-4.5", "google/gemini-2.5-flash"],
  // Analytics/hard reasoning → DeepSeek or Claude Haiku 4.5; escalate to Sonnet manually if needed.
  reasoning: ["deepseek/deepseek-chat", "anthropic/claude-haiku-4.5"],
}

/**
 * The usage_events feature bucket each job is metered under. There are only
 * four metered features in the data model (content_generations, images,
 * slideshows, ai_replies) — classify/customer_reply/reasoning are all
 * inbox/FrontDesk-adjacent jobs and share the ai_replies allowance, while
 * content_gen has its own bucket. See src/lib/types.ts PlanLimits.
 */
const JOB_FEATURE: Record<AiJob, UsageFeature> = {
  classify: "ai_replies",
  content_gen: "content_generations",
  customer_reply: "ai_replies",
  reasoning: "ai_replies",
}

/** $/1M tokens (input, output). Estimates — verify against provider pricing pages before scale. */
const MODEL_PRICING: Record<string, { inputPerMTok: number; outputPerMTok: number }> = {
  "meta-llama/llama-3.1-8b-instruct:free": { inputPerMTok: 0, outputPerMTok: 0 },
  "google/gemini-2.0-flash-lite-001": { inputPerMTok: 0.075, outputPerMTok: 0.3 },
  "openai/gpt-5-nano": { inputPerMTok: 0.05, outputPerMTok: 0.4 },
  "google/gemini-2.5-flash": { inputPerMTok: 0.3, outputPerMTok: 2.5 },
  "deepseek/deepseek-chat": { inputPerMTok: 0.14, outputPerMTok: 0.28 },
  "anthropic/claude-haiku-4.5": { inputPerMTok: 1, outputPerMTok: 5 },
}

/** Conservative fallback estimate for any model id not in MODEL_PRICING. */
const DEFAULT_PRICING = { inputPerMTok: 0.5, outputPerMTok: 1.5 }

/** Ordered candidate model ids for a job, cheapest-effective first. */
export function pickModel(job: AiJob): string[] {
  return MODEL_CANDIDATES[job]
}

function estimateCostUsd(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = MODEL_PRICING[model] ?? DEFAULT_PRICING
  const inputCost = (promptTokens / 1_000_000) * pricing.inputPerMTok
  const outputCost = (completionTokens / 1_000_000) * pricing.outputPerMTok
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000
}

export interface RunTextJobInput {
  orgId: string
  job: AiJob
  messages: ChatMessage[]
  maxTokens?: number
  temperature?: number
}

export interface RunTextJobResult {
  text: string
  model: string
  costUsd: number
}

/**
 * Runs a metered text job through the model router: checks the spend guard
 * / per-feature allowance first (fails closed — throws AllowanceDeniedError
 * rather than silently proceeding), then tries each candidate model in
 * order until one succeeds, recording real usage/cost against the org.
 */
export async function runTextJob(input: RunTextJobInput): Promise<RunTextJobResult> {
  const feature = JOB_FEATURE[input.job]

  const allowance = await checkAllowance(input.orgId, feature)
  if (!allowance.allowed) {
    throw new AllowanceDeniedError(feature, allowance.reason)
  }

  const candidates = pickModel(input.job)
  let lastError: unknown = null

  for (const model of candidates) {
    try {
      const result = await chatComplete({
        model,
        messages: input.messages,
        maxTokens: input.maxTokens,
        temperature: input.temperature,
      })

      const servedModel = result.model || model
      const costUsd = estimateCostUsd(servedModel, result.promptTokens, result.completionTokens)

      await recordUsage(input.orgId, {
        feature,
        model: servedModel,
        units: 1,
        costUsd,
        metadata: {
          job: input.job,
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
        },
      })

      return { text: result.text, model: servedModel, costUsd }
    } catch (error) {
      lastError = error
      // Try the next candidate on any failure (network, 4xx/5xx, bad model id).
      continue
    }
  }

  const reason = lastError instanceof Error ? lastError.message : String(lastError)
  throw new Error(`runTextJob: all candidate models failed for job "${input.job}": ${reason}`)
}
