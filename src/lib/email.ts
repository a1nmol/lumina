import "server-only"

// Resend email transport (MASTER_PLAN.md §7 — "Resend/Brevo" for email).
// Thin, dependency-free (plain fetch, no SDK) so it stays cheap to audit,
// mirroring the fetch/error conventions in src/lib/ai/openrouter.ts.
//
// No verified sending domain yet: every email goes out from Resend's shared
// testing sender `onboarding@resend.dev`. Resend will only actually DELIVER
// mail from that address to the Resend ACCOUNT OWNER's own inbox until a
// custom domain is verified (https://resend.com/docs/dashboard/domains/introduction)
// — every other recipient gets silently dropped. That's an acceptable
// constraint for the pilot: the only email this module sends today is the
// instant lead alert to the org owner (see sendLeadAlertEmail below), and
// during the invite-only test phase that owner IS the Resend account owner.
// Once a domain is verified, swap RESEND_FROM below (or promote it to an env
// var) — no call site needs to change.

import { deriveBriefLines, formatBriefSubject, type MorningBriefData } from "@/lib/morning-brief"
import { createAdminClient, isSupabaseConfigured as isAdminConfigured } from "@/lib/supabase/admin"
import type { ConversationChannel } from "@/lib/types"

const RESEND_URL = "https://api.resend.com/emails"
const RESEND_FROM = "Lumina <onboarding@resend.dev>"

export interface SendEmailInput {
  to: string
  subject: string
  html: string
  text: string
}

export interface SendEmailResult {
  /** True when RESEND_API_KEY isn't set — the send was skipped, not attempted. */
  skipped?: boolean
  /** Resend's email id, when the send succeeded. */
  id?: string
}

export class ResendRequestError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = "ResendRequestError"
    this.status = status
  }
}

/** True once RESEND_API_KEY is present. */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}

/**
 * Sends one email via the Resend HTTP API. No-ops (returns `{ skipped: true }`)
 * with a single console.warn when RESEND_API_KEY isn't set, so callers can
 * invoke this unconditionally in local dev / demo mode without crashing —
 * matching the demo-safe convention across src/lib/*.ts (see src/lib/push.ts,
 * src/lib/frontdesk.ts).
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY is not set — skipping email send.")
    return { skipped: true }
  }

  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new ResendRequestError(`Resend request failed (${res.status}): ${body.slice(0, 300)}`, res.status)
  }

  const json = (await res.json().catch(() => ({}))) as { id?: string }
  return { id: json.id }
}

// ---------------------------------------------------------------------------
// Instant lead alert (MASTER_PLAN.md §4.D "instant owner alert")
// ---------------------------------------------------------------------------

const CHANNEL_LABELS: Record<ConversationChannel, string> = {
  web_chat: "Web chat",
  form: "Form",
  sms: "SMS",
  email: "Email",
  instagram: "Instagram",
  facebook: "Facebook",
  google: "Google",
  missed_call: "Missed call",
}

/**
 * Resolves the org owner's email for alerting: org_members (role='owner')
 * -> auth.users, via the service-role admin client. auth.users isn't exposed
 * through PostgREST/RLS at all, so this needs the Auth admin API rather than
 * a table select (see src/lib/supabase/admin.ts). Returns null (never
 * throws) when Supabase isn't configured, no owner membership exists, or the
 * auth lookup fails — callers should treat that as "can't alert right now",
 * not a hard error.
 */
