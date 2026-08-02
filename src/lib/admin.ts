import "server-only"

// Platform-admin gate for /admin. Deliberately simple (env allowlist, not a
// role in the data model yet) — this is an invite-only test phase with one
// operator, not a multi-admin product surface.

import { createClient } from "@/lib/supabase/server"
import { isSupabaseConfigured } from "@/lib/supabase/config"

/**
 * Parses the ADMIN_EMAILS env var (comma-separated, case-insensitive,
 * whitespace-trimmed) into a clean list. Shared by isPlatformAdmin below and
 * by src/lib/watchdog.ts, which emails this same allowlist for
 * platform-level findings (OpenRouter credits, webhook liveness) — those
 * must never reach a tenant org owner.
 */
export function getAdminEmailAllowlist(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * True in demo mode (Supabase unconfigured) so local development always sees
 * the admin panel. Once Supabase is configured, true only for the signed-in
 * user whose email appears in the ADMIN_EMAILS env var (comma-separated,
 * case-insensitive, whitespace-trimmed).
 */
export async function isPlatformAdmin(): Promise<boolean> {
  if (!isSupabaseConfigured()) return true

  const adminEmails = getAdminEmailAllowlist()

  if (adminEmails.length === 0) return false

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const email = user?.email?.trim().toLowerCase()
  if (!email) return false

  return adminEmails.includes(email)
}
