import "server-only"

// Never-go-dark ops watchdog (owner-approved wave, 2026-08-02). Born from a
// real outage: the OpenRouter account hit $0, every FrontDesk reply started
// silently failing/escalating, and nobody knew until the owner noticed
// customers being ghosted. This module is split in two halves:
//
//   1. PURE decision logic (threshold classification, dedupe-window math,
//      the webhook-liveness condition) — plain functions over plain inputs,
//      unit-tested in watchdog.test.ts with no network/DB involved.
//   2. Impure orchestration (runWatchdog, the fetch/DB helpers, email
//      delivery) — wired to the pure functions above so the actual decisions
//      stay testable even though the plumbing around them isn't.
//
// See supabase/migrations/0017_watchdog.sql for the dedupe ledger
// (watchdog_alerts) and src/app/api/cron/watchdog/route.ts for the scheduled
// entry point (daily on Hobby, 13:00 UTC; bump frequency on Pro, see vercel.json).

import { getAdminEmailAllowlist } from "@/lib/admin"
import { fetchOpenRouterRemainingCredits } from "@/lib/ai/wallet-status"
import { sendWatchdogAlertEmail } from "@/lib/email"
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin"
import { getAiRepliesUsageFraction, getVoiceMinutesUsageFraction } from "@/lib/usage"

// ===========================================================================
// 1. Pure decision logic
// ===========================================================================

export type WatchdogAlertKind =
  | "openrouter_credits_low"
  | "openrouter_credits_empty"
  | "usage_80"
  | "usage_95"
  | "token_expiring"
  | "token_expired"
  | "webhook_silent"
  /**
   * AI Phone Receptionist pilot (migration 0020): an org is at/over 80% of
   * its org_voice_settings.max_minutes_month cap. Unlike usage_80/usage_95
   * this has no separate "critical" tier — src/lib/voice/retell.ts#disableVoiceAgent
   * already auto-disables the org at 100%, so this warning's whole job is
   * to give the owner a heads-up BEFORE that automatic cutoff happens.
   */
  | "voice_minutes_80"
  /**
   * Not a health finding — the daily morning-brief email (Outlast wave 2,
   * Part B, see src/lib/morning-brief.ts + src/app/api/cron/morning-brief/route.ts)
   * reuses this same dedupe ledger/table (rather than a new one) so a
   * manual cron poke can't double-send the same day's brief. See
   * getLastAlertSentAt/recordAlertSent below, exported for that route.
   */
  | "morning_brief"

export type WatchdogSeverity = "warning" | "critical"

/**
 * Whether a finding concerns the whole platform/account (OpenRouter credits,
 * Instagram webhook liveness) or one org's own usage/channel health. Scope
 * decides WHO gets the email: "platform" findings go only to ADMIN_EMAILS
 * (a tenant owner must never learn the platform's OpenRouter balance);
 * "org" findings go to that org's owner, same as every other Lumina alert.
 */
export type WatchdogScope = "platform" | "org"

export interface WatchdogFinding {
  /**
   * Dedupe/context anchor. For scope "org" this is the affected org. For
   * scope "platform" this is a pragmatic anchor org (watchdog_alerts.org_id
   * is NOT NULL and there's no per-platform table — see resolveAdminAnchorOrgId
   * below) used only to key the dedupe ledger, never to pick a recipient.
   */
  orgId: string
  kind: WatchdogAlertKind
  scope: WatchdogScope
  severity: WatchdogSeverity
  detail: string
}

// --- OpenRouter account credits ---------------------------------------------

export const OPENROUTER_CREDITS_LOW_USD = 3
export const OPENROUTER_CREDITS_EMPTY_USD = 0.25

/** Classifies a remaining-credits balance. Returns null when credits are healthy. */
export function classifyOpenRouterCredits(
  remainingUsd: number
): { kind: "openrouter_credits_empty" | "openrouter_credits_low"; severity: WatchdogSeverity } | null {
  if (remainingUsd <= OPENROUTER_CREDITS_EMPTY_USD) return { kind: "openrouter_credits_empty", severity: "critical" }
  if (remainingUsd < OPENROUTER_CREDITS_LOW_USD) return { kind: "openrouter_credits_low", severity: "warning" }
  return null
}

