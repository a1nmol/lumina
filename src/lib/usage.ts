import "server-only"

// Server-only usage metering + spend guard (MASTER_PLAN.md §4/§5 — "entitlements
// + usage metering first"). All writes go through the service-role admin
// client so RLS can safely deny client-side inserts to usage_events.

import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin"
import type { PlanLimits, UsageFeature } from "@/lib/types"

import { getEntitlements } from "./entitlements"

export interface RecordUsageInput {
  feature: UsageFeature
  model?: string
  units?: number
  costUsd?: number
  metadata?: Record<string, unknown>
}

export interface UsageSummary {
  /** Total units used per feature this period. */
  unitsByFeature: Record<string, number>
  /** Total cost (USD) per feature this period. */
  costByFeature: Record<string, number>
  /** Total cost (USD) across all features this period — compared to spend_cap_usd. */
  totalCostUsd: number
  periodStart: string
}

export interface AllowanceResult {
  allowed: boolean
  used: number
  limit: number | null
  reason?: string
}

function startOfCurrentMonthIso(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

const EMPTY_SUMMARY = (periodStart: string): UsageSummary => ({
  unitsByFeature: {},
  costByFeature: {},
  totalCostUsd: 0,
  periodStart,
})

/**
 * Records one metered usage event for an org (e.g. a content generation, an
 * image render, an AI reply). No-ops safely in demo mode (Supabase not
 * configured) so local development never crashes.
 *
 * TODO: checkAllowance() (read this month's usage) and recordUsage() (write
 * a new event) are two separate round-trips, so two concurrent requests can
 * both pass the allowance check before either's usage is recorded ("check
 * then act" race) and briefly overshoot a limit/spend cap. Acceptable at
 * current (invite-only, low-concurrency) scale; if this becomes a problem,
 * move the check + insert into a single Postgres function/transaction (e.g.
 * an atomic `SELECT ... FOR UPDATE` on a per-org usage counter, or a
 * unique/advisory-lock-guarded RPC) instead of two client round-trips.
 */
export async function recordUsage(orgId: string, input: RecordUsageInput): Promise<void> {
  if (!isSupabaseConfigured()) return

  const supabase = createAdminClient()
  const { error } = await supabase.from("usage_events").insert({
    org_id: orgId,
    feature: input.feature,
    model: input.model ?? null,
    units: input.units ?? 1,
    cost_usd: input.costUsd ?? 0,
    metadata: input.metadata ?? {},
  })

  if (error) {
    throw new Error(`Failed to record usage for org ${orgId}: ${error.message}`)
  }
}

/**
 * Aggregates units + cost per feature for the given org, for the current
 * calendar month (or the month containing `periodStart`, if provided).
 * Returns an all-zero summary in demo mode.
 */
export async function getUsageSummary(
  orgId: string,
  periodStart?: string
): Promise<UsageSummary> {
  const start = periodStart ?? startOfCurrentMonthIso()

  if (!isSupabaseConfigured()) {
    return EMPTY_SUMMARY(start)
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("usage_events")
    .select("feature, units, cost_usd")
    .eq("org_id", orgId)
    .gte("created_at", start)

  if (error) {
    throw new Error(`Failed to load usage summary for org ${orgId}: ${error.message}`)
  }

  const summary = EMPTY_SUMMARY(start)
  for (const row of data ?? []) {
    summary.unitsByFeature[row.feature] = (summary.unitsByFeature[row.feature] ?? 0) + Number(row.units)
    summary.costByFeature[row.feature] = (summary.costByFeature[row.feature] ?? 0) + Number(row.cost_usd)
    summary.totalCostUsd += Number(row.cost_usd)
  }

  return summary
}

function resolveLimit(limits: PlanLimits, feature: UsageFeature): number | null {
  const value = limits[feature]
  return typeof value === "number" ? value : null
}

/**
 * The spend guard + per-feature allowance check. Merges plan limits with
 * per-org overrides, compares against this month's usage, and denies once
 * either the feature-specific limit or the org's spend_cap_usd is hit.
 *
 * Fails closed: a feature with no configured limit in the merged plan
 * limits/overrides is DENIED, not treated as unlimited — an unmetered
 * feature is far more likely to be a missing config entry than an
 * intentionally-unlimited one, and cost control (MASTER_PLAN.md §5) must
 * default to safe. Configure an explicit limit (including a very high one,
 * or `Infinity`-style large number, if truly unlimited is intended) in the
 * plan's `limits` or the org's `overrides` instead.
 *
 * The one exception is demo mode (Supabase not configured), which always
 * returns `{ allowed: true, used: 0, limit: null }` so local development is
 * never blocked before a database is connected.
 */
export async function checkAllowance(
  orgId: string,
  feature: UsageFeature
): Promise<AllowanceResult> {
  if (!isSupabaseConfigured()) {
    return { allowed: true, used: 0, limit: null }
  }

  const [entitlements, summary] = await Promise.all([
    getEntitlements(orgId),
    getUsageSummary(orgId),
  ])

  const used = summary.unitsByFeature[feature] ?? 0
  const limit = resolveLimit(entitlements.limits, feature)

  const spendCap = entitlements.limits.spend_cap_usd
  if (typeof spendCap === "number" && summary.totalCostUsd >= spendCap) {
    return {
      allowed: false,
      used,
      limit,
      reason: `Org has reached its monthly spend cap ($${spendCap.toFixed(2)}).`,
    }
  }

  if (limit === null) {
    return {
      allowed: false,
      used,
      limit,
      reason: `No limit configured for feature "${feature}" — denying by default (fail closed). Add a limit to the plan or org overrides to enable it.`,
    }
  }

  if (used >= limit) {
    return {
      allowed: false,
      used,
      limit,
      reason: `Org has reached its monthly limit for "${feature}" (${limit}).`,
    }
  }

  return { allowed: true, used, limit }
}
