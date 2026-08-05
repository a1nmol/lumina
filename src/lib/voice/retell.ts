import "server-only"

// Thin Retell AI REST client — the AI Phone Receptionist's hosted-agent
// pilot (owner-approved architecture: Retell runs STT/TTS/turn-taking for
// us; we push a per-org prompt and ingest its webhooks — NOT the
// custom-LLM WebSocket approach, which needs a sidecar and is deferred).
// Deliberately dependency-free (plain fetch, no SDK), mirroring
// src/lib/twilio.ts and src/lib/email.ts's conventions: a *NotConfiguredError-
// free "returns a typed result, never throws" contract (unlike twilio.ts,
// which throws — this client's callers are settings server actions and a
// cron/webhook-adjacent cap-enforcement path, both of which need to degrade
// gracefully rather than 500).
//
// EVERY endpoint path/field name below is TODO-VERIFY against Retell's live
// docs (https://docs.retellai.com) once RETELL_API_KEY exists — written
// defensively (parse-don't-assume optional fields) per the build spec, since
// this cannot be exercised against the real API yet.

import { buildVoicePrompt } from "@/lib/voice/prompt"
import { DEFAULT_VOICE_ID } from "@/lib/voice/catalog"
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin"
import type { BusinessBrain } from "@/lib/types"

const RETELL_API_BASE = "https://api.retellai.com"
const REQUEST_TIMEOUT_MS = 15_000

/** True once RETELL_API_KEY is present. Every export below no-ops (returns a typed "not_configured" result) when this is false, so the whole voice surface degrades cleanly with no key. */
export function isRetellConfigured(): boolean {
  return Boolean(process.env.RETELL_API_KEY?.trim())
}

function webhookUrl(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  return `${appUrl}/api/webhooks/retell`
}

export type RetellErrorReason = "not_configured" | "request_failed" | "not_found" | "invalid_response"

export interface RetellActionResult {
  ok: boolean
  reason?: RetellErrorReason
  /** Human-readable detail for logs — never includes the API key. */
  detail?: string
}

/**
 * Fetch wrapper: 15s timeout, JSON body, bearer auth. Never logs the API
 * key. Returns `{ ok: false }` (never throws) on network failure, timeout,
 * or a non-2xx response — callers inspect `.ok`/`.status`/`.json` to decide
 * how to proceed. `path` must start with "/".
 */
