// Instagram Business Login CONNECT — callback. Verifies the signed state,
// exchanges the authorization code for a long-lived access token, fetches
// the connected account's own profile, and upserts one social_connections
// row for it — the Page-less alternative to /api/social/meta/callback.
// Connection layer only — publishing/insights are a later wave
// (MASTER_PLAN.md §4.B/§4.E).
//
// Never renders raw provider errors — every failure redirects back to
// /settings with a generic `?igError=<reason>` param; details go to the
// server log only (never a token).

import { NextResponse, type NextRequest } from "next/server"

import { getCurrentOrgId } from "@/lib/org"
import {
  exchangeCodeForShortLivedToken,
  exchangeForLongLivedToken,
  fetchInstagramProfile,
  isInstagramConfigured,
  subscribeToWebhooks,
  upsertInstagramConnection,
  verifyInstagramState,
} from "@/lib/social/instagram"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"

function errorRedirect(request: NextRequest, reason: string) {
  return NextResponse.redirect(new URL(`/settings?igError=${reason}`, request.url), 302)
}

export async function GET(request: NextRequest) {
  if (!isInstagramConfigured() || !isSupabaseConfigured()) {
    return errorRedirect(request, "not_configured")
  }

  const { searchParams } = request.nextUrl
  const oauthError = searchParams.get("error")
  const code = searchParams.get("code")
  const state = searchParams.get("state")

  if (oauthError) {
    console.error("[social/instagram/callback] Instagram returned an OAuth error", oauthError)
    return errorRedirect(request, "denied")
  }

  if (!code || !state) {
    return errorRedirect(request, "invalid_request")
  }

  const statePayload = verifyInstagramState(state)
  if (!statePayload) {
    return errorRedirect(request, "invalid_state")
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url), 302)
  }

  const orgId = await getCurrentOrgId()
  if (!orgId || orgId !== statePayload.orgId || user.id !== statePayload.userId) {
    console.error("[social/instagram/callback] state did not match the current session's org/user")
    return errorRedirect(request, "org_mismatch")
  }

  try {
    const shortLived = await exchangeCodeForShortLivedToken(code)
    const longLived = await exchangeForLongLivedToken(shortLived.accessToken)
    const profile = await fetchInstagramProfile(longLived.accessToken)

    await upsertInstagramConnection(orgId, user.id, profile, longLived)
    // Required for DM delivery — see subscribeToWebhooks doc. Best-effort.
    await subscribeToWebhooks(longLived.accessToken).catch(() => false)

    return NextResponse.redirect(new URL("/settings?connected=instagram", request.url), 302)
  } catch (error) {
    console.error("[social/instagram/callback] failed to complete Instagram connection", error)
    return errorRedirect(request, "connection_failed")
  }
}
