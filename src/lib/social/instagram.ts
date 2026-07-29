import "server-only"

// Instagram Business Login CONNECT layer — the Page-less alternative to the
// Meta/Facebook-Login flow (src/lib/social/meta.ts). Lets an Instagram
// professional (Business/Creator) account connect with its own
// instagram.com login — no Facebook Page required. OAuth dialog URL,
// code/token exchange, profile lookup, and the upsert into
// public.social_connections (supabase/migrations/0010_social_connections_instagram.sql).
//
// Deliberately self-contained rather than reusing src/lib/social/meta.ts's
// signMetaState/verifyMetaState — those sign with META_APP_SECRET, and
// INSTAGRAM_APP_ID/INSTAGRAM_APP_SECRET may be configured independently of
// (and without) the Meta app credentials, so this module mirrors meta.ts's
// state-signing structure with its own secret.
//
// Connection layer only — publishing/insights are a later wave
// (MASTER_PLAN.md §4.B/§4.E). Consumed by
// src/app/api/social/instagram/start/route.ts and
// src/app/api/social/instagram/callback/route.ts.
//
// Never log access tokens. All API errors are logged with context but
// surfaced to the browser only as a generic `?igError=<reason>` redirect
// param (see the route handlers) — never raw provider error bodies.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"

import { createAdminClient } from "@/lib/supabase/admin"
import type { SocialConnection } from "@/lib/types"

const OAUTH_AUTHORIZE_BASE = "https://www.instagram.com/oauth/authorize"
const TOKEN_EXCHANGE_URL = "https://api.instagram.com/oauth/access_token"
const GRAPH_INSTAGRAM_BASE = "https://graph.instagram.com"
const GRAPH_INSTAGRAM_API_VERSION = "v21.0"

// Instagram Business Login scopes: read profile/media basics, publish
// content, manage Messenger-style DMs, and manage comments — the set this
// connection layer sets up for the later publishing/inbox waves.
const INSTAGRAM_OAUTH_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
].join(",")

const STATE_MAX_AGE_MS = 10 * 60 * 1000 // 10 minutes — long enough for the Instagram consent dialog, short enough to bound replay risk.

/** True once both Instagram app credentials are present. */
export function isInstagramConfigured(): boolean {
  return Boolean(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET)
}

class InstagramNotConfiguredError extends Error {
  constructor() {
    super("Instagram is not configured. Set INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET in .env.local.")
    this.name = "InstagramNotConfiguredError"
  }
}

function getAppId(): string {
  const id = process.env.INSTAGRAM_APP_ID
  if (!id) throw new InstagramNotConfiguredError()
  return id
}

function getAppSecret(): string {
  const secret = process.env.INSTAGRAM_APP_SECRET
  if (!secret) throw new InstagramNotConfiguredError()
  return secret
}

/** `${NEXT_PUBLIC_APP_URL}/api/social/instagram/callback` — falls back to localhost like src/lib/social/meta.ts's getMetaRedirectUri. */
export function getInstagramRedirectUri(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  return `${appUrl}/api/social/instagram/callback`
}

// ---------------------------------------------------------------------------
// State — signed, not stored. Mirrors src/lib/social/meta.ts's
// signMetaState/verifyMetaState structure exactly, but HMACs with
// INSTAGRAM_APP_SECRET so this flow works independently of the Meta app
// credentials.
// ---------------------------------------------------------------------------

export interface InstagramStatePayload {
  orgId: string
  userId: string
}

interface SignedInstagramState extends InstagramStatePayload {
  nonce: string
  ts: number
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url")
}

function signPayload(payloadJson: string): string {
  return createHmac("sha256", getAppSecret()).update(payloadJson).digest("base64url")
}

/** Builds the `state` query param for the OAuth dialog: base64url(payload) + "." + base64url(hmac). */
export function signInstagramState(payload: InstagramStatePayload): string {
  const signed: SignedInstagramState = { ...payload, nonce: randomBytes(16).toString("hex"), ts: Date.now() }
  const payloadJson = JSON.stringify(signed)
  const encodedPayload = base64UrlEncode(payloadJson)
  const signature = signPayload(payloadJson)
  return `${encodedPayload}.${signature}`
}

