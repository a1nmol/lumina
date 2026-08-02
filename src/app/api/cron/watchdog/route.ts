// Never-go-dark ops watchdog — scheduled entry point (see vercel.json's
// "crons" array, every 6h). Vercel Cron invokes this with
// `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set in the
// project's env — see https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs.
// All the actual checking/alerting logic lives in src/lib/watchdog.ts (kept
// out of the route so it stays unit-testable without a request object).

import { timingSafeEqual } from "node:crypto"

import { NextResponse, type NextRequest } from "next/server"

import { runWatchdog } from "@/lib/watchdog"

// Explicit ceiling so a slow run (many orgs, slow queries) degrades to
// "finishes late" on Fluid Compute rather than inheriting a surprise default.
export const maxDuration = 60

/** Timing-safe bearer comparison — house style for secret checks (see src/app/api/webhooks/instagram/route.ts's isValidSignature). */
function isAuthorized(authHeader: string | null, cronSecret: string): boolean {
  if (!authHeader) return false
  const expected = Buffer.from(`Bearer ${cronSecret}`)
  const provided = Buffer.from(authHeader)
  if (expected.length !== provided.length) return false
  return timingSafeEqual(expected, provided)
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && !isAuthorized(request.headers.get("authorization"), cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  // CRON_SECRET unset (local/demo dev) — allow through, matching the rest of
  // the codebase's "skip the guard entirely when the secret isn't configured"
  // convention (see src/app/api/webhooks/instagram/route.ts's INSTAGRAM_APP_SECRET
  // check and src/app/api/twilio/sms/route.ts's TWILIO_AUTH_TOKEN check).

  try {
    const result = await runWatchdog()
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error("[cron/watchdog] run failed", error)
    return NextResponse.json({ ok: false, error: "watchdog run failed" }, { status: 500 })
  }
}
