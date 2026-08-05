"use server"

// Server actions for the Settings hub's AI Phone Receptionist card (UI comes
// in a later wave — this is the backend surface only). Reads go through the
// RLS-scoped client (org_voice_settings has a select-only policy — see
// migration 0020's header comment), matching src/app/(app)/settings/standing-orders-actions.ts.
// Writes go through the service-role admin client since agent provisioning
// must stay server-controlled (same reasoning as entitlements), matching
// migration 0020's own comment on the table. No-ops/degrades cleanly in
// demo mode (Supabase unconfigured) and whenever RETELL_API_KEY isn't set —
// every action returns a typed reason instead of throwing.

import { isValidPhone } from "@/app/api/frontdesk/_shared"
import { getCurrentOrgId } from "@/lib/org"
import { createAdminClient, isSupabaseConfigured as isAdminConfigured } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import { isKnownVoiceId } from "@/lib/voice/catalog"
import { createOrUpdateAgentForOrg, createTestCall, disableVoiceAgent, isRetellConfigured } from "@/lib/voice/retell"
import type { OrgVoiceSettings } from "@/lib/types"

const MAX_SCRIPT_LENGTH = 500
const MIN_MAX_MINUTES = 5
const MAX_MAX_MINUTES = 1000

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export interface GetVoiceSettingsResult {
  settings: OrgVoiceSettings | null
  /** False in demo mode (Supabase unconfigured) — the UI should show a local-only preview. */
  isLive: boolean
  /** False when RETELL_API_KEY isn't set — enableVoice will always fail with reason "not_configured" until this is true. */
  retellConfigured: boolean
}

/** Reads this org's voice settings row (null if it doesn't exist yet — the org has never saved/enabled voice). */
export async function getVoiceSettings(): Promise<GetVoiceSettingsResult> {
  const retellConfigured = isRetellConfigured()

  if (!isSupabaseConfigured()) return { settings: null, isLive: false, retellConfigured }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { settings: null, isLive: true, retellConfigured }

  const supabase = await createClient()
  const { data, error } = await supabase.from("org_voice_settings").select().eq("org_id", orgId).maybeSingle()

  if (error) {
    console.error("[settings/voice-actions] failed to load voice settings", error.message)
    return { settings: null, isLive: true, retellConfigured }
  }

  return { settings: data ?? null, isLive: true, retellConfigured }
}

// ---------------------------------------------------------------------------
// Save (config fields only — never enabled/retell_agent_id/phone_number,
// which are provisioning outputs owned by enableVoice/importTwilioNumber)
// ---------------------------------------------------------------------------

export interface SaveVoiceSettingsInput {
  voiceId?: string | null
  greeting?: string | null
  afterHoursScript?: string | null
  transferNumber?: string | null
  maxMinutesMonth?: number
}

export interface SaveVoiceSettingsResult {
  ok: boolean
  reason?: "no-org" | "invalid-payload"
  settings?: OrgVoiceSettings
}

function validateSaveInput(input: SaveVoiceSettingsInput): boolean {
  if (input.voiceId != null && !isKnownVoiceId(input.voiceId)) return false
  if (input.greeting != null && input.greeting.length > MAX_SCRIPT_LENGTH) return false
  if (input.afterHoursScript != null && input.afterHoursScript.length > MAX_SCRIPT_LENGTH) return false
  if (input.transferNumber != null && input.transferNumber.trim() !== "" && !isValidPhone(input.transferNumber)) return false
  if (
    input.maxMinutesMonth !== undefined &&
    (!Number.isFinite(input.maxMinutesMonth) || input.maxMinutesMonth < MIN_MAX_MINUTES || input.maxMinutesMonth > MAX_MAX_MINUTES)
  ) {
    return false
  }
  return true
}

/**
 * Upserts the org's voice config fields. Only the keys present in `input`
 * are written — Supabase's upsert only touches the columns you pass, so an
 * omitted field (e.g. saving just the greeting) never clobbers the others,
 * and a brand-new row falls back to migration 0020's column defaults
 * (enabled false, max_minutes_month 60) for anything left unset.
 */
