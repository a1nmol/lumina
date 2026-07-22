"use server"

// Server actions backing the Calendar's "Enable post reminders" entry point
// (MASTER_PLAN.md §4.B reminder-to-post). Demo-safe: every action no-ops to
// a local-only result when Supabase and/or VAPID keys aren't configured, so
// the client-side toast/permission flow still works standalone.

import { getCurrentOrgId } from "@/lib/org"
import { isPushConfigured, saveSubscription, sendWebPush } from "@/lib/push"
import { createClient } from "@/lib/supabase/server"
import { isSupabaseConfigured } from "@/lib/supabase/config"

export interface SubscribeToPushResult {
  ok: boolean
  /** True when a real subscription was persisted AND a confirmation push was sent — the honest "this actually works" signal. */
  live: boolean
  reason?: string
}

/**
 * Persists a browser's push subscription for the signed-in user's org, then
 * immediately sends one confirmation push to it ("Reminders enabled 🎉") so
 * the click that granted permission gets instant, real proof it worked.
 *
 * Real scheduled server-side delivery (fire N minutes before a post's
 * scheduled_at, even with the tab closed) is a follow-up once this app is on
 * a host with cron — see src/lib/push.ts's top-of-file note.
 */
export async function subscribeToPush(subscription: unknown): Promise<SubscribeToPushResult> {
  if (!isSupabaseConfigured()) {
    return { ok: true, live: false, reason: "demo" }
  }
  if (!isPushConfigured()) {
    return { ok: true, live: false, reason: "push-not-configured" }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, live: false, reason: "unauthenticated" }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: false, live: false, reason: "no-org" }

  try {
    await saveSubscription(orgId, user.id, subscription)
  } catch {
    return { ok: false, live: false, reason: "save-failed" }
  }

  const parsed = subscription as { endpoint: string; keys: { p256dh: string; auth: string } }
  const result = await sendWebPush(
    { endpoint: parsed.endpoint, keys: parsed.keys },
    {
      title: "Reminders enabled 🎉",
      body: "We'll ping you when it's time to post — even if the tab's closed.",
      url: "/calendar?view=queue",
    }
  )

  return { ok: true, live: result.ok }
}
