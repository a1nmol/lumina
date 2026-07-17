import "server-only"

import { createClient as createSupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/types"

import { getSupabaseUrl, isSupabaseConfigured as isPublicSupabaseConfigured } from "./config"

/**
 * True once both the public URL and the service-role secret are present.
 * Import this instead of the base isSupabaseConfigured() in server-only code
 * that needs the admin client (usage metering, entitlements writes, etc.).
 */
export function isSupabaseConfigured(): boolean {
  return isPublicSupabaseConfigured() && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
}

class SupabaseServiceRoleNotConfiguredError extends Error {
  constructor() {
    super(
      "Supabase service role is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local (server-only, never expose to the client)."
    )
    this.name = "SupabaseServiceRoleNotConfiguredError"
  }
}

let cachedAdminClient: ReturnType<typeof createSupabaseClient<Database>> | null = null

/**
 * Service-role Supabase client. Bypasses Row-Level Security — server-only,
 * never import this from a Client Component or expose the key to the browser.
 *
 * Used for trusted, privileged writes such as usage metering where clients
 * must not be able to insert usage_events directly.
 */
export function createAdminClient() {
  if (!isSupabaseConfigured()) {
    throw new SupabaseServiceRoleNotConfiguredError()
  }

  if (!cachedAdminClient) {
    cachedAdminClient = createSupabaseClient<Database>(
      getSupabaseUrl(),
      process.env.SUPABASE_SERVICE_ROLE_KEY as string,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )
  }

  return cachedAdminClient
}
