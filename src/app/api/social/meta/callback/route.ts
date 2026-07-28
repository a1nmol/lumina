// Meta (Facebook/Instagram) CONNECT — callback. Verifies the signed state,
// exchanges the authorization code for a long-lived user token, lists the
// user's Facebook Pages (+ each Page's linked Instagram Business account),
// and upserts one social_connections row per Page. Connection layer only —
// publishing/insights are a later wave (MASTER_PLAN.md §4.B/§4.E).
//
// Never renders raw provider errors — every failure redirects back to
// /settings with a generic `?metaError=<reason>` param; details go to the
// server log only (never a token).

import { NextResponse, type NextRequest } from "next/server"

import { getCurrentOrgId } from "@/lib/org"
import {
  exchangeCodeForUserToken,
  exchangeForLongLivedUserToken,
  fetchInstagramBusinessAccount,
  fetchUserPages,
  isMetaConfigured,
  upsertSocialConnections,
  verifyMetaState,
  type MetaPageWithInstagram,
} from "@/lib/social/meta"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"

function errorRedirect(request: NextRequest, reason: string) {
  return NextResponse.redirect(new URL(`/settings?metaError=${reason}`, request.url), 302)
}

export async function GET(request: NextRequest) {
  if (!isMetaConfigured() || !isSupabaseConfigured()) {
    return errorRedirect(request, "not_configured")
  }

  const { searchParams } = request.nextUrl
  const oauthError = searchParams.get("error")
  const code = searchParams.get("code")
  const state = searchParams.get("state")

  if (oauthError) {
    console.error("[social/meta/callback] Facebook returned an OAuth error", oauthError)
    return errorRedirect(request, "denied")
  }

  if (!code || !state) {
    return errorRedirect(request, "invalid_request")
  }

  const statePayload = verifyMetaState(state)
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
    console.error("[social/meta/callback] state did not match the current session's org/user")
    return errorRedirect(request, "org_mismatch")
  }

  try {
    const shortLived = await exchangeCodeForUserToken(code)
    const longLived = await exchangeForLongLivedUserToken(shortLived.accessToken)
    const pages = await fetchUserPages(longLived.accessToken)

    if (pages.length === 0) {
      return errorRedirect(request, "no_pages")
    }

    const pagesWithInstagram: MetaPageWithInstagram[] = await Promise.all(
      pages.map(async (page) => ({
        page,
        instagram: await fetchInstagramBusinessAccount(page.id, page.accessToken),
      }))
    )

    await upsertSocialConnections(orgId, user.id, pagesWithInstagram)

    return NextResponse.redirect(new URL("/settings?connected=meta", request.url), 302)
  } catch (error) {
    console.error("[social/meta/callback] failed to complete Meta connection", error)
    return errorRedirect(request, "connection_failed")
  }
}