// --- Per-org usage burn ------------------------------------------------------

export const USAGE_WARN_FRACTION = 0.8
export const USAGE_CRITICAL_FRACTION = 0.95

/** Classifies an `ai_replies` used/limit fraction (from getAiRepliesUsageFraction). Returns null below the warn threshold. */
export function classifyUsageBurn(
  fraction: number
): { kind: "usage_80" | "usage_95"; severity: WatchdogSeverity } | null {
  if (fraction >= USAGE_CRITICAL_FRACTION) return { kind: "usage_95", severity: "critical" }
  if (fraction >= USAGE_WARN_FRACTION) return { kind: "usage_80", severity: "warning" }
  return null
}

/** Classifies a voice_minutes used/cap fraction (from getVoiceMinutesUsageFraction). One threshold only — see WatchdogAlertKind's "voice_minutes_80" doc comment for why there's no critical tier here. */
export function classifyVoiceMinutesBurn(fraction: number): { kind: "voice_minutes_80"; severity: WatchdogSeverity } | null {
  if (fraction >= USAGE_WARN_FRACTION) return { kind: "voice_minutes_80", severity: "warning" }
  return null
}

// --- Channel token expiry ----------------------------------------------------

export const TOKEN_EXPIRY_WARNING_DAYS = 7

/** Classifies a social_connections.token_expires_at against `now`. Returns null when there's nothing to warn about yet. */
export function classifyTokenExpiry(
  expiresAt: Date,
  now: Date
): { kind: "token_expired" | "token_expiring"; severity: WatchdogSeverity; daysLeft: number } | null {
  const msLeft = expiresAt.getTime() - now.getTime()
  const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000))

  if (msLeft <= 0) return { kind: "token_expired", severity: "critical", daysLeft }
  if (daysLeft <= TOKEN_EXPIRY_WARNING_DAYS) return { kind: "token_expiring", severity: "warning", daysLeft }
  return null
}

// --- Alert dedupe -------------------------------------------------------------

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/** How long a (org_id, kind) pair stays deduped after a successful send. token_expiring gets a longer window since "7 days left" doesn't meaningfully change hour to hour. morning_brief gets a sub-day window (20h, not 24h) so a slightly-early or slightly-late cron tick the next day still fires — a hard 24h window risks the next day's brief getting silently skipped by a few minutes of drift. */
export const WATCHDOG_DEDUPE_WINDOW_MS: Record<WatchdogAlertKind, number> = {
  openrouter_credits_low: DAY_MS,
  openrouter_credits_empty: DAY_MS,
  usage_80: DAY_MS,
  usage_95: DAY_MS,
  token_expiring: 2 * DAY_MS,
  token_expired: DAY_MS,
  webhook_silent: DAY_MS,
  morning_brief: 20 * HOUR_MS,
  voice_minutes_80: DAY_MS,
}

/** True iff a fresh alert should be sent, given when (if ever) the same (org, kind) last sent. */
export function shouldSendWatchdogAlert(lastSentAt: Date | null, now: Date, kind: WatchdogAlertKind): boolean {
  if (!lastSentAt) return true
  return now.getTime() - lastSentAt.getTime() >= WATCHDOG_DEDUPE_WINDOW_MS[kind]
}

// --- Webhook liveness ---------------------------------------------------------

export const WEBHOOK_SILENCE_THRESHOLD_MS = 48 * 60 * 60 * 1000
export const WEBHOOK_TRAFFIC_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000

export interface WebhookLivenessInput {
  now: Date
  /** Most recent webhook_receipts row (source='instagram'), platform-wide. Null if none exist yet. */
  lastInstagramReceiptAt: Date | null
  /** Whether THIS org had at least one inbound Instagram message in the 7 days immediately before the silence window started (see trafficLookbackWindow). Computed by the caller from `messages`/`conversations`. */
  hadTrafficBeforeSilenceWindow: boolean
}

/**
 * True iff Instagram webhook delivery looks broken for this org: nothing has
 * arrived platform-wide in 48h+ AND this org had real traffic right before
 * that silence started — the second condition is what stops the check from
 * nagging an account that simply gets no DMs.
 */
