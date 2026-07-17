// Shared Supabase configuration helpers. Safe to import anywhere (client or
// server) — never throws at import time, only when a client is actually used
// without configuration.

/** True once the public Supabase env vars are present. */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}

export class SupabaseNotConfiguredError extends Error {
  constructor(context?: string) {
    super(
      `Supabase is not configured${context ? ` (${context})` : ""}. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.`
    )
    this.name = "SupabaseNotConfiguredError"
  }
}

export function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) throw new SupabaseNotConfiguredError("NEXT_PUBLIC_SUPABASE_URL missing")
  return url
}

export function getSupabaseAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!key) throw new SupabaseNotConfiguredError("NEXT_PUBLIC_SUPABASE_ANON_KEY missing")
  return key
}
