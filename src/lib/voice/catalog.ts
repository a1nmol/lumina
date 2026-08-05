// Curated stock-voice catalog for the AI Phone Receptionist (Retell hosted-
// agent pilot, MASTER_PLAN.md §4.D "Voice [V2, metered+capped]"). Pure data —
// no I/O, no env reads — so the settings UI (wave V2) and voice-actions.ts
// can validate/render this without a network round-trip.
//
// TODO-VERIFY (needs RETELL_API_KEY / live Retell dashboard to confirm):
// these ids follow Retell's documented `<provider>-<Name>` voice-id
// convention (e.g. ElevenLabs-backed "11labs-Adrian", OpenAI-backed
// "openai-Alloy", Deepgram-backed "deepgram-Angus") as of Retell's public
// docs, but Retell's actual catalog changes over time and per-account
// availability can vary. Before enabling voice for real, list voices via
// Retell's `GET /list-voices` and reconcile this file's ids against the
// live response — createOrUpdateAgentForOrg (src/lib/voice/retell.ts) sends
// whatever id is stored here straight through, so a stale id fails at
// agent-creation time, not silently.

export type VoiceGender = "male" | "female" | "neutral"

export interface VoiceCatalogEntry {
  /** Retell voice id — sent verbatim as response_engine.voice_id. */
  id: string
  /** Shown in the settings UI. */
  label: string
  gender: VoiceGender
  /** One short phrase describing the vibe, for the settings picker. */
  vibe: string
}

export const VOICE_CATALOG: VoiceCatalogEntry[] = [
  { id: "11labs-Adrian", label: "Adrian", gender: "male", vibe: "Warm, steady, front-desk professional" },
  { id: "11labs-Amelia", label: "Amelia", gender: "female", vibe: "Bright, friendly, quick-paced" },
  { id: "11labs-Cimo", label: "Cimo", gender: "male", vibe: "Calm, reassuring, slower cadence" },
  { id: "11labs-Chloe", label: "Chloe", gender: "female", vibe: "Upbeat, energetic, casual" },
  { id: "openai-Alloy", label: "Alloy", gender: "neutral", vibe: "Clear, neutral, efficient" },
  { id: "deepgram-Luna", label: "Luna", gender: "female", vibe: "Soft, conversational, easygoing" },
]

export const DEFAULT_VOICE_ID = "11labs-Adrian"

/** True iff `voiceId` is a known catalog entry — used to validate settings writes. */
export function isKnownVoiceId(voiceId: string): boolean {
  return VOICE_CATALOG.some((entry) => entry.id === voiceId)
}

/** Looks up one catalog entry by id, or null if unknown. */
export function findVoiceCatalogEntry(voiceId: string | null | undefined): VoiceCatalogEntry | null {
  if (!voiceId) return null
  return VOICE_CATALOG.find((entry) => entry.id === voiceId) ?? null
}
