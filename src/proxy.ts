import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"

import { getSupabaseAnonKey, getSupabaseUrl, isSupabaseConfigured } from "@/lib/supabase/config"

// Next.js 16 renamed the `middleware.ts` file convention to `proxy.ts`
// (middleware.ts still works but is deprecated and warns at build time).
// This proxy refreshes the Supabase auth session cookie on every request so
// Server Components always see a fresh session, and — once Supabase is
// configured — protects everything BY DEFAULT, only letting through an
// explicit allowlist of public paths.
//
// Protect-by-default (not an allowlist of protected (app) routes) is
// intentional: a maintained "these routes need auth" list silently stops
// protecting anything added under (app) and forgotten here — exactly what
// happened with /wick-preview (src/app/(app)/wick-preview), which shipped
// unprotected because it was never added to the old PROTECTED_PREFIXES
// list. Flipping the default means a forgotten new route is protected too
// hard (a bug you notice immediately, signed out, on first visit) rather
// than not protected at all (a bug that leaks a real page silently).
/** Every path a signed-out visitor is allowed to reach. Everything else requires a user once Supabase is configured. */
const PUBLIC_PATHS = [
  "/", // marketing landing page
  "/login",
  "/privacy",
  "/widget", // embeddable chat widget (src/app/widget/[org]) — third-party sites, no session
  "/api", // route handlers do their own auth (or are intentionally public, e.g. FrontDesk webhooks)
  "/manifest.webmanifest",
  "/sw.js",
  "/icons", // PWA icons under public/icons
]

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (publicPath) => pathname === publicPath || (publicPath !== "/" && pathname.startsWith(`${publicPath}/`))
  )
}

export async function proxy(request: NextRequest) {
  // No-op cleanly when Supabase isn't configured, so local/demo dev never
  // breaks before env vars are set — demo mode stays fully open.
  if (!isSupabaseConfigured()) {
    return NextResponse.next()
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        supabaseResponse = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options)
        }
      },
    },
  })

  // Refreshes the session if it's expired. Required for Server Components,
  // which can't write cookies themselves — this proxy is what keeps them in
  // sync. Do not remove this call or run other logic between the client
  // creation and this call (see the official @supabase/ssr guidance).
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user && !isPublicPath(request.nextUrl.pathname)) {
    const loginUrl = new URL("/login", request.url)
    return NextResponse.redirect(loginUrl)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico
     * - any file with an extension (public files, e.g. .svg, .png, .txt)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
}
