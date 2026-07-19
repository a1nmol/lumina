import "server-only"

// Review-reply drafting — the "review management" half of Local Growth
// (MASTER_PLAN.md §4.F). Routes through the shared model router's
// "customer_reply" job, which is PINNED to Claude Haiku 4.5 first
// (src/lib/ai/router.ts MODEL_CANDIDATES.customer_reply) — same PII-safe
// reasoning as src/lib/ai/frontdesk-reply.ts: a review carries a real
// customer's name and words, so this must never be routed to a free-tier
// model that may train on it (MASTER_PLAN.md §5: "NEVER send customer PII to
// free tiers").
//
// Returns null when OpenRouter/Supabase aren't configured (demo mode) or the
// model can't produce usable JSON after one retry — callers should fall back
// to a canned demo draft (see the `reply_status: "ai_draft"` rows in
// src/lib/demo.ts DEMO_REVIEWS), exactly like frontdesk-reply.ts does for
// the inbox.
//
// AllowanceDeniedError (spend guard / quota) is NOT swallowed here — it
// propagates up through runTextJob (which already meters usage against the
// org's `ai_replies` allowance) so the caller can surface a real
// "out of quota" state instead of silently drafting nothing.

import { isSupabaseConfigured } from "@/lib/supabase/config"
import type { BusinessBrain, Review } from "@/lib/types"

import type { ChatMessage } from "./openrouter"
import { isOpenRouterConfigured } from "./openrouter"
import { runTextJob } from "./router"

export interface DraftReviewReplyInput {
  orgId: string
  businessBrain: BusinessBrain | null
  review: Review
}

export interface DraftedReviewReply {
  reply: string
  model: string
  costUsd: number
}

// Generous character ceiling as a defensive backstop — the real limit is the
// ~80-word cap below, enforced both in the prompt and after parsing.
const MAX_REPLY_LENGTH = 600
const MAX_REPLY_WORDS = 80
const MAX_RETRIES = 1 // one regeneration attempt on parse failure, matching frontdesk-reply.ts.

/** Builds a tight system prompt from the Business Brain — tone + business identity, mirroring frontdesk-reply.ts's approach. */
function buildSystemPrompt(brain: BusinessBrain | null): string {
  const intro = brain
    ? `You are replying, as the owner, to a public ${brain.category ? `${brain.category} ` : ""}business review left for ${
        brain.business_name ?? "the business"
      }.`
    : "You are replying, as the owner, to a public review left for a local small business."

  return [
    intro,
    brain?.tone ? `Brand voice: ${brain.tone}.` : null,
    "Thank the reviewer by first name, briefly and specifically acknowledge what they said (praise or a concern), and keep it warm and genuine — never generic or corporate-sounding.",
    "For a critical review (1-3 stars), acknowledge the issue without being defensive and invite them to reach out so it can be made right — do not make specific promises (refunds, discounts, comps) you can't guarantee.",
    `Keep the reply to ${MAX_REPLY_WORDS} words or fewer.`,
  ]
    .filter((line): line is string => Boolean(line))
    .join(" ")
}

function firstName(name: string | null): string {
  if (!name) return "there"
  return name.trim().split(/\s+/)[0] || "there"
}

function buildInstructionMessage(review: Review): ChatMessage {
  return {
    role: "user",
    content: [
      `Platform: ${review.platform}. Reviewer: ${firstName(review.reviewer_name)}. Rating: ${review.rating}/5.`,
      review.body ? `Review text: "${review.body}"` : "Review text: (no written comment, rating only)",
      "Draft a reply to this review.",
      "Respond with ONLY strict JSON, no markdown code fences, no commentary before or after — exactly this shape:",
      '{"reply": string}',
    ].join("\n"),
  }
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

interface ParsedReviewReplyJson {
  reply: string
}

/** Defensively extracts + validates the model's JSON reply. Returns null on any shape/length problem. */
function parseReplyJson(raw: string): ParsedReviewReplyJson | null {
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

  const reply = typeof obj.reply === "string" ? obj.reply.trim() : ""
  if (!reply || reply.length > MAX_REPLY_LENGTH) return null
  if (countWords(reply) > MAX_REPLY_WORDS) return null

  return { reply }
}

/**
 * Drafts a reply to one review via the model router's PII-safe
 * "customer_reply" job (Claude Haiku 4.5 — see the module header). Returns
 * null when not configured or the model can't produce usable JSON after one
 * retry — the caller should fall back to a canned demo draft. Throws
 * AllowanceDeniedError when the org is out of `ai_replies` quota (see
 * src/lib/ai/router.ts).
 */
export async function draftReviewReply(input: DraftReviewReplyInput): Promise<DraftedReviewReply | null> {
  if (!isOpenRouterConfigured() || !isSupabaseConfigured()) return null

  const baseMessages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(input.businessBrain) },
    buildInstructionMessage(input.review),
  ]

  const retryMessage: ChatMessage = {
    role: "user",
    content:
      "Your last reply was not valid JSON matching the requested shape, or exceeded 80 words. Respond again with ONLY the strict JSON object, 80 words or fewer — nothing else.",
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const messages = attempt === 0 ? baseMessages : [...baseMessages, retryMessage]

    const result = await runTextJob({
      orgId: input.orgId,
      job: "customer_reply",
      messages,
      maxTokens: 250,
      temperature: 0.6,
    })

    const parsed = parseReplyJson(result.text)
    if (parsed) {
      return { ...parsed, model: result.model, costUsd: result.costUsd }
    }
  }

  return null
}