async function resolveOrgOwnerEmail(orgId: string): Promise<string | null> {
  if (!isAdminConfigured()) return null

  const supabase = createAdminClient()

  const { data: owner, error: memberError } = await supabase
    .from("org_members")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle()

  if (memberError || !owner) return null

  const { data, error: userError } = await supabase.auth.admin.getUserById(owner.user_id)
  if (userError || !data.user?.email) return null

  return data.user.email
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export interface LeadAlertInput {
  orgId: string
  channel: ConversationChannel
  contactName?: string | null
  contactPhone?: string | null
  contactEmail?: string | null
  /** First line of what the lead said/sent, if any — shown as a short preview. */
  messagePreview?: string | null
}

/**
 * Sends the ★instant lead alert email (MASTER_PLAN.md §4.D) to the org
 * owner for a brand-new lead. Fire-and-forget by design — callers invoke
 * this WITHOUT awaiting (`.catch(console.error)` instead), so a slow or
 * failing email send never adds latency to, or fails, the customer-facing
 * FrontDesk request that triggered it (see src/app/api/frontdesk/chat/route.ts
 * and .../missed-call/route.ts, the two lead-creation entry points today).
 * No-ops quietly when email isn't configured or the owner's email can't be
 * resolved — this is a best-effort notification, not the system of record
 * (the lead itself is already persisted by the caller before this runs).
 */
export async function sendLeadAlertEmail(input: LeadAlertInput): Promise<void> {
  if (!isEmailConfigured()) return

  const ownerEmail = await resolveOrgOwnerEmail(input.orgId)
  if (!ownerEmail) return

  const who =
    input.contactName?.trim() || input.contactPhone?.trim() || input.contactEmail?.trim() || "New contact"
  const channelLabel = CHANNEL_LABELS[input.channel]
  const subject = `New lead: ${who} — ${channelLabel}`

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  const inboxUrl = `${appUrl}/inbox`

  const contactLines = [
    input.contactName ? `Name: ${input.contactName}` : null,
    input.contactPhone ? `Phone: ${input.contactPhone}` : null,
    input.contactEmail ? `Email: ${input.contactEmail}` : null,
  ].filter((line): line is string => Boolean(line))

  const text = [
    `New lead via ${channelLabel}.`,
    contactLines.length > 0 ? contactLines.join(" · ") : null,
    input.messagePreview ? `"${input.messagePreview}"` : null,
    `View in Inbox: ${inboxUrl}`,
  ]
    .filter(Boolean)
    .join("\n\n")

  // Plain, system-font inline styles — email clients don't load app CSS/design
  // tokens, so this deliberately does NOT reuse Tailwind/shadcn tokens.
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <p style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: #b4551f; font-weight: 600; margin: 0 0 8px;">New lead &mdash; ${escapeHtml(channelLabel)}</p>
      <h1 style="font-size: 20px; margin: 0 0 16px;">${escapeHtml(who)}</h1>
      ${
        contactLines.length > 0
          ? `<p style="font-size: 14px; line-height: 1.6; margin: 0 0 12px; color: #444444;">${contactLines
              .map(escapeHtml)
              .join("<br/>")}</p>`
          : ""
      }
      ${
        input.messagePreview
          ? `<p style="font-size: 14px; line-height: 1.6; margin: 0 0 20px; padding: 12px 16px; background: #f6f2ee; border-left: 3px solid #b4551f; color: #333333;">${escapeHtml(
              input.messagePreview
            )}</p>`
          : ""
      }
      <a href="${inboxUrl}" style="display: inline-block; font-size: 14px; font-weight: 600; color: #ffffff; background: #b4551f; padding: 10px 20px; border-radius: 8px; text-decoration: none;">Open Inbox</a>
      <p style="font-size: 12px; color: #999999; margin-top: 24px;">Lumina &middot; sent to the org owner</p>
    </div>
  `.trim()

  await sendEmail({ to: ownerEmail, subject, html, text })
}

// ---------------------------------------------------------------------------
// Watchdog alert (never-go-dark ops wave, migration 0017 watchdog_alerts)
// ---------------------------------------------------------------------------

const WATCHDOG_KIND_LABELS: Record<string, string> = {
  openrouter_credits_low: "OpenRouter credits running low",
  openrouter_credits_empty: "OpenRouter credits are out",
  usage_80: "Approaching monthly AI reply limit",
  usage_95: "Nearly out of AI replies this month",
  token_expiring: "A connected channel's token is expiring soon",
  token_expired: "A connected channel's token has expired",
  webhook_silent: "Instagram webhooks have gone quiet",
}

const WATCHDOG_FIX_IT_LINES: Record<string, string> = {
  openrouter_credits_low: "Top up at openrouter.ai/settings/credits before the balance hits zero.",
  openrouter_credits_empty: "Top up now at openrouter.ai/settings/credits — the AI cannot reply to anyone until this is fixed.",
  usage_80: "Review usage in /admin, or raise this org's ai_replies limit before it runs out.",
  usage_95: "Raise this org's ai_replies limit now, or the AI will stop replying once the limit is hit.",
  token_expiring: "Reconnect the channel from Settings → Channels before it expires.",
  token_expired: "Reconnect the channel from Settings → Channels — it can no longer send or receive.",
  webhook_silent: "Check the Instagram webhook subscription in the Meta App Dashboard — deliveries appear to have stopped.",
}

export interface WatchdogAlertEmailFinding {
  kind: string
  severity: "warning" | "critical"
  detail: string
}

export interface WatchdogAlertEmailInput {
  /** Org the findings are attached to (used for the default owner-resolution recipient, and shown for context). */
  orgId: string
  findings: WatchdogAlertEmailFinding[]
  /**
   * When set, sends to exactly these addresses instead of resolving the org
   * owner — used for platform-level findings (OpenRouter credits,
   * webhook_silent) which must reach ADMIN_EMAILS only, never a tenant
   * owner. When omitted, the recipient is resolved via resolveOrgOwnerEmail
   * above — the SAME function sendLeadAlertEmail/sendVipAlertEmail use, so
   * org-level findings (usage burn, token expiry) reach the same inbox every
   * other Lumina alert already reaches.
   */
  recipients?: string[]
}

function summarizeWatchdogFindings(findings: WatchdogAlertEmailFinding[]): string {
  if (findings.length === 1) {
    return WATCHDOG_KIND_LABELS[findings[0].kind] ?? findings[0].kind
  }
  const criticalCount = findings.filter((finding) => finding.severity === "critical").length
  return criticalCount > 0
    ? `${findings.length} issues need attention (${criticalCount} urgent)`
    : `${findings.length} issues need attention`
}

/**
 * Sends the ops watchdog's bundled health alert (one email per org per cron
 * run, covering everything that fired for that org) — modeled on
 * sendLeadAlertEmail/sendVipAlertEmail's delivery mechanics (fire-and-forget
 * by convention at call sites, best-effort, shared-sender constraint), but
 * this alert bundles N findings instead of describing one event. See
 * src/lib/watchdog.ts for what triggers each `kind` and how dedupe (one send
 * per org+kind per quiet period) is enforced before this is ever called.
 */
export async function sendWatchdogAlertEmail(input: WatchdogAlertEmailInput): Promise<void> {
  if (!isEmailConfigured()) return
  if (input.findings.length === 0) return

  const recipients =
    input.recipients && input.recipients.length > 0
      ? input.recipients
      : ([await resolveOrgOwnerEmail(input.orgId)].filter((email): email is string => Boolean(email)))

  if (recipients.length === 0) return

  const summary = summarizeWatchdogFindings(input.findings)
  const subject = `Lumina health: ${summary}`

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  const adminUrl = `${appUrl}/admin`

  const textLines = input.findings.map((finding) => {
    const label = WATCHDOG_KIND_LABELS[finding.kind] ?? finding.kind
    const fixIt = WATCHDOG_FIX_IT_LINES[finding.kind]
    return [`${finding.severity === "critical" ? "URGENT" : "Warning"}: ${label}`, finding.detail, fixIt]
      .filter(Boolean)
      .join(" — ")
  })

  const text = [
    "Lumina's ops watchdog found something that needs your attention:",
    ...textLines,
    `Open the admin panel: ${adminUrl}`,
  ].join("\n\n")

  const htmlItems = input.findings
    .map((finding) => {
      const label = WATCHDOG_KIND_LABELS[finding.kind] ?? finding.kind
      const fixIt = WATCHDOG_FIX_IT_LINES[finding.kind]
      const accentColor = finding.severity === "critical" ? "#c0392b" : "#b4551f"
      return `
        <div style="margin: 0 0 16px; padding: 12px 16px; background: #f6f2ee; border-left: 3px solid ${accentColor};">
          <p style="font-size: 13px; font-weight: 600; margin: 0 0 4px; color: ${accentColor};">${escapeHtml(label)}</p>
          <p style="font-size: 14px; line-height: 1.5; margin: 0 0 6px; color: #333333;">${escapeHtml(finding.detail)}</p>
          ${fixIt ? `<p style="font-size: 13px; line-height: 1.5; margin: 0; color: #666666;">${escapeHtml(fixIt)}</p>` : ""}
        </div>
      `
    })
    .join("")

  // Plain, system-font inline styles — matches sendLeadAlertEmail's html above.
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <p style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: #b4551f; font-weight: 600; margin: 0 0 8px;">Lumina health check</p>
      <h1 style="font-size: 20px; margin: 0 0 16px;">${escapeHtml(summary)}</h1>
      ${htmlItems}
      <a href="${adminUrl}" style="display: inline-block; font-size: 14px; font-weight: 600; color: #ffffff; background: #b4551f; padding: 10px 20px; border-radius: 8px; text-decoration: none;">Open admin panel</a>
      <p style="font-size: 12px; color: #999999; margin-top: 24px;">Lumina &middot; automated health check, runs every 6 hours</p>
    </div>
  `.trim()

  await Promise.all(recipients.map((to) => sendEmail({ to, subject, html, text })))
}

// ---------------------------------------------------------------------------
// VIP alert (Commander update wave B1, migration 0016 contacts.is_vip)
// ---------------------------------------------------------------------------

export interface VipAlertInput {
  orgId: string
  channel: ConversationChannel
  contactName?: string | null
  contactPhone?: string | null
  contactEmail?: string | null
  /** First line of what the VIP said, if any — shown as a short preview. */
  messagePreview?: string | null
}

/**
 * Sends the VIP alert email to the org owner when a VIP contact
 * (contacts.is_vip) messages in — modeled directly on sendLeadAlertEmail
 * above, since the delivery mechanics (fire-and-forget, best-effort,
 * shared-sender constraint) are identical; only the subject/copy differ to
 * make clear this is a VIP who's waiting on the owner personally, not a new
 * lead. Called from the three channel routes' VIP gate — see
 * src/app/api/frontdesk/chat/route.ts, src/app/api/twilio/sms/route.ts, and
 * src/app/api/webhooks/instagram/route.ts — AFTER the inbound message is
 * already persisted, BEFORE any drafting is attempted. No-ops quietly when
 * email isn't configured or the owner's email can't be resolved.
 */
export async function sendVipAlertEmail(input: VipAlertInput): Promise<void> {
  if (!isEmailConfigured()) return

  const ownerEmail = await resolveOrgOwnerEmail(input.orgId)
  if (!ownerEmail) return

  const who = input.contactName?.trim() || input.contactPhone?.trim() || input.contactEmail?.trim() || "A VIP contact"
  const channelLabel = CHANNEL_LABELS[input.channel]
  const subject = `VIP messaged you — ${who}`

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  const inboxUrl = `${appUrl}/inbox`

  const contactLines = [
    input.contactName ? `Name: ${input.contactName}` : null,
    input.contactPhone ? `Phone: ${input.contactPhone}` : null,
    input.contactEmail ? `Email: ${input.contactEmail}` : null,
  ].filter((line): line is string => Boolean(line))

  const text = [
    `${who} (VIP) just messaged you via ${channelLabel}. Lumina is drafting a reply, but a VIP never gets auto-sent — you'll need to send it yourself.`,
    contactLines.length > 0 ? contactLines.join(" · ") : null,
    input.messagePreview ? `"${input.messagePreview}"` : null,
    `Reply in Inbox: ${inboxUrl}`,
  ]
    .filter(Boolean)
    .join("\n\n")

  // Plain, system-font inline styles — matches sendLeadAlertEmail's html
  // above; email clients don't load app CSS/design tokens.
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <p style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: #b4551f; font-weight: 600; margin: 0 0 8px;">VIP &mdash; ${escapeHtml(channelLabel)}</p>
      <h1 style="font-size: 20px; margin: 0 0 16px;">${escapeHtml(who)}</h1>
      <p style="font-size: 14px; line-height: 1.6; margin: 0 0 12px; color: #444444;">This contact is marked VIP, so Lumina will draft a reply but never send it automatically &mdash; it's waiting on you.</p>
      ${
        contactLines.length > 0
          ? `<p style="font-size: 14px; line-height: 1.6; margin: 0 0 12px; color: #444444;">${contactLines
              .map(escapeHtml)
              .join("<br/>")}</p>`
          : ""
      }
      ${
        input.messagePreview
          ? `<p style="font-size: 14px; line-height: 1.6; margin: 0 0 20px; padding: 12px 16px; background: #f6f2ee; border-left: 3px solid #b4551f; color: #333333;">${escapeHtml(
              input.messagePreview
            )}</p>`
          : ""
      }
      <a href="${inboxUrl}" style="display: inline-block; font-size: 14px; font-weight: 600; color: #ffffff; background: #b4551f; padding: 10px 20px; border-radius: 8px; text-decoration: none;">Reply in Inbox</a>
      <p style="font-size: 12px; color: #999999; margin-top: 24px;">Lumina &middot; sent to the org owner</p>
    </div>
  `.trim()

  await sendEmail({ to: ownerEmail, subject, html, text })
}

// ---------------------------------------------------------------------------
// Morning brief (Outlast wave 2, Part B) — the daily "what happened
// overnight" digest. Formatting (subject + body lines) is computed by the
// pure helpers in src/lib/morning-brief.ts; this function only turns those
// lines into a warm, scannable email and delivers it. See
// src/app/api/cron/morning-brief/route.ts for the scheduled entry point and
// the skip/dedupe rules (no email on a silent day; deduped via the SAME
// watchdog_alerts ledger sendWatchdogAlertEmail's caller uses, kind
// "morning_brief").
// ---------------------------------------------------------------------------

export interface MorningBriefEmailInput {
  orgId: string
  data: MorningBriefData
}

/** Renders one of the brief's 0-3 sections as an HTML list — "" when there's nothing in it, so the caller can just concatenate every section unconditionally. */
function renderBriefSectionHtml(title: string, lines: string[], accentColor: string): string {
  if (lines.length === 0) return ""
  const items = lines.map((line) => `<li style="margin: 0 0 6px; line-height: 1.5;">${escapeHtml(line)}</li>`).join("")
  return `
      <div style="margin: 0 0 20px;">
        <p style="font-size: 13px; font-weight: 600; margin: 0 0 8px; color: ${accentColor};">${escapeHtml(title)}</p>
        <ul style="margin: 0; padding-left: 18px; font-size: 14px; color: #333333;">${items}</ul>
      </div>
    `
}

/**
 * Sends the daily morning-brief email to the org owner: a plain-language
 * recap of the last 24h (what the AI handled, who needs the owner
 * personally, VIPs who messaged, and a couple of open threads worth a
 * follow-up). No-ops quietly when email isn't configured or the owner's
 * email can't be resolved — same best-effort contract as every other email
 * in this module. The caller (the morning-brief cron route) is responsible
 * for the skip-when-silent and dedupe rules; this function always sends
 * given a MorningBriefData.
 */
export async function sendMorningBriefEmail(input: MorningBriefEmailInput): Promise<void> {
  if (!isEmailConfigured()) return

  const ownerEmail = await resolveOrgOwnerEmail(input.orgId)
  if (!ownerEmail) return

  const subject = formatBriefSubject(input.data.counts, input.data.needsOwner.length)
  const { summaryLine, needsYouLines, vipLines, openThreadLines } = deriveBriefLines(input.data)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  const inboxUrl = `${appUrl}/inbox`

  const text = [
    summaryLine,
    needsYouLines.length > 0 ? `Who needs you:\n${needsYouLines.map((line) => `- ${line}`).join("\n")}` : null,
    vipLines.length > 0 ? `VIPs who messaged:\n${vipLines.map((line) => `- ${line}`).join("\n")}` : null,
    openThreadLines.length > 0
      ? `Open threads worth a follow-up:\n${openThreadLines.map((line) => `- ${line}`).join("\n")}`
      : null,
    `Open the inbox: ${inboxUrl}`,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n\n")

  // Plain, system-font inline styles — matches every other email in this
  // module; email clients don't load app CSS/design tokens.
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <p style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: #b4551f; font-weight: 600; margin: 0 0 8px;">Your Lumina brief</p>
      <h1 style="font-size: 20px; margin: 0 0 16px;">${escapeHtml(summaryLine)}</h1>
      ${renderBriefSectionHtml("Who needs you", needsYouLines, "#c0392b")}
      ${renderBriefSectionHtml("VIPs who messaged", vipLines, "#b4551f")}
      ${renderBriefSectionHtml("Open threads worth a follow-up", openThreadLines, "#b4551f")}
      <a href="${inboxUrl}" style="display: inline-block; font-size: 14px; font-weight: 600; color: #ffffff; background: #b4551f; padding: 10px 20px; border-radius: 8px; text-decoration: none;">Open Inbox</a>
      <p style="font-size: 12px; color: #999999; margin-top: 24px;">Lumina &middot; your daily brief, sent every morning</p>
    </div>
  `.trim()

  await sendEmail({ to: ownerEmail, subject, html, text })
}