/**
 * Verifies the `state` param's HMAC signature and freshness. Returns the
 * embedded { orgId, userId } on success, or null on any failure (bad shape,
 * bad signature, expired). Does NOT check the state against the current
 * session — callers (the callback route) must additionally compare the
 * returned orgId/userId against the signed-in user's own session, same as
 * src/lib/social/meta.ts's verifyMetaState.
 */
export function verifyInstagramState(state: string): InstagramStatePayload | null {
  const parts = state.split(".")
  if (parts.length !== 2) return null
  const [encodedPayload, signature] = parts
  if (!encodedPayload || !signature) return null

  let payloadJson: string
  try {
    payloadJson = Buffer.from(encodedPayload, "base64url").toString("utf8")
  } catch {
    return null
  }

  const expectedSignature = signPayload(payloadJson)
  const signatureBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expectedSignature)
  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null
  }

  let parsed: SignedInstagramState
  try {
    parsed = JSON.parse(payloadJson) as SignedInstagramState
  } catch {
    return null
  }

  if (
    typeof parsed.orgId !== "string" ||
    typeof parsed.userId !== "string" ||
    typeof parsed.nonce !== "string" ||
    typeof parsed.ts !== "number"
  ) {
    return null
  }

  if (Date.now() - parsed.ts > STATE_MAX_AGE_MS) return null

  return { orgId: parsed.orgId, userId: parsed.userId }
}

/** The instagram.com Business Login consent dialog URL to redirect the browser to. */
export function buildInstagramAuthorizationUrl(state: string): string {
  const url = new URL(OAUTH_AUTHORIZE_BASE)
  url.searchParams.set("client_id", getAppId())
  url.searchParams.set("redirect_uri", getInstagramRedirectUri())
  url.searchParams.set("response_type", "code")
  url.searchParams.set("scope", INSTAGRAM_OAUTH_SCOPES)
  url.searchParams.set("state", state)
  return url.toString()
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

export class InstagramApiError extends Error {
  constructor(context: string) {
    super(`Instagram API request failed: ${context}`)
    this.name = "InstagramApiError"
  }
}

interface InstagramShortLivedTokenResponse {
  access_token: string
  user_id?: string | number
  permissions?: string[]
}

export interface InstagramShortLivedToken {
  accessToken: string
  userId: string | null
}

/** Step 1: authorization code → short-lived user access token (~1 hour) + the IG user id. */
export async function exchangeCodeForShortLivedToken(code: string): Promise<InstagramShortLivedToken> {
  const body = new URLSearchParams({
    client_id: getAppId(),
    client_secret: getAppSecret(),
    grant_type: "authorization_code",
    redirect_uri: getInstagramRedirectUri(),
    code,
  })

  const res = await fetch(TOKEN_EXCHANGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })

  if (!res.ok) {
    console.error("[social/instagram] code→token exchange failed", res.status)
    throw new InstagramApiError("code exchange")
  }

  const data = (await res.json()) as InstagramShortLivedTokenResponse
  if (!data.access_token) throw new InstagramApiError("code exchange returned no access_token")

  return { accessToken: data.access_token, userId: data.user_id != null ? String(data.user_id) : null }
}

interface InstagramLongLivedTokenResponse {
  access_token: string
  token_type?: string
  expires_in?: number
}

export interface InstagramLongLivedToken {
  accessToken: string
  /** Seconds until expiry (Instagram long-lived tokens last ~60 days). */
  expiresInSeconds: number | null
}

/** Step 2: short-lived user token → long-lived (~60 day) user token. */
export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<InstagramLongLivedToken> {
  const url = new URL(`${GRAPH_INSTAGRAM_BASE}/access_token`)
  url.searchParams.set("grant_type", "ig_exchange_token")
  url.searchParams.set("client_secret", getAppSecret())
  url.searchParams.set("access_token", shortLivedToken)

  const res = await fetch(url, { method: "GET" })
  if (!res.ok) {
    console.error("[social/instagram] long-lived token exchange failed", res.status)
    throw new InstagramApiError("long-lived token exchange")
  }

  const data = (await res.json()) as InstagramLongLivedTokenResponse
  if (!data.access_token) throw new InstagramApiError("long-lived exchange returned no access_token")

  return { accessToken: data.access_token, expiresInSeconds: data.expires_in ?? null }
}

