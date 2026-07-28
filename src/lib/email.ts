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
