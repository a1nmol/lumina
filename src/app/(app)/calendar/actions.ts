"use server"

// Server action for the Calendar's cross-day drag-drop reschedule. Demo-safe
// no-op when Supabase isn't configured — MonthView only calls this when it
// was rendered with real (isLive) data in the first place, but the guard
// here keeps the action itself safe to call unconditionally too.

import { queueContentItem, updateContentStatus } from "@/lib/content"
import { getCurrentOrgId } from "@/lib/org"
import { isSupabaseConfigured } from "@/lib/supabase/config"

export interface ReschedulePostResult {
  ok: boolean
}

/** Persists a drag-drop move to a new day/time: sets status "scheduled" + the new scheduled_at. */
export async function reschedulePost(
  contentId: string,
  newDateIso: string
): Promise<ReschedulePostResult> {
  if (!isSupabaseConfigured()) return { ok: true }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: false }

  try {
    const updated = await queueContentItem(orgId, contentId, newDateIso)
    return { ok: updated !== null }
  } catch {
    return { ok: false }
  }
}

export interface MarkPostedResult {
  ok: boolean
}

/** Post-detail sheet's "Mark as posted" action (reminder-to-post's manual-confirm step). Demo-safe no-op when Supabase isn't configured. */
export async function markPostAsPosted(contentId: string): Promise<MarkPostedResult> {
  if (!isSupabaseConfigured()) return { ok: true }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: false }

  try {
    const updated = await updateContentStatus(orgId, contentId, "posted")
    return { ok: updated !== null }
  } catch {
    return { ok: false }
  }
}
