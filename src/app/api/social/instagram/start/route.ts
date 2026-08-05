// Instagram Business Login CONNECT — start. Redirects the signed-in user's
// browser to the instagram.com OAuth consent dialog — the Page-less
// alternative to /api/social/meta/start. Requires an authenticated session
// with a resolved org (src/lib/org.ts's getCurrentOrgId) — /api is a public
// path in src/proxy.ts's PUBLIC_PATHS (route handlers do their own auth), so
// that check happens here rather than in middleware.

import { NextResponse, type NextRequest } from "next/server"

import { getCurrentOrgId } from "@/lib/org"
import { buildInstagramAuthorizationUrl, isInstagramConfigured, signInstagramState } from "@/lib/social/instagram"
import { createClient } from "@/lib/supabase/server"
import { isSupabaseConfigured } from "@/lib/supabase/config"

export async function GET(request: NextRequest) {
  if (!isInstagramConfigured() || !isSupabaseConfigured()) {
    return NextResponse.redirect(new URL("/settings?igError=not_configured", request.url), 302)
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url), 302)
  }

  const orgId = await getCurrentOrgId()
  if (!orgId) {
    return NextResponse.redirect(new URL("/settings?igError=no_org", request.url), 302)
  }

  const state = signInstagramState({ orgId, userId: user.id })
  return NextResponse.redirect(buildInstagramAuthorizationUrl(state), 302)
}
