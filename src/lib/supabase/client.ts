"use client"

import { createBrowserClient } from "@supabase/ssr"

import type { Database } from "@/lib/types"

import { getSupabaseAnonKey, getSupabaseUrl, isSupabaseConfigured } from "./config"

export { isSupabaseConfigured }

/**
 * Browser Supabase client. Throws SupabaseNotConfiguredError if called before
 * env vars are set — check `isSupabaseConfigured()` first if that's possible
 * in your context (e.g. to render a "connect Supabase" empty state).
 */
export function createClient() {
  return createBrowserClient<Database>(getSupabaseUrl(), getSupabaseAnonKey())
}
