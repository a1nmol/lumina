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
 */
export async function sendInstagramMessage(
  accessToken: string,
  recipientId: string,
  text: string
): Promise<SendInstagramMessageResult> {
  const res = await fetch(`${GRAPH_INSTAGRAM_BASE}/${GRAPH_INSTAGRAM_API_VERSION}/me/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
    }),
  })

  if (!res.ok) {
    console.error("[social/instagram-messaging] send message failed", res.status)
    throw new InstagramMessagingApiError("send message")
  }

  const data = (await res.json()) as SendInstagramMessageResponse
  return { messageId: data.message_id ?? null }
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
