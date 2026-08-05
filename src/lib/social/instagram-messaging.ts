import "server-only"

// Instagram DM send/profile helpers — the messaging-runtime counterpart to
// src/lib/social/instagram.ts (which only handles the OAuth CONNECT layer).
// Consumed by src/app/api/webhooks/instagram/route.ts, the inbound-DM
// webhook that closes the ★Instagram half of the Unified Inbox
// (MASTER_PLAN.md §4.C/§4.D).
//
// Deliberately self-contained (does not import from instagram.ts) — these
// two functions take an access token as a plain argument (the token comes
// from a `social_connections` row the webhook route already looked up),
// rather than resolving app-level OAuth credentials from env like
// instagram.ts's functions do. Same fetch/error conventions as instagram.ts
// though: res.ok checks, generic API-error class, and access tokens are
// NEVER logged or included in thrown error messages.

const GRAPH_INSTAGRAM_BASE = "https://graph.instagram.com"
const GRAPH_INSTAGRAM_API_VERSION = "v21.0"

export class InstagramMessagingApiError extends Error {
  constructor(context: string) {
    super(`Instagram messaging API request failed: ${context}`)
    this.name = "InstagramMessagingApiError"
  }
}

export interface SendInstagramMessageResult {
  /** Meta's id for the sent message, when returned. */
  messageId: string | null
}

interface SendInstagramMessageResponse {
  recipient_id?: string
  message_id?: string
}

/**
 * Sends a text DM to `recipientId` (an Instagram-scoped user id, IGSID) via
 * POST /me/messages, using `accessToken` (a stored `social_connections`
 * row's token — either provider, per the webhook route's connection
 * lookup). Throws InstagramMessagingApiError on a non-2xx response; never
 * logs the token itself, only the HTTP status.
 *
 * `tag`, when set to `"HUMAN_AGENT"`, adds Meta's human-agent message tag
 * (`{"tag": "HUMAN_AGENT"}` in the request body) — the only way to reply
 * outside the standard 24-hour messaging window, and ONLY permitted for a
 * genuine human reply (never an AI auto-send). See
 * src/app/(app)/inbox/actions.ts#sendReply, the owner-composer send path,
 * for the 24h/7d window logic that decides when to pass this.
 */
export async function sendInstagramMessage(
  accessToken: string,
  recipientId: string,
  text: string,
  tag?: "HUMAN_AGENT"
): Promise<SendInstagramMessageResult> {
  const body: Record<string, unknown> = {
    recipient: { id: recipientId },
    message: { text },
  }
  if (tag) body.tag = tag

  const res = await fetch(`${GRAPH_INSTAGRAM_BASE}/${GRAPH_INSTAGRAM_API_VERSION}/me/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    console.error("[social/instagram-messaging] send message failed", res.status)
    throw new InstagramMessagingApiError("send message")
  }

  const data = (await res.json()) as SendInstagramMessageResponse
  return { messageId: data.message_id ?? null }
}

/**
 * Fires Meta's "typing_on" sender action so the customer sees a live
 * "…typing" indicator while the model drafts a reply (Commander update wave
 * B2) — POSTs to the same /me/messages endpoint as sendInstagramMessage,
 * just with `sender_action` instead of `message`. Deliberately best-effort:
 * callers should fire this without letting a failure affect the real reply
 * (see src/app/api/webhooks/instagram/route.ts's call site, right before
 * draftCustomerReply) — it's a cosmetic nicety, never worth failing or
 * delaying a webhook over.
 */
export async function sendInstagramTypingIndicator(accessToken: string, recipientId: string): Promise<void> {
  const res = await fetch(`${GRAPH_INSTAGRAM_BASE}/${GRAPH_INSTAGRAM_API_VERSION}/me/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ recipient: { id: recipientId }, sender_action: "typing_on" }),
  })

  if (!res.ok) {
    console.error("[social/instagram-messaging] typing indicator failed", res.status)
    throw new InstagramMessagingApiError("typing indicator")
  }
}

export interface InstagramSenderProfile {
  username: string | null
  name: string | null
}

interface InstagramSenderProfileResponse {
  username?: string
  name?: string
}

/**
 * Best-effort lookup of a DM sender's public profile (username/name) via
 * GET /{igsid}?fields=username,name — Meta allows this for users who have
 * messaged the business, using the business's own access token. Returns
 * null on any failure (unknown scope, expired token, rate limit, etc.) —
 * callers should fall back to a generic contact name rather than fail the
 * whole webhook over a profile-enrichment miss.
 */
export async function fetchInstagramSenderProfile(
  accessToken: string,
  igsid: string
): Promise<InstagramSenderProfile | null> {
  const url = new URL(`${GRAPH_INSTAGRAM_BASE}/${GRAPH_INSTAGRAM_API_VERSION}/${igsid}`)
  url.searchParams.set("fields", "username,name")
  url.searchParams.set("access_token", accessToken)

  let res: Response
  try {
    res = await fetch(url, { method: "GET" })
  } catch (error) {
    console.error("[social/instagram-messaging] sender profile lookup errored", error)
    return null
  }

  if (!res.ok) {
    console.error("[social/instagram-messaging] sender profile lookup failed", res.status)
    return null
  }

  const data = (await res.json()) as InstagramSenderProfileResponse
  return { username: data.username ?? null, name: data.name ?? null }
}