export async function saveVoiceSettings(input: SaveVoiceSettingsInput): Promise<SaveVoiceSettingsResult> {
  if (!validateSaveInput(input)) return { ok: false, reason: "invalid-payload" }

  if (!isAdminConfigured()) return { ok: true }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: false, reason: "no-org" }

  const admin = createAdminClient()

  const patch: Partial<OrgVoiceSettings> & Pick<OrgVoiceSettings, "org_id"> = {
    org_id: orgId,
    updated_at: new Date().toISOString(),
  }
  if (input.voiceId !== undefined) patch.voice_id = input.voiceId
  if (input.greeting !== undefined) patch.greeting = input.greeting?.trim() || null
  if (input.afterHoursScript !== undefined) patch.after_hours_script = input.afterHoursScript?.trim() || null
  if (input.transferNumber !== undefined) patch.transfer_number = input.transferNumber?.trim() || null
  if (input.maxMinutesMonth !== undefined) patch.max_minutes_month = input.maxMinutesMonth

  const { data, error } = await admin.from("org_voice_settings").upsert(patch, { onConflict: "org_id" }).select().single()

  if (error || !data) {
    console.error("[settings/voice-actions] failed to save voice settings", error?.message)
    return { ok: false, reason: "invalid-payload" }
  }

  return { ok: true, settings: data }
}

// ---------------------------------------------------------------------------
// Enable / disable (provisioning)
// ---------------------------------------------------------------------------

export interface EnableVoiceResult {
  ok: boolean
  reason?: "not_configured" | "no_number" | "no-org" | "provision_failed"
  detail?: string
}

/**
 * Turns voice on for this org: requires RETELL_API_KEY configured AND a
 * phone_number already imported (see src/lib/voice/retell.ts#importTwilioNumber,
 * a separate wave-V2 action once the number-import UI exists). Provisions/
 * updates the Retell agent from the current Business Brain + settings, then
 * flips `enabled` true only once that succeeds — never optimistically.
 */
export async function enableVoice(): Promise<EnableVoiceResult> {
  if (!isAdminConfigured()) return { ok: false, reason: "not_configured", detail: "Supabase is not configured." }
  if (!isRetellConfigured()) return { ok: false, reason: "not_configured", detail: "RETELL_API_KEY is not set." }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: false, reason: "no-org" }

  const admin = createAdminClient()
  const { data: settings } = await admin.from("org_voice_settings").select("phone_number").eq("org_id", orgId).maybeSingle()

  if (!settings?.phone_number) {
    return { ok: false, reason: "no_number", detail: "Import a phone number before enabling voice." }
  }

  const result = await createOrUpdateAgentForOrg(orgId)
  if (!result.ok) {
    return { ok: false, reason: "provision_failed", detail: result.detail ?? "Failed to provision the Retell agent." }
  }

  const { error } = await admin.from("org_voice_settings").update({ enabled: true, updated_at: new Date().toISOString() }).eq("org_id", orgId)

  if (error) {
    console.error("[settings/voice-actions] agent provisioned but failed to flip enabled=true", error.message)
    return { ok: false, reason: "provision_failed", detail: "Provisioned on Retell but failed to save locally — retry." }
  }

  return { ok: true }
}

export interface DisableVoiceResult {
  ok: boolean
  reason?: "no-org"
}

/** Turns voice off — thin wrapper around src/lib/voice/retell.ts#disableVoiceAgent (the same seam the automatic minute-cap cutoff uses). */
export async function disableVoice(): Promise<DisableVoiceResult> {
  if (!isAdminConfigured()) return { ok: true }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: false, reason: "no-org" }

  await disableVoiceAgent(orgId)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Test call
// ---------------------------------------------------------------------------

export interface RequestTestCallResult {
  ok: boolean
  reason?: "not_configured" | "no-org" | "invalid-payload" | "request_failed"
  detail?: string
}

/** Places a one-off outbound test call from the org's bound number to `toNumber`, using its provisioned agent. */
export async function requestTestCall(toNumber: string): Promise<RequestTestCallResult> {
  if (!isValidPhone(toNumber)) return { ok: false, reason: "invalid-payload" }

  if (!isAdminConfigured()) return { ok: false, reason: "not_configured", detail: "Supabase is not configured." }
  if (!isRetellConfigured()) return { ok: false, reason: "not_configured", detail: "RETELL_API_KEY is not set." }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: false, reason: "no-org" }

  const result = await createTestCall(orgId, toNumber.trim())
  if (!result.ok) return { ok: false, reason: "request_failed", detail: result.detail }

  return { ok: true }
}
