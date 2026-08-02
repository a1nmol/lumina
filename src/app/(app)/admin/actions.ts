"use server"

// Platform-admin write surface for the org-detail Sheet (Outlast wave 4,
// design brief: "admin control panel... toggle their permissions for
// various features and which user to give that under which plan"). Every
// export here gates on isPlatformAdmin() FIRST and writes via the
// service-role admin client — entitlements has no client-writable RLS
// policy by design (self-escalation risk, see
// supabase/migrations/0001_foundation.sql's entitlements policy comment),
// so this file is the ONLY place org plans/flags/caps get changed.
//
// Read-modify-write race note: setOrgFlagOverride/clearOrgFlagOverride and
// setOrgCapOverrides/clearOrgCapOverride each do a SELECT then an UPDATE of
// the same `entitlements.overrides` jsonb blob (two round-trips, not a
// single atomic statement). Two concurrent admin edits to the SAME org's
// overrides could race and clobber one another. Acceptable at current scale
// — this is a single-operator admin panel (src/lib/admin.ts's allowlist is
// deliberately "not a multi-admin product surface yet") — same acceptance
// already on record for src/lib/usage.ts's allowance check/record race.

import { revalidatePath } from "next/cache"

import { isPlatformAdmin } from "@/lib/admin"
import {
  clearCapOverride,
  clearFlagOverride,
  mergeCapOverrides,
  mergeFlagOverride,
  type EntitlementOverrides,
} from "@/lib/entitlement-overrides"
import { planDefaultFlags } from "@/lib/entitlements"
import {
  FEATURE_FLAG_KEYS,
  PLAN_CATALOG,
  PLAN_LIMIT_KEYS,
  PLAN_ORDER,
  type FeatureFlagKey,
  type PlanId,
  type PlanLimitKey,
} from "@/lib/plans"
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin"
import { getUsageSummary, type UsageSummary } from "@/lib/usage"
import type { ConnectedChannels, Entitlements, FeatureFlags, PlanLimits } from "@/lib/types"

export interface OrgDetail {
  id: string
  name: string
  slug: string
  createdAt: string
  planId: string
  /** Raw `entitlements.overrides` — the Sheet derives inherited/overridden state from this. */
  overrides: EntitlementOverrides
  /** Plan limits merged with overrides — what the org actually gets right now. */
  effectiveLimits: PlanLimits
  /** Plan feature flags merged with overrides — what the org actually gets right now. */
  effectiveFlags: FeatureFlags
  /** `entitlements.updated_at`, for the "Changed [relative time]" section footers. Null if the org has no entitlements row yet. */
  entitlementsUpdatedAt: string | null
  connectedChannels: ConnectedChannels
  usage: UsageSummary
}

type ActionResult = { ok: true; detail: OrgDetail } | { ok: false; error: string }

function isKnownPlanId(id: string): id is PlanId {
  return (PLAN_ORDER as string[]).includes(id)
}

/** Loads everything the org-detail Sheet needs in one shot. Null when the org (or Supabase) isn't there. */
async function loadOrgDetail(orgId: string): Promise<OrgDetail | null> {
  if (!isSupabaseConfigured()) return null

  const supabase = createAdminClient()

  const [{ data: org, error: orgError }, { data: entitlementsRow, error: entError }, { data: brain }, usage] =
    await Promise.all([
      supabase.from("orgs").select("id, name, slug, created_at").eq("id", orgId).maybeSingle(),
      supabase
        .from("entitlements")
        .select("org_id, plan_id, feature_flags, overrides, updated_at")
        .eq("org_id", orgId)
        .maybeSingle(),
      supabase.from("business_brain").select("connected_channels").eq("org_id", orgId).maybeSingle(),
      getUsageSummary(orgId),
    ])

  if (orgError) throw new Error(`loadOrgDetail: failed to load org ${orgId}: ${orgError.message}`)
  if (entError) throw new Error(`loadOrgDetail: failed to load entitlements for org ${orgId}: ${entError.message}`)
  if (!org) return null

  const planId = entitlementsRow?.plan_id ?? "free_test"

  const { data: planRow, error: planError } = await supabase
    .from("plans")
    .select("limits")
    .eq("id", planId)
    .maybeSingle()
  if (planError) throw new Error(`loadOrgDetail: failed to load plan "${planId}": ${planError.message}`)

  const catalogPlan = isKnownPlanId(planId) ? PLAN_CATALOG[planId] : PLAN_CATALOG.free_test
  const planLimits = (planRow?.limits as PlanLimits | undefined) ?? catalogPlan.limits
  const overrides = (entitlementsRow?.overrides as EntitlementOverrides | undefined) ?? {}
  const { feature_flags: overrideFlags, ...capOverrides } = overrides

  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    createdAt: org.created_at,
    planId,
    overrides,
    effectiveLimits: { ...planLimits, ...capOverrides },
    effectiveFlags: {
      ...planDefaultFlags(planId),
      ...(entitlementsRow?.feature_flags as FeatureFlags | undefined),
      ...(overrideFlags ?? {}),
    },
    entitlementsUpdatedAt: entitlementsRow?.updated_at ?? null,
    connectedChannels: (brain?.connected_channels as ConnectedChannels | undefined) ?? {},
    usage,
  }
}

