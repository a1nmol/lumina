import "server-only"

// Live data for the platform Admin panel (src/app/(app)/admin/page.tsx).
// Service-role-only: reads across every org, which regular RLS-scoped
// clients can't do. This module is the sole "cross-org read" seam — keep it
// that way rather than sprinkling createAdminClient() calls through the page.
//
// Orgs count is tiny at this (invite-only test) stage, so this fetches all
// usage_events once and aggregates per-org in memory rather than issuing N
// grouped queries — simplest correct approach at current scale.

import { FREE_TEST_LIMITS, prettifyPlanId } from "@/lib/entitlements"
import { PLAN_CATALOG, type PlanId } from "@/lib/plans"
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin"
import type { ConnectedChannels, PlanLimits } from "@/lib/types"

export interface AdminAccountRow {
  id: string
  name: string
  slug: string
  /** Raw plan id (e.g. `starter`) — the row's Sheet trigger + the org-detail Sheet's Actions menu both need this, not just the display name. */
  planId: string
  planName: string
  /** Most recent usage_events.created_at for this org, null if it has none. */
  lastActivityAt: string | null
  spendUsd: number
  eventCount: number
  /** True if any usage_event landed in the last 7 days. */
  isActiveThisWeek: boolean
  /** This month's spend as a percent of the org's effective spend cap (plan default, or override if set). Null when the plan has no spend cap. */
  usagePercent: number | null
  connectedChannels: ConnectedChannels
}

export interface AdminStats {
  totalAccounts: number
  activeThisWeek: number
  totalSpendUsd: number
  totalEvents: number
  accounts: AdminAccountRow[]
}

const EMPTY_STATS: AdminStats = {
  totalAccounts: 0,
  activeThisWeek: 0,
  totalSpendUsd: 0,
  totalEvents: 0,
  accounts: [],
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

function sevenDaysAgoIso(): string {
  return new Date(Date.now() - SEVEN_DAYS_MS).toISOString()
}

interface OrgUsageAgg {
  spendUsd: number
  eventCount: number
  lastActivityAt: string | null
}

/**
 * Every org on the platform with its plan name and usage_events aggregates
 * (total spend, event count, last activity, active-this-week). Returns
 * EMPTY_STATS in demo mode (Supabase not configured) so callers don't need
 * to branch — mirrors the isSupabaseConfigured() guard convention in
 * src/lib/usage.ts / src/lib/org.ts.
 */
export async function getAdminStats(): Promise<AdminStats> {
  if (!isSupabaseConfigured()) return EMPTY_STATS

  const supabase = createAdminClient()

  const [
    { data: orgs, error: orgsError },
    { data: entitlementsRows, error: entitlementsError },
    { data: plans, error: plansError },
    { data: usageRows, error: usageError },
    { data: brainRows, error: brainError },
  ] = await Promise.all([
    supabase.from("orgs").select("id, name, slug, created_at").order("created_at", { ascending: true }),
    supabase.from("entitlements").select("org_id, plan_id, overrides"),
    supabase.from("plans").select("id, name, limits"),
    supabase.from("usage_events").select("org_id, cost_usd, created_at"),
    supabase.from("business_brain").select("org_id, connected_channels"),
  ])

  if (orgsError) throw new Error(`getAdminStats: failed to load orgs: ${orgsError.message}`)
  if (entitlementsError) {
    throw new Error(`getAdminStats: failed to load entitlements: ${entitlementsError.message}`)
  }
  if (plansError) throw new Error(`getAdminStats: failed to load plans: ${plansError.message}`)
  if (usageError) throw new Error(`getAdminStats: failed to load usage_events: ${usageError.message}`)
  if (brainError) throw new Error(`getAdminStats: failed to load business_brain: ${brainError.message}`)

  const planNameById = new Map((plans ?? []).map((plan) => [plan.id, plan.name]))
  const planLimitsById = new Map((plans ?? []).map((plan) => [plan.id, plan.limits as PlanLimits]))
  const entitlementsByOrg = new Map((entitlementsRows ?? []).map((row) => [row.org_id, row]))
  const channelsByOrg = new Map(
    (brainRows ?? []).map((row) => [row.org_id, (row.connected_channels as ConnectedChannels | null) ?? {}])
  )

  const usageByOrg = new Map<string, OrgUsageAgg>()
  const sevenDaysAgo = sevenDaysAgoIso()
  let totalSpendUsd = 0
  let totalEvents = 0

  for (const row of usageRows ?? []) {
    const agg = usageByOrg.get(row.org_id) ?? { spendUsd: 0, eventCount: 0, lastActivityAt: null }
    agg.spendUsd += Number(row.cost_usd)
    agg.eventCount += 1
    if (!agg.lastActivityAt || row.created_at > agg.lastActivityAt) {
      agg.lastActivityAt = row.created_at
    }
    usageByOrg.set(row.org_id, agg)

    totalSpendUsd += Number(row.cost_usd)
    totalEvents += 1
  }

  const accounts: AdminAccountRow[] = (orgs ?? []).map((org) => {
    const agg = usageByOrg.get(org.id) ?? null
    const entitlementsRow = entitlementsByOrg.get(org.id)
    const planId = entitlementsRow?.plan_id ?? "free_test"
    const isActiveThisWeek = Boolean(agg?.lastActivityAt && agg.lastActivityAt >= sevenDaysAgo)

    const planLimits =
      planLimitsById.get(planId) ?? (PLAN_CATALOG[planId as PlanId] ?? PLAN_CATALOG.free_test).limits ?? FREE_TEST_LIMITS
    const overrideSpendCap = (entitlementsRow?.overrides as Partial<PlanLimits> | undefined)?.spend_cap_usd
    const spendCapUsd = overrideSpendCap ?? planLimits.spend_cap_usd ?? null
    const usagePercent =
      spendCapUsd && spendCapUsd > 0 ? Math.min(100, ((agg?.spendUsd ?? 0) / spendCapUsd) * 100) : null

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      planId,
      planName: planNameById.get(planId) ?? prettifyPlanId(planId),
      lastActivityAt: agg?.lastActivityAt ?? null,
      spendUsd: agg?.spendUsd ?? 0,
      eventCount: agg?.eventCount ?? 0,
      isActiveThisWeek,
      usagePercent,
      connectedChannels: channelsByOrg.get(org.id) ?? {},
    }
  })

  return {
    totalAccounts: accounts.length,
    activeThisWeek: accounts.filter((account) => account.isActiveThisWeek).length,
    totalSpendUsd,
    totalEvents,
    accounts,
  }
}
