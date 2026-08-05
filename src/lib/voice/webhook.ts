// Pure helpers for src/app/api/webhooks/retell/route.ts — split out (same
// convention as src/lib/watchdog.ts's "1. pure / 2. impure" split) so the
// tricky parts (transcript -> messages mapping, signature verification,
// minute-cap arithmetic, cost estimation) are unit-tested with zero
// network/DB involved. The route itself does only I/O + orchestration.

import { createHmac, timingSafeEqual } from "node:crypto"

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

/**
 * TODO-VERIFY (needs RETELL_API_KEY / a live webhook delivery to confirm):
 * Retell signs webhook deliveries with the `x-retell-signature` header —
 * implemented here as the hex HMAC-SHA256 of the raw JSON body under the
 * Retell API key, optionally prefixed "sha256=" (defensively stripped if
 * present, mirroring how some providers format this header), matching this
 * codebase's other webhook signature conventions (src/lib/twilio.ts,
 * src/app/api/webhooks/instagram/route.ts). Confirm the exact scheme against
 * Retell's live docs/a real delivery before relying on this to reject
 * traffic — until then this is defense-in-depth, not the only gate (the
 * route also only trusts to_number/agent_id lookups it already owns).
 */
export function verifyRetellSignature(rawBody: string, signatureHeader: string | null, apiKey: string): boolean {
  if (!signatureHeader) return false

  const provided = signatureHeader.startsWith("sha256=") ? signatureHeader.slice("sha256=".length) : signatureHeader
  const expected = createHmac("sha256", apiKey).update(rawBody, "utf8").digest("hex")

  const expectedBuffer = Buffer.from(expected)
  const providedBuffer = Buffer.from(provided)
  if (expectedBuffer.length !== providedBuffer.length) return false

  return timingSafeEqual(expectedBuffer, providedBuffer)
}

// ---------------------------------------------------------------------------
// Transcript -> messages mapping
// ---------------------------------------------------------------------------

/** One entry of Retell's `call.transcript_object[]` — parsed defensively, field names vary across Retell SDK versions in community reports. */
export interface RawRetellTranscriptUtterance {
  role?: string
  speaker?: string
  content?: string
  text?: string
  message?: string
  words?: unknown
}

export interface MappedVoiceMessage {
  direction: "inbound" | "outbound"
  body: string
  /** True for the agent's turns (Retell-generated speech), false for the caller's. */
  ai_handled: boolean
}

/** Hard ceiling on how many utterances one call ingests, and how long any single one is stored — a pathological/looping call must never produce an unbounded write. */
export const MAX_TRANSCRIPT_UTTERANCES = 200
export const MAX_UTTERANCE_LENGTH = 1000

function normalizeRole(raw: RawRetellTranscriptUtterance): "agent" | "user" | null {
  const value = (raw.role ?? raw.speaker ?? "").toLowerCase().trim()
  if (value === "agent" || value === "assistant" || value === "bot") return "agent"
  if (value === "user" || value === "customer" || value === "caller" || value === "human") return "user"
  return null
}

function normalizeContent(raw: RawRetellTranscriptUtterance): string | null {
  const value = (raw.content ?? raw.text ?? raw.message ?? "").toString().trim()
  return value.length > 0 ? value : null
}

/**
 * Turns Retell's transcript_object[] into the ordered messages rows to
 * insert — capped at MAX_TRANSCRIPT_UTTERANCES entries, each truncated to
 * MAX_UTTERANCE_LENGTH. Unparseable entries (unknown role, empty content)
 * are skipped rather than dropping the whole call.
 */
export function mapTranscriptToMessages(
  transcriptObject: RawRetellTranscriptUtterance[] | null | undefined
): MappedVoiceMessage[] {
  if (!Array.isArray(transcriptObject)) return []

  const mapped: MappedVoiceMessage[] = []
  for (const raw of transcriptObject) {
    if (mapped.length >= MAX_TRANSCRIPT_UTTERANCES) break
    if (!raw || typeof raw !== "object") continue

    const role = normalizeRole(raw)
    const content = normalizeContent(raw)
    if (!role || !content) continue

    mapped.push({
      direction: role === "agent" ? "outbound" : "inbound",
      body: content.slice(0, MAX_UTTERANCE_LENGTH),
      ai_handled: role === "agent",
    })
  }

  return mapped
}

/**
 * Fallback for when transcript_object isn't present but a plain `transcript`
 * string is (Retell sends both on call_ended; transcript_object is the
 * structured one). Splits on Retell's documented "Agent:"/"User:" line
 * prefixes — best-effort, used only when transcript_object is missing/empty.
 */
export function mapPlainTranscriptToMessages(transcript: string | null | undefined): MappedVoiceMessage[] {
  if (!transcript || typeof transcript !== "string") return []

  const mapped: MappedVoiceMessage[] = []
  const lines = transcript.split(/\r?\n/)
  for (const line of lines) {
    if (mapped.length >= MAX_TRANSCRIPT_UTTERANCES) break
    const match = /^\s*(Agent|User)\s*:\s*(.+)$/i.exec(line)
    if (!match) continue
    const role = match[1].toLowerCase()
    const content = match[2].trim()
    if (!content) continue
    mapped.push({
      direction: role === "agent" ? "outbound" : "inbound",
      body: content.slice(0, MAX_UTTERANCE_LENGTH),
      ai_handled: role === "agent",
    })
  }
  return mapped
}

// ---------------------------------------------------------------------------
// Cost + minute-cap arithmetic
// ---------------------------------------------------------------------------

/** DIY-floor estimate from MASTER_PLAN.md §5 ("~$0.08/min DIY floor") plus Retell's own per-minute platform fee — $0.0785/min is a deliberately round, slightly-padded stand-in until real Retell billing data is available. TODO-VERIFY against an actual Retell invoice once the pilot has live calls. */
export const ESTIMATED_COST_PER_MINUTE_USD = 0.0785

/** Rounds up to the nearest whole minute, matching how phone billing (and Retell's own metering) typically works — a 61-second call costs 2 minutes, not 1.02. */
export function callDurationMinutes(durationSecs: number): number {
  if (!Number.isFinite(durationSecs) || durationSecs <= 0) return 0
  return Math.ceil(durationSecs / 60)
}

export function estimateCallCostUsd(durationSecs: number): number {
  return Number((callDurationMinutes(durationSecs) * ESTIMATED_COST_PER_MINUTE_USD).toFixed(4))
}

/**
 * True iff the org still has voice minutes left this month, given its usage
 * so far (including the call that just ended) and its configured monthly
 * cap. A non-positive cap is treated as "no minutes allowed" (fail closed,
 * matching src/lib/usage.ts#checkAllowance's philosophy) rather than
 * unlimited.
 */
export function hasVoiceMinutesRemaining(usedMinutesThisMonth: number, capMinutes: number): boolean {
  if (capMinutes <= 0) return false
  return usedMinutesThisMonth < capMinutes
}
