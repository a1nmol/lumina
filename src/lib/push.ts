import "server-only"

// Server-only Web Push plumbing for the ★reminder-to-post flow
// (MASTER_PLAN.md §4.B). Backs supabase/migrations/0006_push_subscriptions.sql
// via the RLS-scoped server client — every read/write here is subject to the
// push_subscriptions policies (insert restricted to the caller's own
// user_id, in an org they belong to), matching the convention in
// src/lib/content.ts.
//
// SCOPE (honest about what's real today, see the migration file's note too):
// this module can save a subscription and send an immediate push to it. It
// does NOT schedule a future send — true server-side "fire N minutes before
// the scheduled post time" needs a cron host (Vercel Cron or similar) to
// wake up and call sendWebPush() at the right moment; that's a follow-up
// once the app is deployed. Today's client-side timer
// (src/components/calendar/reminder-button.tsx) still does the actual
// "notify me 10 minutes before" job while the tab is open; this module adds
// the piece that works even when the tab/app is closed, for the one moment
// that matters right now: confirming the subscription actually works.

import webpush from "web-push"

import { createClient } from "@/lib/supabase/server"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import type { PushSubscriptionKeys } from "@/lib/types"

export interface PushSubscriptionInput {
  endpoint: string
  keys: PushSubscriptionKeys
}

export interface PushPayload {
  title: string
  body: string
  /** Deep-link opened on notification click — see public/sw.js's notificationclick handler. */
  url?: string
}

/** True once both VAPID keys are present. Web Push cannot be sent/subscribed to without them. */
export function isPushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
}

let vapidConfigured = false

/** Configures the web-push library's VAPID details exactly once per server instance. */
function ensureVapidConfigured(): void {
  if (vapidConfigured) return
  if (!isPushConfigured()) {
    throw new Error("push: VAPID keys are not configured (NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).")
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:support@lumina.app",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  )
  vapidConfigured = true
}

function isValidSubscription(value: unknown): value is PushSubscriptionInput {
  if (!value || typeof value !== "object") return false
  const candidate = value as Record<string, unknown>
  if (typeof candidate.endpoint !== "string" || candidate.endpoint.length === 0) return false
  if (!candidate.keys || typeof candidate.keys !== "object") return false

  const keys = candidate.keys as Record<string, unknown>
  return typeof keys.p256dh === "string" && typeof keys.auth === "string"
}

/**
 * Saves (or refreshes) a push subscription for the given org/user, keyed by
 * endpoint (unique per browser/device). Demo-safe no-op (`false`) when
 * Supabase isn't configured — the caller falls back to a local-only toast.
 */
export async function saveSubscription(
  orgId: string,
  userId: string,
  subscription: unknown
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false
  if (!isValidSubscription(subscription)) {
    throw new Error("push: malformed subscription payload")
  }

  const supabase = await createClient()
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      org_id: orgId,
      user_id: userId,
      endpoint: subscription.endpoint,
      keys: subscription.keys,
    },
    { onConflict: "endpoint" }
  )

  if (error) {
    throw new Error(`saveSubscription: failed to save push subscription for org ${orgId}: ${error.message}`)
  }

  return true
}

export interface SendWebPushResult {
  ok: boolean
  /** True when the push service reported the subscription is gone (404/410) — caller should stop retrying/drop it. */
  expired?: boolean
}

/** Sends one Web Push message to one subscription. Never throws — reports failure via the result instead. */
export async function sendWebPush(
  subscription: PushSubscriptionInput,
  payload: PushPayload
): Promise<SendWebPushResult> {
  try {
    ensureVapidConfigured()
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: subscription.keys },
      JSON.stringify(payload)
    )
    return { ok: true }
  } catch (error) {
    const statusCode = (error as { statusCode?: number } | null)?.statusCode
    return { ok: false, expired: statusCode === 404 || statusCode === 410 }
  }
}

/**
 * Removes a subscription (e.g. after sendWebPush reports it's expired, or on
 * explicit unsubscribe). Demo-safe no-op when Supabase isn't configured.
 */
export async function deleteSubscription(orgId: string, endpoint: string): Promise<void> {
  if (!isSupabaseConfigured()) return

  const supabase = await createClient()
  await supabase.from("push_subscriptions").delete().eq("org_id", orgId).eq("endpoint", endpoint)
}