export function isWebhookSilent(input: WebhookLivenessInput): boolean {
  const silenceMs = input.lastInstagramReceiptAt
    ? input.now.getTime() - input.lastInstagramReceiptAt.getTime()
    : Infinity

  if (silenceMs < WEBHOOK_SILENCE_THRESHOLD_MS) return false
  return input.hadTrafficBeforeSilenceWindow
}

/** The [from, to) window to search an org's message history for "traffic right before the silence started". */
export function trafficLookbackWindow(silenceWindowStart: Date): { from: Date; to: Date } {
  return { from: new Date(silenceWindowStart.getTime() - WEBHOOK_TRAFFIC_LOOKBACK_MS), to: silenceWindowStart }
}

// ===========================================================================
// 2. Orchestration (impure — network + Supabase)
// ===========================================================================

type AdminClient = ReturnType<typeof createAdminClient>

// fetchOpenRouterRemainingCredits used to be defined here directly. It now
// lives in src/lib/ai/wallet-status.ts (Outlast wave — wallet-aware
// wind-down hotfix, 2026-08-02), unchanged in behavior, so the reply-drafting
// hot path can share the exact same implementation (behind its own 10-minute
// cache) instead of this cron duplicating it. Re-exported here so nothing
// importing it from "@/lib/watchdog" needs to change.
export { fetchOpenRouterRemainingCredits }

/**
 * Pragmatic dedupe anchor for platform-level findings: watchdog_alerts.org_id
 * is NOT NULL (no migration to add a nullable column in this wave — see the
 * spec), so platform-wide findings (OpenRouter credits) are keyed against the
 * oldest org by created_at. This never affects WHO is emailed (that's always
 * ADMIN_EMAILS for platform-scope findings) — only which row the dedupe
 * lookup/insert uses.
 */
export async function resolveAdminAnchorOrgId(admin: AdminClient): Promise<string | null> {
  const { data, error } = await admin.from("orgs").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle()
  if (error) {
    console.error("[watchdog] failed to resolve admin anchor org", error.message)
    return null
  }
  return data?.id ?? null
}

/** Exported (Outlast wave 2) so src/app/api/cron/morning-brief/route.ts can reuse this same dedupe ledger for the "morning_brief" kind — see WatchdogAlertKind's doc comment. */
export async function getLastAlertSentAt(admin: AdminClient, orgId: string, kind: WatchdogAlertKind): Promise<Date | null> {
  const { data, error } = await admin
    .from("watchdog_alerts")
    .select("sent_at")
    .eq("org_id", orgId)
    .eq("kind", kind)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error("[watchdog] failed to read watchdog_alerts", error.message)
    return null
  }
  return data ? new Date(data.sent_at) : null
}

/** Exported (Outlast wave 2) alongside getLastAlertSentAt — same reuse. */
export async function recordAlertSent(admin: AdminClient, orgId: string, kind: WatchdogAlertKind, detail: string): Promise<void> {
  const { error } = await admin.from("watchdog_alerts").insert({ org_id: orgId, kind, detail })
  if (error) console.error("[watchdog] failed to record watchdog_alerts row", error.message)
}

/**
 * Sends one finding's email (bundling behavior lives in runWatchdog, which
 * groups findings before calling this) and records the dedupe row on
 * success. Never throws — a failed send/record is logged and swallowed so
 * one bad finding can't take down the rest of the run.
 */
async function deliverAndRecord(
  admin: AdminClient,
  orgId: string,
  findings: WatchdogFinding[],
  recipients: string[] | undefined
): Promise<number> {
  if (findings.length === 0) return 0

  try {
    await sendWatchdogAlertEmail({
      orgId,
      findings: findings.map((finding) => ({ kind: finding.kind, severity: finding.severity, detail: finding.detail })),
      recipients,
    })
  } catch (error) {
    console.error(`[watchdog] failed to send alert email for org ${orgId}`, error)
    return 0
  }

  await Promise.all(findings.map((finding) => recordAlertSent(admin, orgId, finding.kind, finding.detail)))
  return findings.length
}

// --- Check 1: OpenRouter account credits (platform-level) -------------------

