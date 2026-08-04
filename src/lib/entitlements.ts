import "server-only"

// Server-only entitlements resolution: merges an org's plan limits with its
// feature flags and per-org overrides into one convenient shape. Used by
// usage.ts (the spend guard) and by feature-gated server code.

import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin"
import type { FeatureFlags, PlanLimits } from "@/lib/types"

import { PLAN_CATALOG, type PlanId } from "@/lib/plans"

/** Mirrors the 'free_test' plan seeded in supabase/migrations/0001_foundation.sql. */
export const FREE_TEST_LIMITS: PlanLimits = {
  content_generations: 200,
  images: 100,
  slideshows: 20,
  ai_replies: 500,
  voice_minutes: 30,
  spend_cap_usd: 10,
}

export interface ResolvedEntitlements {
  orgId: string
  planId: string
  /** Plan limits merged with org-level overrides. */
  limits: PlanLimits
  /** Plan feature flags merged with org-level overrides.feature_flags. */
  featureFlags: FeatureFlags
}

/**
 * The catalog's indicative feature flags for a plan id, falling back to
 * free_test's (all-false, `BASE_FLAGS`) for an unknown plan id. Public so the
 * admin panel (src/app/(app)/admin/actions.ts) can sync `entitlements.
 * feature_flags` to the new plan's defaults on a plan change, and can render
 * "Plan default (Pro)" captions for un-overridden entitlement rows.
 */
export function planDefaultFlags(planId: string): FeatureFlags {
  return { ...(PLAN_CATALOG[planId as PlanId]?.featureFlags ?? PLAN_CATALOG.free_test.featureFlags) }
}

const DEMO_ENTITLEMENTS = (orgId: string): ResolvedEntitlements => ({
  orgId,
  planId: "free_test",
  limits: { ...FREE_TEST_LIMITS },
  featureFlags: planDefaultFlags("free_test"),
})

/**
 * Resolves an org's effective entitlements: plan limits + feature_flags,
 * merged with any per-org overrides. Falls back to sensible free_test
 * defaults when Supabase isn't configured (local/demo mode) so gated code
 * paths never crash before the database is connected.
 */
export async function getEntitlements(orgId: string): Promise<ResolvedEntitlements> {
  if (!isSupabaseConfigured()) {
    return DEMO_ENTITLEMENTS(orgId)
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("entitlements")
    .select("org_id, plan_id, feature_flags, overrides")
    .eq("org_id", orgId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load entitlements for org ${orgId}: ${error.message}`)
  }

  if (!data) {
    // Org has no entitlements row yet — treat as free_test defaults.
    return DEMO_ENTITLEMENTS(orgId)
  }

  const { data: plan, error: planError } = await supabase
    .from("plans")
    .select("limits")
    .eq("id", data.plan_id)
    .maybeSingle()

  if (planError) {
    throw new Error(`Failed to load plan "${data.plan_id}": ${planError.message}`)
  }

  const planLimits = plan?.limits ?? FREE_TEST_LIMITS
  const { feature_flags: overrideFlags, ...limitOverrides } = data.overrides

  // Effective flags = plan catalog defaults, then the org's own
  // `feature_flags` column (legacy/manual per-org base, normally kept in
  // sync with the plan by src/app/(app)/admin/actions.ts#setOrgPlan), then
  // per-org overrides on top — highest priority last. This is the "plan-level
  // flag inheritance" the plans.ts catalog comment anticipated; the admin
  // panel (Outlast wave 4) is what actually writes overrides now.
  //
  // DRIFT TRAP (review-noted): the DB column outranks the catalog layer, and
  // only setOrgPlan/resetOrgToPlanDefaults re-sync it. If a plan's catalog
  // default for an EXISTING flag ever changes in code, orgs already on that
  // plan keep their stale snapshot until an admin re-runs "Change plan" or
  // "Reset to defaults" on them — there is no bulk resync today. Adding a
  // NEW flag is safe (catalog layer supplies it).
  return {
    orgId: data.org_id,
    planId: data.plan_id,
    limits: { ...planLimits, ...limitOverrides },
    featureFlags: { ...planDefaultFlags(data.plan_id), ...data.feature_flags, ...(overrideFlags ?? {}) },
  }
}

/** Convenience check for a single boolean feature flag. Demo-safe. */
export async function hasFeature(orgId: string, flag: string): Promise<boolean> {
  const entitlements = await getEntitlements(orgId)
  return Boolean(entitlements.featureFlags[flag])
}

/**
 * Turns a plan id (e.g. `free_test`) into a friendly label (`Free test
 * plan`) when there's no `plans.name` to use instead — see
 * src/lib/org.ts#getOrgSidebarContext, which prefers the real plan name and
 * falls back to this. Idempotent for ids that already end in "plan".
 */
export function prettifyPlanId(planId: string): string {
  const spaced = planId.replace(/[_-]+/g, " ").trim()
  if (!spaced) return "Free plan"
  const capitalized = spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase()
  return /plan$/i.test(capitalized) ? capitalized : `${capitalized} plan`
}
