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
import { notifyOpenRouterOutOfCredits } from "@/lib/watchdog"
import type { UsageFeature } from "@/lib/types"

import { AllowanceDeniedError } from "./errors"
import { OpenRouterRequestError, chatComplete, type ChatMessage } from "./openrouter"

export type AiJob =
  | "classify"
  | "content_gen"
  | "customer_reply"
  | "reasoning"
  | "vision_describe"
  | "conversation_memory"
  | "memory_search"

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
  // Describing a customer-sent image attachment (FrontDesk DM vision) — real
  // customer media, so PII-safe paid vision models only, same rule as
  // customer_reply. Both candidates support image inputs on OpenRouter.
  vision_describe: ["google/gemini-2.5-flash", "anthropic/claude-haiku-4.5"],
  // Rolling conversation memory (Commander update, migration 0015) — the raw
  // message history it summarizes is real customer content, so this stays on
  // the same PII-safe-paid-only rule as every other customer-facing job
  // above. Cheapest-effective first: Gemini 2.5 Flash-Lite is the cheapest
  // paid model already proven reliable at strict-JSON summarization tasks,
  // falling back to the DeepSeek/Haiku pair the other jobs already trust.
  conversation_memory: ["google/gemini-2.5-flash-lite", "deepseek/deepseek-chat", "anthropic/claude-haiku-4.5"],
  // Natural-language memory search ("who asked about haircut prices last
  // month?") — the candidate context it grades is built from real customer
  // message snippets + conversation memories, the same PII the
  // conversation_memory job summarizes, so this mirrors that chain exactly
  // (cheapest-effective paid model first, never a free tier).
  memory_search: ["google/gemini-2.5-flash-lite", "deepseek/deepseek-chat", "anthropic/claude-haiku-4.5"],
}

/**
 * The usage_events feature bucket each job is metered under. There are only
 * four metered features in the data model (content_generations, images,
 * slideshows, ai_replies) — classify/customer_reply/reasoning/vision_describe
 * are all inbox/FrontDesk-adjacent jobs and share the ai_replies allowance,
 * while content_gen has its own bucket. See src/lib/types.ts PlanLimits.
 * vision_describe deliberately reuses ai_replies rather than introducing a
 * new PlanLimits/usage key: checkAllowance() (src/lib/usage.ts) fails CLOSED
 * for any feature with no configured limit, so a brand-new key would need a
 * schema/seed migration before it could ever be allowed — describing an
 * attachment is squarely part of "answering this customer," so it shares the
 * bucket instead. conversation_memory (Commander update) is the same call:
 * it only ever runs as a byproduct of answering/holding a FrontDesk
 * conversation, so it meters under ai_replies too rather than minting a new
 * PlanLimits key. memory_search (Outlast wave 5) is the same story — an
 * owner-triggered convenience search over the same inbox content, not a
 * distinct product surface, so it shares ai_replies too.
 */
const JOB_FEATURE: Record<AiJob, UsageFeature> = {
  classify: "ai_replies",
  content_gen: "content_generations",
  customer_reply: "ai_replies",
  reasoning: "ai_replies",
  vision_describe: "ai_replies",
  conversation_memory: "ai_replies",
  memory_search: "ai_replies",
}

/** $/1M tokens (input, output). Estimates — verify against provider pricing pages before scale. */
const MODEL_PRICING: Record<string, { inputPerMTok: number; outputPerMTok: number }> = {
  "meta-llama/llama-3.1-8b-instruct:free": { inputPerMTok: 0, outputPerMTok: 0 },
  "google/gemini-2.0-flash-lite-001": { inputPerMTok: 0.075, outputPerMTok: 0.3 },
  "openai/gpt-5-nano": { inputPerMTok: 0.05, outputPerMTok: 0.4 },
  "google/gemini-2.5-flash": { inputPerMTok: 0.3, outputPerMTok: 2.5 },
  "deepseek/deepseek-chat": { inputPerMTok: 0.14, outputPerMTok: 0.28 },
  "anthropic/claude-haiku-4.5": { inputPerMTok: 1, outputPerMTok: 5 },
  "google/gemini-2.5-flash-lite": { inputPerMTok: 0.1, outputPerMTok: 0.4 },
}

/** Conservative fallback estimate for any model id not in MODEL_PRICING. */
const DEFAULT_PRICING = { inputPerMTok: 0.5, outputPerMTok: 1.5 }

/** Ordered candidate model ids for a job, cheapest-effective first. */
export function pickModel(job: AiJob): string[] {
  return MODEL_CANDIDATES[job]
}

export function estimateCostUsd(model: string, promptTokens: number, completionTokens: number): number {
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
      // 402 = the OpenRouter ACCOUNT is out of credits (discovered live
      // 2026-08-02: replies died mid-conversation with a generic throw, so
      // routes crash-logged instead of soft-escalating). It's account-wide —
      // no other candidate can succeed either — so surface it as the same
      // typed error the spend guard uses: every caller already knows how to
      // fail gracefully on AllowanceDeniedError (silent escalate, no
      // typing-then-ghosting, honest "out of quota" states in the UI).
      if (error instanceof OpenRouterRequestError && error.status === 402) {
        // Never-go-dark watchdog (2026-08-02 outage): fire the SAME
        // dedupe-guarded admin email the 6h cron sends, but instantly — the
        // owner hears about a real failure within seconds, not at the next
        // tick. Fire-and-forget: must never delay or fail this throw.
        void notifyOpenRouterOutOfCredits().catch((notifyError) =>
          console.error("[router] failed to notify admin of OpenRouter 402", notifyError)
        )
        throw new AllowanceDeniedError(feature, "OpenRouter account is out of credits — top up at openrouter.ai/settings/credits.")
      }
      lastError = error
      // Try the next candidate on any failure (network, 4xx/5xx, bad model id).
      continue
    }
  }

  const reason = lastError instanceof Error ? lastError.message : String(lastError)
  throw new Error(`runTextJob: all candidate models failed for job "${input.job}": ${reason}`)
}