async function checkOpenRouterCredits(admin: AdminClient): Promise<WatchdogFinding[]> {
  const remaining = await fetchOpenRouterRemainingCredits()
  if (remaining === null) return [] // fetch/parse failure — logged already, never alerted on.

  const classification = classifyOpenRouterCredits(remaining)
  if (!classification) return []

  const anchorOrgId = await resolveAdminAnchorOrgId(admin)
  if (!anchorOrgId) return [] // no orgs at all yet — nothing to anchor the dedupe row to.

  return [
    {
      orgId: anchorOrgId,
      kind: classification.kind,
      scope: "platform",
      severity: classification.severity,
      detail: `OpenRouter account has $${remaining.toFixed(2)} in credits remaining.`,
    },
  ]
}

// --- Check 2: usage burn (per org) -------------------------------------------

async function checkUsageBurn(orgIds: string[]): Promise<WatchdogFinding[]> {
  const findings: WatchdogFinding[] = []

  await Promise.all(
    orgIds.map(async (orgId) => {
      // getAiRepliesUsageFraction THROWS on query errors (unlike this
      // module's own defensive queries). One org's broken entitlements row
      // must never take down the whole watchdog run (review-caught: the
      // watchdog itself going dark is the exact failure it exists to catch).
      let fraction: number | null
      try {
        fraction = await getAiRepliesUsageFraction(orgId)
      } catch (error) {
        console.error(`[watchdog] usage-burn check failed for org ${orgId}`, error)
        return
      }
      if (fraction === null) return

      const classification = classifyUsageBurn(fraction)
      if (!classification) return

      findings.push({
        orgId,
        kind: classification.kind,
        scope: "org",
        severity: classification.severity,
        detail: `AI replies at ${Math.round(fraction * 100)}% of this month's allowance.`,
      })
    })
  )

  return findings
}

// --- Check 2b: voice-minutes burn (per org, AI Phone Receptionist pilot) ----

async function checkVoiceMinutesBurn(orgIds: string[]): Promise<WatchdogFinding[]> {
  const findings: WatchdogFinding[] = []

  await Promise.all(
    orgIds.map(async (orgId) => {
      let fraction: number | null
      try {
        fraction = await getVoiceMinutesUsageFraction(orgId)
      } catch (error) {
        console.error(`[watchdog] voice-minutes burn check failed for org ${orgId}`, error)
        return
      }
      if (fraction === null) return

      const classification = classifyVoiceMinutesBurn(fraction)
      if (!classification) return

      findings.push({
        orgId,
        kind: classification.kind,
        scope: "org",
        severity: classification.severity,
        detail: `AI phone receptionist at ${Math.round(fraction * 100)}% of this month's minute cap.`,
      })
    })
  )

  return findings
}

// --- Check 3: connected-channel token expiry (per org) ----------------------

async function checkTokenExpiry(admin: AdminClient, now: Date): Promise<WatchdogFinding[]> {
  const { data, error } = await admin
    .from("social_connections")
    .select("org_id, provider, token_expires_at")
    .not("token_expires_at", "is", null)

  if (error) {
    console.error("[watchdog] failed to load social_connections for token expiry", error.message)
    return []
  }

  const findings: WatchdogFinding[] = []
  for (const row of data ?? []) {
    if (!row.token_expires_at) continue
    const classification = classifyTokenExpiry(new Date(row.token_expires_at), now)
    if (!classification) continue

    const detail =
      classification.kind === "token_expired"
        ? `${row.provider} connection's token expired ${Math.abs(classification.daysLeft)} day(s) ago.`
        : `${row.provider} connection's token expires in ${classification.daysLeft} day(s).`

    findings.push({ orgId: row.org_id, kind: classification.kind, scope: "org", severity: classification.severity, detail })
  }

  return findings
}

// --- Check 4: Instagram webhook liveness (platform-level, per-org anchor) ---

