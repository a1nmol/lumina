"use server"

import { cookies } from "next/headers"

import { LAST_SEEN_COOKIE } from "@/lib/last-seen"

/** ~400 days — the practical max Chrome/Safari honor for a cookie's maxAge, and long enough that a returning owner always has a baseline. */
const LAST_SEEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 400

/**
 * Advances the "while you were away" digest's last-seen cookie to now.
 * Client-triggered, fire-and-forget, on every Command Center mount (see
 * src/components/dashboard/digest-seen-tracker.tsx) — and always AFTER the
 * page has already rendered using the PREVIOUS cookie value via
 * src/lib/digest.ts, or every visit would show zero new activity.
 */
export async function markDashboardSeen(): Promise<void> {
  const store = await cookies()
  store.set(LAST_SEEN_COOKIE, new Date().toISOString(), {
    path: "/",
    maxAge: LAST_SEEN_MAX_AGE_SECONDS,
    sameSite: "lax",
  })
}
