import "server-only"

// fal.ai FLUX.1 [schnell] image generation (MASTER_PLAN.md §5 — "Bulk images
// → FLUX.1 schnell (~$0.0005)"). Plain fetch, no SDK, so behavior/cost is
// fully auditable in one file.

import { checkAllowance, recordUsage } from "@/lib/usage"

import { AllowanceDeniedError } from "./errors"

const FAL_FLUX_SCHNELL_URL = "https://fal.run/fal-ai/flux/schnell"
const MAX_PROMPT_LENGTH = 1000
/** ~$0.0005/image per MASTER_PLAN §5 — the whole cost table for this route lives here. */
const COST_PER_IMAGE_USD = 0.0005

export class FalNotConfiguredError extends Error {
  constructor() {
    super("fal.ai is not configured. Set FAL_KEY in .env.local.")
    this.name = "FalNotConfiguredError"
  }
}

export class FalRequestError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = "FalRequestError"
    this.status = status
  }
}

/** True once FAL_KEY is present. */
export function isFalConfigured(): boolean {
  return Boolean(process.env.FAL_KEY)
}

export interface GenerateImageInput {
  orgId: string
  prompt: string
}

export interface GenerateImageResult {
  url: string
  costUsd: number
}

interface FalFluxSchnellResponse {
  images?: Array<{ url?: string }>
}

/**
 * Generates one image via fal.ai FLUX schnell. Returns null (not a throw)
 * when fal.ai isn't configured, so callers can fall back to demo media.
 * Throws AllowanceDeniedError when the org is out of "images" quota — that
 * is a real quota state, not a "not configured" state, so it propagates.
 */
export async function generateImage(input: GenerateImageInput): Promise<GenerateImageResult | null> {
  if (!isFalConfigured()) return null

  const allowance = await checkAllowance(input.orgId, "images")
  if (!allowance.allowed) {
    throw new AllowanceDeniedError("images", allowance.reason)
  }

  const prompt = input.prompt.trim().slice(0, MAX_PROMPT_LENGTH)
  if (!prompt) {
    throw new Error("generateImage: prompt is required")
  }

  const res = await fetch(FAL_FLUX_SCHNELL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${process.env.FAL_KEY}`,
    },
    body: JSON.stringify({
      prompt,
      image_size: "square_hd",
      num_images: 1,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new FalRequestError(`fal.ai request failed (${res.status}): ${body.slice(0, 300)}`, res.status)
  }

  const json = (await res.json()) as FalFluxSchnellResponse
  const url = json.images?.[0]?.url

  if (typeof url !== "string" || !url) {
    throw new FalRequestError("fal.ai response did not include an image URL")
  }

  await recordUsage(input.orgId, {
    feature: "images",
    model: "fal-ai/flux/schnell",
    units: 1,
    costUsd: COST_PER_IMAGE_USD,
    metadata: { prompt },
  })

  return { url, costUsd: COST_PER_IMAGE_USD }
}