async function orgHadInstagramInboundTraffic(admin: AdminClient, orgId: string, from: Date, to: Date): Promise<boolean> {
  const { data: conversations, error: conversationsError } = await admin
    .from("conversations")
    .select("id")
    .eq("org_id", orgId)
    .eq("channel", "instagram")

  if (conversationsError) {
    console.error("[watchdog] failed to load instagram conversations", conversationsError.message)
    return false
  }
  const conversationIds = (conversations ?? []).map((row) => row.id)
  if (conversationIds.length === 0) return false

  const { data: messages, error: messagesError } = await admin
    .from("messages")
    .select("id")
    .eq("org_id", orgId)
    .in("conversation_id", conversationIds)
    .eq("direction", "inbound")
    .gte("created_at", from.toISOString())
    .lt("created_at", to.toISOString())
    .limit(1)

  if (messagesError) {
    console.error("[watchdog] failed to load instagram messages for traffic check", messagesError.message)
    return false
  }
  return (messages ?? []).length > 0
}

async function checkWebhookLiveness(admin: AdminClient, now: Date): Promise<WatchdogFinding[]> {
  const { data: lastReceipt, error: receiptError } = await admin
    .from("webhook_receipts")
    .select("created_at")
    .eq("source", "instagram")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (receiptError) {
    console.error("[watchdog] failed to load webhook_receipts", receiptError.message)
    return []
  }

  const lastInstagramReceiptAt = lastReceipt ? new Date(lastReceipt.created_at) : null

  // Healthy platform (a receipt inside the threshold) — the common case.
  // Every per-org traffic query below would be guaranteed no-ops, so skip
  // them entirely (review fix: don't pay 2×orgs queries 4×/day for nothing).
  if (lastInstagramReceiptAt && now.getTime() - lastInstagramReceiptAt.getTime() < WEBHOOK_SILENCE_THRESHOLD_MS) {
    return []
  }

  // Nothing recorded ever — treat "now" as the silence anchor for the
  // traffic lookback window below (there's no earlier receipt to anchor to).
  const silenceWindowStart = lastInstagramReceiptAt ?? now

  const { data: connections, error: connectionsError } = await admin
    .from("social_connections")
    .select("org_id")
    .not("ig_user_id", "is", null)

  if (connectionsError) {
    console.error("[watchdog] failed to load social_connections for webhook liveness", connectionsError.message)
    return []
  }

  const orgIds = Array.from(new Set((connections ?? []).map((row) => row.org_id)))
  if (orgIds.length === 0) return []

  const { from, to } = trafficLookbackWindow(silenceWindowStart)

  const findings: WatchdogFinding[] = []
  await Promise.all(
    orgIds.map(async (orgId) => {
      const hadTrafficBeforeSilenceWindow = await orgHadInstagramInboundTraffic(admin, orgId, from, to)
      const silent = isWebhookSilent({ now, lastInstagramReceiptAt, hadTrafficBeforeSilenceWindow })
      if (!silent) return

      const hoursSince = lastInstagramReceiptAt
        ? Math.floor((now.getTime() - lastInstagramReceiptAt.getTime()) / (60 * 60 * 1000))
        : null

      findings.push({
        orgId,
        kind: "webhook_silent",
        scope: "platform",
        severity: "critical",
        detail:
          hoursSince !== null
            ? `No Instagram webhook deliveries in ${hoursSince}h, despite recent inbound DMs before that.`
            : "No Instagram webhook deliveries have ever been recorded, despite recent inbound DMs.",
      })
    })
  )

  return findings
}

// --- Run everything -----------------------------------------------------------

export interface WatchdogRunResult {
  findingsCount: number
  alertsSent: number
  skippedByDedupe: number
}

const EMPTY_RESULT: WatchdogRunResult = { findingsCount: 0, alertsSent: 0, skippedByDedupe: 0 }

/**
 * Runs every check, dedupes against watchdog_alerts, and sends one bundled
 * email per (recipient scope, org) pair. No-ops in demo mode (Supabase not
 * configured) — there's nothing to check against.
 */
