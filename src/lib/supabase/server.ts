import "server-only"

import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"

import type { Database } from "@/lib/types"

import { getSupabaseAnonKey, getSupabaseUrl, isSupabaseConfigured } from "./config"

export { isSupabaseConfigured }

/**
 * Server Supabase client for use in Server Components, Route Handlers, and
 * Server Actions. Reads/writes the session via Next's cookies() store.
 *
 * Throws SupabaseNotConfiguredError if called before env vars are set —
 * callers should check `isSupabaseConfigured()` first when a graceful demo
 * fallback is possible.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // setAll can be called from a Server Component, where cookies are
          // read-only. Safe to ignore if middleware is refreshing sessions.
        }
      },
    },
  })
}
