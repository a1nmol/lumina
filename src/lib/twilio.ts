import "server-only"

// Thin Twilio REST + webhook-signature client. Deliberately dependency-free
// (plain fetch + node:crypto, no `twilio` npm package) so it stays cheap to
// audit and has no supply-chain surface — same rationale as
// src/lib/ai/openrouter.ts's header comment, and the same request/error
// shape conventions (a *NotConfiguredError for missing env, a
// *RequestError carrying the HTTP status for a failed call).
//
// Used by the two Twilio webhook routes (src/app/api/twilio/sms,
// src/app/api/twilio/voice) for the SMS + missed-call-to-text channel
// (MASTER_PLAN.md §4.D).

import { createHmac, timingSafeEqual } from "node:crypto"

const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01"

export class TwilioNotConfiguredError extends Error {
  constructor() {
    super("Twilio is not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env.local.")
    this.name = "TwilioNotConfiguredError"
  }
}

export class TwilioRequestError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = "TwilioRequestError"
    this.status = status
  }
}

/** True once TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are both present. */
export function isTwilioConfigured(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
}

export interface SendSmsResult {
  sid: string
}

/**
 * Sends one SMS via the Twilio REST API (basic-auth'd plain fetch — see the
 * module header for why there's no SDK). Throws TwilioNotConfiguredError if
 * the account credentials are missing, or TwilioRequestError (carrying the
 * HTTP status) if Twilio rejects the request.
 */
export async function sendSms(to: string, from: string, body: string): Promise<SendSmsResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!accountSid || !authToken) throw new TwilioNotConfiguredError()

  const url = `${TWILIO_API_BASE}/Accounts/${accountSid}/Messages.json`
  const params = new URLSearchParams({ To: to, From: from, Body: body })
  const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString("base64")

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: params.toString(),
  })

  if (!res.ok) {
    const responseBody = await res.text().catch(() => "")
    throw new TwilioRequestError(`Twilio request failed (${res.status}): ${responseBody.slice(0, 300)}`, res.status)
  }

  const json = (await res.json().catch(() => ({}))) as { sid?: string }
  return { sid: json.sid ?? "" }
}

/**
 * Validates an inbound Twilio webhook request per Twilio's signature spec
 * (https://www.twilio.com/docs/usage/webhooks/webhook-signatures):
 * HMAC-SHA1 of the webhook URL followed by every form param's key+value
 * concatenated in sorted-key order, base64-encoded, compared against the
 * `X-Twilio-Signature` header with a timing-safe comparison.
 *
 * `url` must be the EXACT URL configured on the Twilio number/webhook
 * (scheme + host + path, no query string manipulation) — Twilio signs
 * against that, not whatever `request.url` resolves to behind a proxy.
 * Returns false (never throws) for any missing/malformed input, including
 * when TWILIO_AUTH_TOKEN isn't set — callers decide whether that's fatal.
 */
export function validateTwilioSignature(url: string, params: Record<string, string>, signature: string | null): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken || !signature) return false

  const sortedKeys = Object.keys(params).sort()
  const data = sortedKeys.reduce((acc, key) => acc + key + params[key], url)

  const expectedSignature = createHmac("sha1", authToken).update(data, "utf8").digest("base64")

  const expectedBuffer = Buffer.from(expectedSignature)
  const signatureBuffer = Buffer.from(signature)

  // timingSafeEqual throws if the buffers differ in length, so guard that
  // first — a length mismatch is itself a definitive "not equal".
  if (expectedBuffer.length !== signatureBuffer.length) return false

  return timingSafeEqual(expectedBuffer, signatureBuffer)
}
