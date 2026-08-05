import "server-only"

// Meta (Facebook/Instagram) CONNECT layer — OAuth dialog URL, code/token
// exchange, Page + linked Instagram Business account lookup, and the
// upsert into public.social_connections (supabase/migrations/0008_social_connections.sql).
//
// Connection layer only — publishing/insights are a later wave
// (MASTER_PLAN.md §4.B/§4.E). Consumed by
// src/app/api/social/meta/start/route.ts and
// src/app/api/social/meta/callback/route.ts.
//
// Never log access tokens. All Graph API errors are logged with context but
// surfaced to the browser only as a generic `?metaError=<reason>` redirect
// param (see the route handlers) — never raw provider error bodies.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"

import { createAdminClient } from "@/lib/supabase/admin"
import type { SocialConnection } from "@/lib/types"

/** Graph API version pin — bump deliberately, in one place, when Meta deprecates this version. */
const GRAPH_API_VERSION = "v21.0"
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`
const OAUTH_DIALOG_BASE = `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth`

// Scopes needed for: listing the user's Pages, reading Page + linked IG
// basics, and (for the later publishing/inbox waves this connection layer
// sets up for) posting to the Page, managing Page metadata, reading/writing
// Instagram content, and Page Messenger conversations.
const META_OAUTH_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "pages_manage_metadata",
  "instagram_basic",
  "instagram_content_publish",
  "pages_messaging",
].join(",")

const STATE_MAX_AGE_MS = 10 * 60 * 1000 // 10 minutes — long enough for the Facebook consent dialog, short enough to bound replay risk.

/** True once both Meta app credentials are present. */
export function isMetaConfigured(): boolean {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET)
}

class MetaNotConfiguredError extends Error {
  constructor() {
    super("Meta is not configured. Set META_APP_ID and META_APP_SECRET in .env.local.")
    this.name = "MetaNotConfiguredError"
  }
}

function getAppId(): string {
  const id = process.env.META_APP_ID
  if (!id) throw new MetaNotConfiguredError()
  return id
}

function getAppSecret(): string {
  const secret = process.env.META_APP_SECRET
  if (!secret) throw new MetaNotConfiguredError()
  return secret
}

/** `${NEXT_PUBLIC_APP_URL}/api/social/meta/callback` — falls back to localhost like src/lib/ai/openrouter.ts's buildHeaders. */
export function getMetaRedirectUri(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  return `${appUrl}/api/social/meta/callback`
}

// ---------------------------------------------------------------------------
// State — signed, not stored. Binds the OAuth round trip to the org + user
// that started it (HMAC over org id + user id + nonce + timestamp with
// META_APP_SECRET, so the callback can verify it without a DB state table).
// ---------------------------------------------------------------------------

export interface MetaStatePayload {
  orgId: string
  userId: string
}

interface SignedMetaState extends MetaStatePayload {
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
export function signMetaState(payload: MetaStatePayload): string {
  const signed: SignedMetaState = { ...payload, nonce: randomBytes(16).toString("hex"), ts: Date.now() }
  const payloadJson = JSON.stringify(signed)
  const encodedPayload = base64UrlEncode(payloadJson)
  const signature = signPayload(payloadJson)
  return `${encodedPayload}.${signature}`
}

/**
 * Verifies the `state` param's HMAC signature and freshness. Returns the
 * embedded { orgId, userId } on success, or null on any failure (bad
 * shape, bad signature, expired). Does NOT check the state against the
 * current session — callers (the callback route) must additionally compare
 * the returned orgId/userId against the signed-in user's own session, per
 * the spec ("verify state HMAC + that the signed org matches the current
 * session user's org").
 */
export function verifyMetaState(state: string): MetaStatePayload | null {
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

  let parsed: SignedMetaState
  try {
    parsed = JSON.parse(payloadJson) as SignedMetaState
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

/** The Facebook OAuth consent dialog URL to redirect the browser to. */
export function buildMetaAuthorizationUrl(state: string): string {
  const url = new URL(OAUTH_DIALOG_BASE)
  url.searchParams.set("client_id", getAppId())
  url.searchParams.set("redirect_uri", getMetaRedirectUri())
  url.searchParams.set("state", state)
  url.searchParams.set("scope", META_OAUTH_SCOPES)
  url.searchParams.set("response_type", "code")
  return url.toString()
}

// ---------------------------------------------------------------------------
// Graph API calls
// ---------------------------------------------------------------------------

export class MetaApiError extends Error {
  constructor(context: string) {
    super(`Meta Graph API request failed: ${context}`)
    this.name = "MetaApiError"
  }
}

interface MetaTokenResponse {
  access_token: string
  token_type?: string
  expires_in?: number
}

export interface MetaUserToken {
  accessToken: string
  /** Seconds until expiry, if Meta returned one (short-lived tokens usually do; the long-lived exchange returns ~60 days). */
  expiresInSeconds: number | null
}

/** Step 1: authorization code → short-lived user access token. */
export async function exchangeCodeForUserToken(code: string): Promise<MetaUserToken> {
  const url = new URL(`${GRAPH_API_BASE}/oauth/access_token`)
  url.searchParams.set("client_id", getAppId())
  url.searchParams.set("client_secret", getAppSecret())
  url.searchParams.set("redirect_uri", getMetaRedirectUri())
  url.searchParams.set("code", code)

  const res = await fetch(url, { method: "GET" })
  if (!res.ok) {
    console.error("[social/meta] code→token exchange failed", res.status)
    throw new MetaApiError("code exchange")
  }

  const data = (await res.json()) as MetaTokenResponse
  if (!data.access_token) throw new MetaApiError("code exchange returned no access_token")

  return { accessToken: data.access_token, expiresInSeconds: data.expires_in ?? null }
}

/** Step 2: short-lived user token → long-lived (~60 day) user token. Page tokens fetched from a long-lived user token don't expire in the normal case. */
export async function exchangeForLongLivedUserToken(shortLivedToken: string): Promise<MetaUserToken> {
  const url = new URL(`${GRAPH_API_BASE}/oauth/access_token`)
  url.searchParams.set("grant_type", "fb_exchange_token")
  url.searchParams.set("client_id", getAppId())
  url.searchParams.set("client_secret", getAppSecret())
  url.searchParams.set("fb_exchange_token", shortLivedToken)

  const res = await fetch(url, { method: "GET" })
  if (!res.ok) {
    console.error("[social/meta] long-lived token exchange failed", res.status)
    throw new MetaApiError("long-lived token exchange")
  }

  const data = (await res.json()) as MetaTokenResponse
  if (!data.access_token) throw new MetaApiError("long-lived exchange returned no access_token")

  return { accessToken: data.access_token, expiresInSeconds: data.expires_in ?? null }
}

export interface MetaPage {
  id: string
  name: string
  /** Page access token — long-lived when derived from a long-lived user token, per Meta's docs. */
  accessToken: string
}

interface MetaAccountsResponseItem {
  id: string
  name: string
  access_token: string
}

interface MetaAccountsResponse {
  data?: MetaAccountsResponseItem[]
}

/** Step 3: the signed-in user's Facebook Pages (id, name, page access token). */
export async function fetchUserPages(userAccessToken: string): Promise<MetaPage[]> {
  const url = new URL(`${GRAPH_API_BASE}/me/accounts`)
  url.searchParams.set("fields", "id,name,access_token")
  url.searchParams.set("access_token", userAccessToken)

  const res = await fetch(url, { method: "GET" })
  if (!res.ok) {
    console.error("[social/meta] /me/accounts failed", res.status)
    throw new MetaApiError("list Pages")
  }

  const data = (await res.json()) as MetaAccountsResponse
  return (data.data ?? []).map((item) => ({ id: item.id, name: item.name, accessToken: item.access_token }))
}

export interface MetaInstagramAccount {
  id: string
  username: string | null
}

interface MetaPageInstagramResponse {
  instagram_business_account?: { id: string; username?: string }
}

/**
 * Step 4: the Instagram Business account linked to a Page, if any. Returns
 * null (not thrown) both when the Page has no linked IG account and when
 * the lookup itself fails — one page's IG lookup should never abort the
 * whole connect flow (the Page connection is still useful on its own).
 */
export async function fetchInstagramBusinessAccount(
  pageId: string,
  pageAccessToken: string
): Promise<MetaInstagramAccount | null> {
  const url = new URL(`${GRAPH_API_BASE}/${pageId}`)
  url.searchParams.set("fields", "instagram_business_account{id,username}")
  url.searchParams.set("access_token", pageAccessToken)

  const res = await fetch(url, { method: "GET" })
  if (!res.ok) {
    console.error("[social/meta] instagram_business_account lookup failed", res.status)
    return null
  }

  const data = (await res.json()) as MetaPageInstagramResponse
  const account = data.instagram_business_account
  if (!account) return null

  return { id: account.id, username: account.username ?? null }
}

export interface MetaPageWithInstagram {
  page: MetaPage
  instagram: MetaInstagramAccount | null
}

/**
 * Upserts one social_connections row per connected Page (see
 * supabase/migrations/0008_social_connections.sql — unique on
 * (org_id, provider, page_id)). Service-role write: writes to this table are
 * intentionally restricted to the service role (tokens are sensitive).
 */
export async function upsertSocialConnections(
  orgId: string,
  connectedByUserId: string,
  pages: MetaPageWithInstagram[]
): Promise<void> {
  if (pages.length === 0) return

  const admin = createAdminClient()

  const rows: Array<Partial<SocialConnection> & Pick<SocialConnection, "org_id" | "provider" | "page_id" | "access_token">> =
    pages.map(({ page, instagram }) => ({
      org_id: orgId,
      provider: "meta",
      page_id: page.id,
      page_name: page.name,
      ig_user_id: instagram?.id ?? null,
      ig_username: instagram?.username ?? null,
      access_token: page.accessToken,
      token_expires_at: null,
      connected_by: connectedByUserId,
    }))

  const { error } = await admin.from("social_connections").upsert(rows, { onConflict: "org_id,provider,page_id" })

  if (error) {
    console.error("[social/meta] failed to upsert social_connections", error.message)
    throw new MetaApiError("save connection")
  }
}
