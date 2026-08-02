// Morning brief — scheduled entry point (Outlast wave 2, Part B; see
// vercel.json's "crons" array, daily at 12:30 UTC). Gathers each org's last
// 24h (src/lib/morning-brief.ts's buildMorningBrief) and emails the owner a
// plain-language recap (src/lib/email.ts's sendMorningBriefEmail) — skipping
// orgs with zero message activity in the window, and deduping through the
// SAME watchdog_alerts ledger the ops watchdog cron uses (kind
// "morning_brief", see src/lib/watchdog.ts's WatchdogAlertKind) so a manual
// poke of this route can't double-send the same day's brief. Auth gate is
// shared with the watchdog route — see src/lib/cron-auth.ts.
//
// Outlast wave 3, Part B: AFTER briefs send, this same invocation also runs
// the proactive follow-up scan (src/lib/follow-ups.ts's runFollowUpScan) —
// Vercel's Hobby plan caps a project at 2 cron jobs, and watchdog +
// morning-brief already use both slots (see vercel.json), so follow-ups get
// no cron entry of their own and instead ride this daily invocation. The two
// stay decoupled in code (runFollowUpScan is a self-contained module); only
// the schedule is shared. A crash in the follow-up scan is caught separately
// and never fails the brief-sending response above it.

import { NextResponse, type NextRequest } from "next/server"

import { isAuthorizedCronRequest } from "@/lib/cron-auth"
import { sendMorningBriefEmail } from "@/lib/email"
import { runFollowUpScan } from "@/lib/follow-ups"
import { briefHasActivity, buildMorningBrief } from "@/lib/morning-brief"
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin"
import { getLastAlertSentAt, recordAlertSent, shouldSendWatchdogAlert, type WatchdogAlertKind } from "@/lib/watchdog"

// Explicit ceiling so a slow run (many orgs, slow queries) degrades to
// "finishes late" on Fluid Compute rather than inheriting a surprise default
// — mirrors src/app/api/cron/watchdog/route.ts.
export const maxDuration = 60

const MORNING_BRIEF_KIND: WatchdogAlertKind = "morning_brief"

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && !isAuthorizedCronRequest(request.headers.get("authorization"), cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  // CRON_SECRET unset (local/demo dev) — allow through, matching
  // src/app/api/cron/watchdog/route.ts's convention.

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true, sent: 0, skipped: 0 })
  }

  try {
    const admin = createAdminClient()
    const now = new Date()

    const { data: orgs, error } = await admin.from("orgs").select("id")
    if (error) {
      console.error("[cron/morning-brief] failed to load orgs", error.message)
      return NextResponse.json({ ok: false, error: "failed to load orgs" }, { status: 500 })
    }

    let sent = 0
    let skipped = 0

    for (const org of orgs ?? []) {
      const data = await buildMorningBrief(org.id, now)

      // Skip rule 1: no email when the org had zero messages (in or out) in 24h.
      if (!briefHasActivity(data.counts)) {
        skipped++
        continue
      }

      // Skip rule 2 (dedupe): reuse the watchdog_alerts ledger so a manual
      // poke of this route can't double-send the same day's brief.
      const lastSentAt = await getLastAlertSentAt(admin, org.id, MORNING_BRIEF_KIND)
      if (!shouldSendWatchdogAlert(lastSentAt, now, MORNING_BRIEF_KIND)) {
        skipped++
        continue
      }

      try {
        await sendMorningBriefEmail({ orgId: org.id, data })
        await recordAlertSent(admin, org.id, MORNING_BRIEF_KIND, "morning brief sent")
        sent++
      } catch (sendError) {
        // One org's failed send must never stop the rest of the run.
        console.error(`[cron/morning-brief] failed to send brief for org ${org.id}`, sendError)
      }
    }

    // Follow-up scan (Outlast wave 3, Part B) — runs AFTER briefs send, in
    // this same invocation (see the module header). Its own findings surface
    // in the Inbox immediately and in TOMORROW's brief (via
    // gatherSuggestedFollowUps' 24h window) — never in today's, since briefs
    // for this run were already built above. Isolated in its own try/catch:
    // a crash here must never turn an otherwise-successful brief-sending run
    // into a 500.
    let followUps = { created: 0, scannedOrgs: 0 }
    try {
      followUps = await runFollowUpScan(now)
    } catch (followUpError) {
      console.error("[cron/morning-brief] follow-up scan failed", followUpError)
    }

    return NextResponse.json({ ok: true, sent, skipped, followUps })
  } catch (error) {
    console.error("[cron/morning-brief] run failed", error)
    return NextResponse.json({ ok: false, error: "morning brief run failed" }, { status: 500 })
  }
}