interface InstagramProfileResponse {
  user_id?: string | number
  username?: string
  account_type?: string
}

export interface InstagramProfile {
  userId: string
  username: string | null
  accountType: string | null
}

/** Step 3: the connected account's own basic profile. */
export async function fetchInstagramProfile(accessToken: string): Promise<InstagramProfile> {
  const url = new URL(`${GRAPH_INSTAGRAM_BASE}/${GRAPH_INSTAGRAM_API_VERSION}/me`)
  url.searchParams.set("fields", "user_id,username,account_type")
  url.searchParams.set("access_token", accessToken)

  const res = await fetch(url, { method: "GET" })
  if (!res.ok) {
    console.error("[social/instagram] /me profile lookup failed", res.status)
    throw new InstagramApiError("profile lookup")
  }

  const data = (await res.json()) as InstagramProfileResponse
  if (data.user_id == null) throw new InstagramApiError("profile lookup returned no user_id")

  return {
    userId: String(data.user_id),
    username: data.username ?? null,
    accountType: data.account_type ?? null,
  }
}

/**
 * Upserts one social_connections row for the connected Instagram account
 * (see supabase/migrations/0010_social_connections_instagram.sql — unique on
 * (org_id, provider, page_id)). `page_id` reuses the Facebook-Page-shaped
 * column to store the Instagram user id (see that migration's column-reuse
 * comment); `page_name` is left null since no Page exists in this flow.
 * Service-role write: writes to this table are intentionally restricted to
 * the service role (tokens are sensitive).
 */

/**
 * Subscribes the connected account to the app's webhooks. REQUIRED for DM
 * delivery with Instagram Business Login: app-level webhook config alone
 * delivers nothing — each account must opt in via /me/subscribed_apps
 * (discovered live: the verification handshake succeeded but no events
 * arrived until this call was made for the account). Best-effort: a
 * failure here shouldn't fail the whole connect, the account can be
 * re-subscribed later.
 */
export async function subscribeToWebhooks(accessToken: string): Promise<boolean> {
  const res = await fetch(
    `https://graph.instagram.com/${GRAPH_INSTAGRAM_API_VERSION}/me/subscribed_apps?subscribed_fields=messages,comments&access_token=${encodeURIComponent(accessToken)}`,
    { method: "POST" }
  )
  if (!res.ok) {
    console.error(`instagram subscribeToWebhooks failed: HTTP ${res.status}`)
    return false
  }
  const body = (await res.json().catch(() => null)) as { success?: boolean } | null
  return body?.success === true
}

export async function upsertInstagramConnection(
  orgId: string,
  connectedByUserId: string,
  profile: InstagramProfile,
  longLivedToken: InstagramLongLivedToken
): Promise<void> {
  const admin = createAdminClient()

  const tokenExpiresAt =
    longLivedToken.expiresInSeconds != null
      ? new Date(Date.now() + longLivedToken.expiresInSeconds * 1000).toISOString()
      : null

  const row: Partial<SocialConnection> & Pick<SocialConnection, "org_id" | "provider" | "page_id" | "access_token"> = {
    org_id: orgId,
    provider: "instagram",
    page_id: profile.userId,
    page_name: null,
    ig_user_id: profile.userId,
    ig_username: profile.username,
    access_token: longLivedToken.accessToken,
    token_expires_at: tokenExpiresAt,
    connected_by: connectedByUserId,
  }

  const { error } = await admin.from("social_connections").upsert(row, { onConflict: "org_id,provider,page_id" })

  if (error) {
    console.error("[social/instagram] failed to upsert social_connections", error.message)
    throw new InstagramApiError("save connection")
  }
}
