import "server-only"

// Shared timing-safe bearer-token gate for every /api/cron/* route. Vercel
// Cron invokes these with `Authorization: Bearer $CRON_SECRET` when
// CRON_SECRET is set in the project's env — see
// https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs.
// Extracted from src/app/api/cron/watchdog/route.ts (Outlast wave 2) so
// every cron route shares one implementation instead of copy-pasting it.

import { timingSafeEqual } from "node:crypto"

/**
 * Timing-safe bearer comparison — house style for secret checks (see
 * src/app/api/webhooks/instagram/route.ts's isValidSignature). Returns false
 * (never throws) on a missing header or a length mismatch, so a malformed
 * request never leaks timing information about the real secret's length.
 */
export function isAuthorizedCronRequest(authHeader: string | null, cronSecret: string): boolean {
  if (!authHeader) return false
  const expected = Buffer.from(`Bearer ${cronSecret}`)
  const provided = Buffer.from(authHeader)
  if (expected.length !== provided.length) return false
  return timingSafeEqual(expected, provided)
}
