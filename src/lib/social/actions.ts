"use server"

// Server action(s) for the Settings "Channels" card
// (src/app/(app)/settings/channels-card.tsx). Disconnect is a privileged
// delete — social_connections has no RLS write policy for `authenticated`
// (tokens are sensitive; see supabase/migrations/0008_social_connections.sql),
// so this goes through the service-role admin client, scoped to the
// signed-in user's own org by an explicit `.eq("org_id", orgId)` alongside
// the id match.

import { revalidatePath } from "next/cache"

import { getCurrentOrgId } from "@/lib/org"
import { createAdminClient } from "@/lib/supabase/admin"
import { isSupabaseConfigured } from "@/lib/supabase/config"

export interface DisconnectSocialConnectionResult {
  ok: boolean
  /** Present when ok is false, so the caller can tailor its toast copy. */
  reason?: "no-org" | "not-configured" | "failed"
}

export async function disconnectSocialConnection(
  connectionId: string
): Promise<DisconnectSocialConnectionResult> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "not-configured" }
  if (typeof connectionId !== "string" || connectionId.trim().length === 0) {
    return { ok: false, reason: "failed" }
  }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: false, reason: "no-org" }

  const admin = createAdminClient()
  const { error } = await admin
    .from("social_connections")
    .delete()
    .eq("id", connectionId)
    .eq("org_id", orgId)

  if (error) {
    console.error("[social/actions] failed to disconnect social_connections row", error.message)
    return { ok: false, reason: "failed" }
  }

  revalidatePath("/settings")
  return { ok: true }
}