export async function runWatchdog(): Promise<WatchdogRunResult> {
  if (!isSupabaseConfigured()) return EMPTY_RESULT

  const admin = createAdminClient()
  const now = new Date()

  const { data: orgs, error: orgsError } = await admin.from("orgs").select("id")
  if (orgsError) {
    console.error("[watchdog] failed to load orgs", orgsError.message)
    return EMPTY_RESULT
  }
  const orgIds = (orgs ?? []).map((row) => row.id)

  // allSettled, not all (review fix): each check is independently
  // best-effort — one check crashing must not discard the findings the
  // other three already computed.
  const settled = await Promise.allSettled([
    checkOpenRouterCredits(admin),
    checkUsageBurn(orgIds),
    checkVoiceMinutesBurn(orgIds),
    checkTokenExpiry(admin, now),
    checkWebhookLiveness(admin, now),
  ])

  const allFindings = settled.flatMap((result, index) => {
    if (result.status === "fulfilled") return result.value
    console.error(`[watchdog] check ${index} crashed — its findings are skipped this run`, result.reason)
    return []
  })

  // Dedupe each finding independently against watchdog_alerts.
  const passesDedupe: WatchdogFinding[] = []
  let skippedByDedupe = 0
  for (const finding of allFindings) {
    const lastSentAt = await getLastAlertSentAt(admin, finding.orgId, finding.kind)
    if (shouldSendWatchdogAlert(lastSentAt, now, finding.kind)) {
      passesDedupe.push(finding)
    } else {
      skippedByDedupe++
    }
  }

  // Bundle: one email per (scope, orgId) pair — org-scope findings go to that
  // org's owner; platform-scope findings go to ADMIN_EMAILS regardless of
  // which org they're anchored to for dedupe purposes.
  const adminEmails = getAdminEmailAllowlist()
  const orgScopeByOrg = new Map<string, WatchdogFinding[]>()
  const platformFindings: WatchdogFinding[] = []

  for (const finding of passesDedupe) {
    if (finding.scope === "platform") {
      platformFindings.push(finding)
      continue
    }
    const bucket = orgScopeByOrg.get(finding.orgId) ?? []
    bucket.push(finding)
    orgScopeByOrg.set(finding.orgId, bucket)
  }

  let alertsSent = 0

  for (const [orgId, findings] of orgScopeByOrg) {
    alertsSent += await deliverAndRecord(admin, orgId, findings, undefined)
  }

  if (platformFindings.length > 0 && adminEmails.length > 0) {
    // Platform findings can be anchored to different orgs (webhook_silent is
    // per affected org); group by anchor org so each dedupe row still ties to
    // the right finding, but every group is emailed to the same ADMIN_EMAILS.
    const byAnchorOrg = new Map<string, WatchdogFinding[]>()
    for (const finding of platformFindings) {
      const bucket = byAnchorOrg.get(finding.orgId) ?? []
      bucket.push(finding)
      byAnchorOrg.set(finding.orgId, bucket)
    }
    for (const [orgId, findings] of byAnchorOrg) {
      alertsSent += await deliverAndRecord(admin, orgId, findings, adminEmails)
    }
  }

  return { findingsCount: allFindings.length, alertsSent, skippedByDedupe }
}

// ===========================================================================
// 3. Inline hook — fired from src/lib/ai/router.ts's 402 branch
// ===========================================================================

/**
 * Best-effort, fire-and-forget admin notification fired the MOMENT a real
 * request hits OpenRouter's 402 (account out of credits) — not at the next
 * 6-hour cron tick. Void-called with `.catch(console.error)` from
 * runTextJob's 402 branch; never awaited, never throws past itself. Shares
 * the same watchdog_alerts dedupe ledger/window as the cron's
 * openrouter_credits_empty check (keyed to the same admin anchor org), so a
 * burst of 402s in the same few minutes doesn't spam ADMIN_EMAILS — but the
 * FIRST one always gets through immediately.
 */
export async function notifyOpenRouterOutOfCredits(): Promise<void> {
  if (!isSupabaseConfigured()) return

  const adminEmails = getAdminEmailAllowlist()
  if (adminEmails.length === 0) return

  const admin = createAdminClient()
  const anchorOrgId = await resolveAdminAnchorOrgId(admin)
  if (!anchorOrgId) return

  const kind: WatchdogAlertKind = "openrouter_credits_empty"
  const lastSentAt = await getLastAlertSentAt(admin, anchorOrgId, kind)
  if (!shouldSendWatchdogAlert(lastSentAt, new Date(), kind)) return

  const finding: WatchdogFinding = {
    orgId: anchorOrgId,
    kind,
    scope: "platform",
    severity: "critical",
    detail: "OpenRouter returned 402 (out of credits) while answering a real customer request.",
  }

  await deliverAndRecord(admin, anchorOrgId, [finding], adminEmails)
}
