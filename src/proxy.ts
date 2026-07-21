import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"

import { getSupabaseAnonKey, getSupabaseUrl, isSupabaseConfigured } from "@/lib/supabase/config"

// Next.js 16 renamed the `middleware.ts` file convention to `proxy.ts`
// (middleware.ts still works but is deprecated and warns at build time).
// This proxy refreshes the Supabase auth session cookie on every request so
// Server Components always see a fresh session, and — once Supabase is
// configured — protects the (app) route group by redirecting signed-out
// requests to /login. /login, /widget, /api, and static assets stay public.

/** Route prefixes gated behind the (app) layout — mirrors src/app/(app)'s route folders. */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/studio",
  "/calendar",
  "/inbox",
  "/contacts",
  "/analytics",
  "/growth",
  "/admin",
  "/settings",
]

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
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

  if (!user && isProtectedPath(request.nextUrl.pathname)) {
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
