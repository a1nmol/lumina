import "server-only"

import { cookies } from "next/headers"

/**
 * "While you were away" digest cookie (src/lib/digest.ts, Command Center).
 * Read-only helper — the write side (`markDashboardSeen`) lives in
 * src/app/(app)/dashboard/actions.ts because setting a cookie is only
 * allowed from a Server Action / Route Handler, not a plain Server
 * Component render.
 */
// Renamed from "los-last-seen" during the LocalOS → Lumina rename;
// device-local convenience state only, so we accept a one-time reset
// (the next visit just reports no prior baseline) rather than migrate.
export const LAST_SEEN_COOKIE = "lumina-last-seen"

/** The visitor's previous last-seen time (ISO string), or null on a first-ever visit (no cookie yet) — the digest has no honest baseline to report against in that case. */
export async function getLastSeenIso(): Promise<string | null> {
  const store = await cookies()
  return store.get(LAST_SEEN_COOKIE)?.value ?? null
}
