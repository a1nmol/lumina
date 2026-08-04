import "server-only"

// Voice-note transcription for inbound Instagram DM audio attachments
// (Senses Wave) — lets the FrontDesk AI react to what a customer SAID
// instead of the honest-blind "[sent a voice message you can't hear]"
// fallback. Uses Deepgram Nova-3's prerecorded-URL mode directly (NOT the
// OpenRouter model router — Deepgram is a speech API, not a chat-completions
// endpoint), but still respects the same MASTER_PLAN.md §5 rules every other
// customer-facing model call does: paid only (never a free tier — this
// carries real customer voice/PII), and metered against the org's
// `ai_replies` allowance/spend cap via the same src/lib/usage.ts seam
// runTextJob uses internally.
//
// DEEPGRAM_API_KEY may not be configured yet (see .env.example) — every
// caller must treat a null return as "no transcript available" and fall back
// to the honest-blind placeholder, exactly like describeImageAttachment's own
// contract for images. Never throws.

import { isSupabaseConfigured } from "@/lib/supabase/config"
import { checkAllowance, recordUsage } from "@/lib/usage"

const DEEPGRAM_TIMEOUT_MS = 15000
const MAX_TRANSCRIPT_LENGTH = 800
const DEEPGRAM_MODEL_ID = "deepgram/nova-3-prerecorded"
// MASTER_PLAN.md §5's documented Deepgram Nova-3 rate (~$0.0077/min).
const DEEPGRAM_COST_PER_MINUTE_USD = 0.0077
// Flat estimate used only when Deepgram's response omits `metadata.duration`
// (shouldn't normally happen, but cost tracking must never throw on it).
const FLAT_FALLBACK_COST_USD = 0.001

export interface TranscribeVoiceNoteInput {
  orgId: string
  audioUrl: string
}

export interface TranscribedVoiceNote {
  transcript: string
  model: string
  costUsd: number
}

/** True iff DEEPGRAM_API_KEY is set — callers use this to decide whether to even attempt transcription vs. degrade straight to honest-blind. */
export function isDeepgramConfigured(): boolean {
  return Boolean(process.env.DEEPGRAM_API_KEY?.trim())
}

interface DeepgramListenResponse {
  metadata?: { duration?: number }
  results?: {
    channels?: Array<{ alternatives?: Array<{ transcript?: string }> }>
  }
}

/**
 * Transcribes a customer-sent Instagram voice-note CDN url via Deepgram
 * Nova-3's prerecorded-URL mode. Returns null (never throws) when
 * DEEPGRAM_API_KEY/Supabase aren't configured, the org is out of `ai_replies`
 * allowance, the url is blank, the request errors/times out (15s), or the
 * response carries no usable transcript. On success, meters the real cost
 * (estimated from Deepgram's returned duration, or a flat fallback) against
 * the org via the same `recordUsage` seam every other metered feature uses —
 * a metering failure is logged but still returns the transcript, since
 * dropping a usable transcript over a bookkeeping error would be worse than
 * an under-counted usage row.
 */
export async function transcribeVoiceNote(input: TranscribeVoiceNoteInput): Promise<TranscribedVoiceNote | null> {
  const apiKey = process.env.DEEPGRAM_API_KEY?.trim()
  if (!apiKey || !isSupabaseConfigured()) return null

  const audioUrl = input.audioUrl.trim()
  if (!audioUrl) return null

  // Same spend-guard/allowance seam every other paid customer-facing call
  // goes through (src/lib/ai/router.ts's runTextJob checks this before every
  // OpenRouter call) — Deepgram is a paid, metered per-minute call, so it
  // must respect the org's ai_replies allowance/spend cap too even though it
  // never touches OpenRouter. Best-effort: a failed check just skips
  // transcription (falls back to honest-blind) rather than blocking the reply.
  try {
    const allowance = await checkAllowance(input.orgId, "ai_replies")
    if (!allowance.allowed) return null
  } catch (error) {
    console.error("[ai/transcribe-audio] allowance check failed — skipping transcription", error)
    return null
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEEPGRAM_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch("https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true", {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: audioUrl }),
      signal: controller.signal,
    })
  } catch (error) {
    console.error("[ai/transcribe-audio] Deepgram request failed", error instanceof Error ? error.message : error)
    return null
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    console.error("[ai/transcribe-audio] Deepgram responded with a non-2xx status", res.status)
    return null
  }

  let data: DeepgramListenResponse
  try {
    data = (await res.json()) as DeepgramListenResponse
  } catch (error) {
    console.error("[ai/transcribe-audio] failed to parse Deepgram response", error)
    return null
  }

  const transcript = data.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim()
  if (!transcript) return null

  const durationSeconds = typeof data.metadata?.duration === "number" ? data.metadata.duration : null
  const costUsd =
    durationSeconds !== null
      ? Math.round((durationSeconds / 60) * DEEPGRAM_COST_PER_MINUTE_USD * 1_000_000) / 1_000_000
      : FLAT_FALLBACK_COST_USD

  try {
    await recordUsage(input.orgId, {
      // vision_describe reuses the ai_replies bucket for the same reason
      // (src/lib/ai/router.ts's JOB_FEATURE doc comment) — describing/
      // transcribing an attachment is squarely part of "answering this
      // customer," not a distinct metered product surface.
      feature: "ai_replies",
      model: DEEPGRAM_MODEL_ID,
      units: 1,
      costUsd,
      metadata: { job: "voice_transcribe", durationSeconds },
    })
  } catch (error) {
    console.error("[ai/transcribe-audio] failed to record usage", error)
  }

  return { transcript: transcript.slice(0, MAX_TRANSCRIPT_LENGTH), model: DEEPGRAM_MODEL_ID, costUsd }
}