async function readOverrides(
  supabase: ReturnType<typeof createAdminClient>,
  orgId: string
): Promise<EntitlementOverrides> {
  const { data, error } = await supabase.from("entitlements").select("overrides").eq("org_id", orgId).maybeSingle()
  if (error) throw new Error(`Failed to read overrides for org ${orgId}: ${error.message}`)
  return (data?.overrides as EntitlementOverrides | undefined) ?? {}
}

async function writeOverrides(
  supabase: ReturnType<typeof createAdminClient>,
  orgId: string,
  overrides: EntitlementOverrides
): Promise<void> {
  // Only `org_id` + `overrides` are listed, so a conflict UPDATE leaves
  // `plan_id`/`feature_flags` untouched — a fresh INSERT (org with no
  // entitlements row yet) still gets their column defaults ('free_test' / {}).
  //
  // The cast below is required because `Entitlements["overrides"]` (types.ts)
  // is `Partial<PlanLimits> & { feature_flags?: FeatureFlags }` — PlanLimits'
  // `[key: string]: number` index signature makes that type structurally
  // reject any literal with an explicit non-number `feature_flags` property,
  // same reasoning documented on `EntitlementOverrides` above. The jsonb
  // column itself has no such constraint at runtime.
  const { error } = await supabase
    .from("entitlements")
    .upsert({ org_id: orgId, overrides: overrides as unknown as Entitlements["overrides"] }, { onConflict: "org_id" })
  if (error) throw new Error(`Failed to write overrides for org ${orgId}: ${error.message}`)
}

async function resultFor(orgId: string): Promise<ActionResult> {
  const detail = await loadOrgDetail(orgId)
  if (!detail) return { ok: false, error: "Org not found." }
  return { ok: true, detail }
}

/** Loads the full org-detail Sheet payload. Called when a table row is opened. */
export async function getOrgDetail(orgId: string): Promise<ActionResult> {
  if (!(await isPlatformAdmin())) return { ok: false, error: "Forbidden." }
  try {
    return await resultFor(orgId)
  } catch (error) {
    console.error("[admin] getOrgDetail failed", error)
    return { ok: false, error: "Couldn't load this account. Please try again." }
  }
}

/**
 * Moves an org to a different plan. Only `plan_id` and the `feature_flags`
 * base column change — `feature_flags` is re-synced to the new plan's
 * catalog defaults so un-overridden flags follow the new plan, exactly like
 * un-overridden caps already do (their plan lookup is live, via `plan_id`).
 * `overrides` (both caps and feature_flags) are never touched — existing
 * overrides survive a plan change on purpose (design brief: "Existing
 * overrides are kept").
 */
export async function setOrgPlan(orgId: string, planId: PlanId): Promise<ActionResult> {
  if (!(await isPlatformAdmin())) return { ok: false, error: "Forbidden." }
  if (!isKnownPlanId(planId)) return { ok: false, error: "Unknown plan." }

  try {
    const supabase = createAdminClient()
    const { error } = await supabase
      .from("entitlements")
      .upsert({ org_id: orgId, plan_id: planId, feature_flags: PLAN_CATALOG[planId].featureFlags }, { onConflict: "org_id" })
    if (error) throw new Error(error.message)

    revalidatePath("/admin")
    return await resultFor(orgId)
  } catch (error) {
    console.error("[admin] setOrgPlan failed", error)
    return { ok: false, error: "Couldn't change the plan. Please try again." }
  }
}

