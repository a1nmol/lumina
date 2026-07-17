"use server"

// Server action for the Calendar's cross-day drag-drop reschedule. Demo-safe
// no-op when Supabase isn't configured — MonthView only calls this when it
// was rendered with real (isLive) data in the first place, but the guard
// here keeps the action itself safe to call unconditionally too.

import { queueContentItem } from "@/lib/content"
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