async function retellFetch(
  path: string,
  init: { method: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown }
): Promise<{ ok: boolean; status: number; json: unknown }> {
  const apiKey = process.env.RETELL_API_KEY?.trim()
  if (!apiKey) return { ok: false, status: 0, json: null }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const res = await fetch(`${RETELL_API_BASE}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    })

    let json: unknown = null
    try {
      json = await res.json()
    } catch {
      // Some Retell endpoints may return an empty body on success (e.g. DELETE) — not an error.
      json = null
    }

    return { ok: res.ok, status: res.status, json }
  } catch (error) {
    console.error(`[voice/retell] request to ${path} failed`, error instanceof Error ? error.message : error)
    return { ok: false, status: 0, json: null }
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// create-retell-llm / agent provisioning
// ---------------------------------------------------------------------------

interface RetellLlmResponse {
  llm_id?: string
  /** TODO-VERIFY: some Retell API versions call this `id` instead of `llm_id`. */
  id?: string
}

interface RetellAgentResponse {
  agent_id?: string
  /** TODO-VERIFY: some Retell API versions call this `id` instead of `agent_id`. */
  id?: string
  response_engine?: { type?: string; llm_id?: string }
}

function extractLlmId(json: unknown): string | null {
  const parsed = json as RetellLlmResponse | null
  return parsed?.llm_id ?? parsed?.id ?? null
}

function extractAgentId(json: unknown): string | null {
  const parsed = json as RetellAgentResponse | null
  return parsed?.agent_id ?? parsed?.id ?? null
}

export interface CreateOrUpdateAgentResult extends RetellActionResult {
  agentId?: string
}

/**
 * Provisions (or updates) this org's Retell agent from its current Business
 * Brain + org_voice_settings: creates/updates a retell-llm carrying the
 * spoken system prompt (src/lib/voice/prompt.ts), then creates/updates the
 * agent bound to it with the configured voice + our webhook URL. Persists
 * `retell_agent_id` on org_voice_settings on success. Never throws — every
 * failure mode returns `{ ok: false, reason, detail }` so callers (settings
 * server actions) can show a real error instead of crashing.
 */
export async function createOrUpdateAgentForOrg(orgId: string): Promise<CreateOrUpdateAgentResult> {
  if (!isRetellConfigured()) return { ok: false, reason: "not_configured", detail: "RETELL_API_KEY is not set." }
  if (!isSupabaseConfigured()) return { ok: false, reason: "not_configured", detail: "Supabase is not configured." }

  const admin = createAdminClient()

  const [{ data: brain }, { data: settings, error: settingsError }] = await Promise.all([
    admin.from("business_brain").select().eq("org_id", orgId).maybeSingle(),
    admin.from("org_voice_settings").select().eq("org_id", orgId).maybeSingle(),
  ])

  if (settingsError || !settings) {
    return { ok: false, reason: "not_found", detail: "No org_voice_settings row for this org yet." }
  }

  const { generalPrompt, beginMessage } = buildVoicePrompt(
    (brain as BusinessBrain | null) ?? null,
    { greeting: settings.greeting, after_hours_script: settings.after_hours_script, transfer_number: settings.transfer_number }
  )
  const voiceId = settings.voice_id?.trim() || DEFAULT_VOICE_ID

  // --- Try updating an existing agent first, when we already have one. ---
  const existingAgentId = settings.retell_agent_id?.trim() || null
  if (existingAgentId) {
    const getRes = await retellFetch(`/get-agent/${encodeURIComponent(existingAgentId)}`, { method: "GET" })
    const existingLlmId = getRes.ok ? (getRes.json as RetellAgentResponse)?.response_engine?.llm_id ?? null : null

    if (getRes.ok && existingLlmId) {
      const llmUpdate = await retellFetch(`/update-retell-llm/${encodeURIComponent(existingLlmId)}`, {
        method: "PATCH",
        body: { general_prompt: generalPrompt, begin_message: beginMessage },
      })
      const agentUpdate = await retellFetch(`/update-agent/${encodeURIComponent(existingAgentId)}`, {
        method: "PATCH",
        body: { voice_id: voiceId, webhook_url: webhookUrl() },
      })

      if (llmUpdate.ok && agentUpdate.ok) {
        return { ok: true, agentId: existingAgentId }
      }
      console.error(
        `[voice/retell] update failed for org ${orgId} (llm ok=${llmUpdate.ok}, agent ok=${agentUpdate.ok}) — falling back to re-create`
      )
      // Fall through to re-create below rather than leaving the org stuck.
    } else {
      console.error(`[voice/retell] existing agent ${existingAgentId} for org ${orgId} not found on Retell — re-creating`)
    }
  }

  // --- Create fresh (first-time enable, or the existing agent vanished). ---
  const llmCreate = await retellFetch("/create-retell-llm", {
    method: "POST",
    body: { general_prompt: generalPrompt, begin_message: beginMessage },
  })
  if (!llmCreate.ok) return { ok: false, reason: "request_failed", detail: `create-retell-llm failed (status ${llmCreate.status}).` }

  const llmId = extractLlmId(llmCreate.json)
  if (!llmId) return { ok: false, reason: "invalid_response", detail: "create-retell-llm response had no llm id." }

  const agentCreate = await retellFetch("/create-agent", {
    method: "POST",
    body: {
      response_engine: { type: "retell-llm", llm_id: llmId },
      voice_id: voiceId,
      webhook_url: webhookUrl(),
      agent_name: `lumina-${orgId}`,
    },
  })
  if (!agentCreate.ok) return { ok: false, reason: "request_failed", detail: `create-agent failed (status ${agentCreate.status}).` }

  const agentId = extractAgentId(agentCreate.json)
  if (!agentId) return { ok: false, reason: "invalid_response", detail: "create-agent response had no agent id." }

  const { error: persistError } = await admin
    .from("org_voice_settings")
    .update({ retell_agent_id: agentId, updated_at: new Date().toISOString() })
    .eq("org_id", orgId)

  if (persistError) {
    console.error(`[voice/retell] provisioned agent ${agentId} but failed to persist it for org ${orgId}`, persistError.message)
    return { ok: false, reason: "request_failed", detail: "Agent created on Retell but failed to save locally — retry." }
  }

  return { ok: true, agentId }
}

// ---------------------------------------------------------------------------
// BYO Twilio number import
// ---------------------------------------------------------------------------

export interface ImportTwilioNumberResult extends RetellActionResult {
  phoneNumber?: string
}

/**
 * TODO-VERIFY (cannot exercise without RETELL_API_KEY + a real Twilio
 * number): imports an org's existing Twilio number into Retell so Retell can
 * answer/place calls on it. Retell's docs describe `POST
 * /import-phone-number` taking the E.164 number plus either Twilio
 * account/auth credentials or a SIP termination URI — the exact field names
 * (`termination_uri` vs `sip_trunk_auth_username`/`sip_trunk_auth_password`
 * vs plain `twilio_account_sid`/`twilio_auth_token`) need confirming against
 * the live API reference before this seam is trusted. Implemented against
 * the plain Twilio-credentials shape as the best-guess default; adjust the
 * `body` below once verified. On success, persists `phone_number` on
 * org_voice_settings and (when an agent already exists) binds it as the
 * number's inbound agent via a second best-effort call.
 */
export async function importTwilioNumber(orgId: string, phoneNumber: string): Promise<ImportTwilioNumberResult> {
  if (!isRetellConfigured()) return { ok: false, reason: "not_configured", detail: "RETELL_API_KEY is not set." }
  if (!isSupabaseConfigured()) return { ok: false, reason: "not_configured", detail: "Supabase is not configured." }

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!accountSid || !authToken) {
    return { ok: false, reason: "not_configured", detail: "TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN are required to import a BYO number." }
  }

  const importRes = await retellFetch("/import-phone-number", {
    method: "POST",
    body: {
      phone_number: phoneNumber,
      // TODO-VERIFY exact field names against live Retell docs.
      twilio_account_sid: accountSid,
      twilio_auth_token: authToken,
    },
  })

  if (!importRes.ok) {
    return { ok: false, reason: "request_failed", detail: `import-phone-number failed (status ${importRes.status}).` }
  }

  const admin = createAdminClient()
  const { data: settings } = await admin.from("org_voice_settings").select("retell_agent_id").eq("org_id", orgId).maybeSingle()

  const { error: persistError } = await admin
    .from("org_voice_settings")
    .update({ phone_number: phoneNumber, updated_at: new Date().toISOString() })
    .eq("org_id", orgId)

  if (persistError) {
    console.error(`[voice/retell] imported ${phoneNumber} but failed to persist it for org ${orgId}`, persistError.message)
    return { ok: false, reason: "request_failed", detail: "Number imported on Retell but failed to save locally — retry." }
  }

  // Best-effort: bind the org's existing agent as this number's inbound
  // handler, when one already exists. TODO-VERIFY field name
  // (`inbound_agent_id` is the best guess from Retell's phone-number docs).
  if (settings?.retell_agent_id) {
    const bindRes = await retellFetch(`/update-phone-number/${encodeURIComponent(phoneNumber)}`, {
      method: "PATCH",
      body: { inbound_agent_id: settings.retell_agent_id },
    })
    if (!bindRes.ok) {
      console.error(`[voice/retell] imported ${phoneNumber} for org ${orgId} but failed to bind the inbound agent`)
    }
  }

  return { ok: true, phoneNumber }
}

// ---------------------------------------------------------------------------
// Outbound test call
// ---------------------------------------------------------------------------

interface RetellPhoneCallResponse {
  call_id?: string
  id?: string
}

export interface CreateTestCallResult extends RetellActionResult {
  callId?: string
}

/**
 * Places an outbound "call me now" test call from the org's bound number to
 * `toNumber`, using the org's already-provisioned agent. TODO-VERIFY:
 * `POST /create-phone-call` field names (`from_number`/`to_number`/
 * `override_agent_id`) against live docs.
 */
export async function createTestCall(orgId: string, toNumber: string): Promise<CreateTestCallResult> {
  if (!isRetellConfigured()) return { ok: false, reason: "not_configured", detail: "RETELL_API_KEY is not set." }
  if (!isSupabaseConfigured()) return { ok: false, reason: "not_configured", detail: "Supabase is not configured." }

  const admin = createAdminClient()
  const { data: settings, error } = await admin
    .from("org_voice_settings")
    .select("phone_number, retell_agent_id, enabled")
    .eq("org_id", orgId)
    .maybeSingle()

  if (error || !settings?.phone_number || !settings.retell_agent_id) {
    return { ok: false, reason: "not_found", detail: "Voice isn't fully set up for this org yet (no bound number/agent)." }
  }

  const res = await retellFetch("/create-phone-call", {
    method: "POST",
    body: {
      from_number: settings.phone_number,
      to_number: toNumber,
      override_agent_id: settings.retell_agent_id,
    },
  })

  if (!res.ok) return { ok: false, reason: "request_failed", detail: `create-phone-call failed (status ${res.status}).` }

  const parsed = res.json as RetellPhoneCallResponse | null
  const callId = parsed?.call_id ?? parsed?.id ?? null
  if (!callId) return { ok: false, reason: "invalid_response", detail: "create-phone-call response had no call id." }

  return { ok: true, callId }
}

// ---------------------------------------------------------------------------
// Minute-cap enforcement — disable a runaway org
// ---------------------------------------------------------------------------

/**
 * Called from the Retell webhook route once a call pushes an org over its
 * monthly voice-minutes cap (src/lib/voice/webhook.ts#hasVoiceMinutesRemaining).
 * ALWAYS flips org_voice_settings.enabled to false locally, even if the
 * best-effort Retell-side unbind below fails — the local flag is what gates
 * the settings UI and is the source of truth for "is voice on", so a runaway
 * month can't keep burning budget just because one Retell call errored.
 *
 * TODO-VERIFY: there's no documented "pause agent" endpoint; the best-guess
 * mitigation is unbinding the phone number's inbound agent (PATCH
 * /update-phone-number/{number} with inbound_agent_id: null) so new inbound
 * calls stop routing to Retell. Confirm the exact field/endpoint once the
 * key is live — until then this call is logged loudly on failure so the
 * owner can unbind manually from the Retell dashboard as a fallback.
 */
export async function disableVoiceAgent(orgId: string): Promise<RetellActionResult> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "not_configured" }

  const admin = createAdminClient()
  const { data: settings } = await admin
    .from("org_voice_settings")
    .select("phone_number")
    .eq("org_id", orgId)
    .maybeSingle()

  const { error: updateError } = await admin
    .from("org_voice_settings")
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .eq("org_id", orgId)

  if (updateError) {
    console.error(`[voice/retell] failed to flip enabled=false for org ${orgId} — voice may keep answering calls`, updateError.message)
    return { ok: false, reason: "request_failed", detail: "Failed to persist disabled state." }
  }

  if (isRetellConfigured() && settings?.phone_number) {
    const unbindRes = await retellFetch(`/update-phone-number/${encodeURIComponent(settings.phone_number)}`, {
      method: "PATCH",
      body: { inbound_agent_id: null },
    })
    if (!unbindRes.ok) {
      console.error(
        `[voice/retell] org ${orgId} hit its voice-minutes cap and enabled=false was saved, but unbinding the Retell number failed (status ${unbindRes.status}) — the number may keep routing to Retell until unbound manually.`
      )
    }
  }

  return { ok: true }
}