/** Creates (or updates) a per-org override for a single feature flag. */
export async function setOrgFlagOverride(orgId: string, flag: string, value: boolean): Promise<ActionResult> {
  if (!(await isPlatformAdmin())) return { ok: false, error: "Forbidden." }
  // Server-side key validation (review): admin-only, but the client's list
  // must never be the only thing keeping junk keys out of the jsonb blob.
  if (!FEATURE_FLAG_KEYS.includes(flag as FeatureFlagKey)) {
    return { ok: false, error: "Unknown feature flag." }
  }
  try {
    const supabase = createAdminClient()
    const current = await readOverrides(supabase, orgId)
    await writeOverrides(supabase, orgId, mergeFlagOverride(current, flag, value))

    revalidatePath("/admin")
    return await resultFor(orgId)
  } catch (error) {
    console.error("[admin] setOrgFlagOverride failed", error)
    return { ok: false, error: "Couldn't update this flag. Please try again." }
  }
}

/** Removes a flag's override — the org goes back to following its plan. */
export async function clearOrgFlagOverride(orgId: string, flag: string): Promise<ActionResult> {
  if (!(await isPlatformAdmin())) return { ok: false, error: "Forbidden." }
  try {
    const supabase = createAdminClient()
    const current = await readOverrides(supabase, orgId)
    await writeOverrides(supabase, orgId, clearFlagOverride(current, flag))

    revalidatePath("/admin")
    return await resultFor(orgId)
  } catch (error) {
    console.error("[admin] clearOrgFlagOverride failed", error)
    return { ok: false, error: "Couldn't reset this flag. Please try again." }
  }
}

/** Batch-saves one or more usage-cap overrides at once (the Sheet's caps save bar). */
export async function setOrgCapOverrides(
  orgId: string,
  patch: Partial<Record<PlanLimitKey, number>>
): Promise<ActionResult> {
  if (!(await isPlatformAdmin())) return { ok: false, error: "Forbidden." }
  // Server-side validation (review): a NaN/negative cap written here would
  // silently defang checkAllowance's spend guard (NaN comparisons are always
  // false) — the client save-bar gate is not a trust boundary.
  for (const [key, value] of Object.entries(patch)) {
    if (!PLAN_LIMIT_KEYS.includes(key as PlanLimitKey)) {
      return { ok: false, error: `Unknown usage cap "${key}".` }
    }
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      return { ok: false, error: "Caps must be zero or a positive number." }
    }
  }
  try {
    const supabase = createAdminClient()
    const current = await readOverrides(supabase, orgId)
    await writeOverrides(supabase, orgId, mergeCapOverrides(current, patch))

    revalidatePath("/admin")
    return await resultFor(orgId)
  } catch (error) {
    console.error("[admin] setOrgCapOverrides failed", error)
    return { ok: false, error: "Couldn't save these limits. Please try again." }
  }
}

/** Removes a single cap's override — the org goes back to following its plan. */
export async function clearOrgCapOverride(orgId: string, key: PlanLimitKey): Promise<ActionResult> {
  if (!(await isPlatformAdmin())) return { ok: false, error: "Forbidden." }
  try {
    const supabase = createAdminClient()
    const current = await readOverrides(supabase, orgId)
    await writeOverrides(supabase, orgId, clearCapOverride(current, key))

    revalidatePath("/admin")
    return await resultFor(orgId)
  } catch (error) {
    console.error("[admin] clearOrgCapOverride failed", error)
    return { ok: false, error: "Couldn't reset this limit. Please try again." }
  }
}

/**
 * "Reset all to plan defaults…" (header Actions menu) — wipes every
 * override (caps AND flags) and re-syncs the `feature_flags` base column to
 * the current plan, in one write. Does NOT change the plan itself.
 */
export async function resetOrgToPlanDefaults(orgId: string): Promise<ActionResult> {
  if (!(await isPlatformAdmin())) return { ok: false, error: "Forbidden." }
  try {
    const supabase = createAdminClient()
    const { data: row, error: readError } = await supabase
      .from("entitlements")
      .select("plan_id")
      .eq("org_id", orgId)
      .maybeSingle()
    if (readError) throw new Error(readError.message)

    const planId = row?.plan_id ?? "free_test"
    const catalogPlan = isKnownPlanId(planId) ? PLAN_CATALOG[planId] : PLAN_CATALOG.free_test

    const { error } = await supabase
      .from("entitlements")
      .upsert(
        { org_id: orgId, feature_flags: catalogPlan.featureFlags, overrides: {} },
        { onConflict: "org_id" }
      )
    if (error) throw new Error(error.message)

    revalidatePath("/admin")
    return await resultFor(orgId)
  } catch (error) {
    console.error("[admin] resetOrgToPlanDefaults failed", error)
    return { ok: false, error: "Couldn't reset this account. Please try again." }
  }
}
