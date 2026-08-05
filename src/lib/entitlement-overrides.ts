// Pure, unit-testable merge/diff helpers for the admin org-detail Sheet
// (Outlast wave 4, src/app/(app)/admin/*). No I/O here on purpose — the
// server actions in src/app/(app)/admin/actions.ts do the Supabase
// read-modify-write around these functions, so the tricky "how do overrides
// merge" logic can be tested without a database.
//
// The Sheet's core pattern (design brief): every flag/cap either INHERITS
// the current plan's value, or is OVERRIDDEN by an explicit per-org value
// stored in `entitlements.overrides`. Toggling an inherited row CREATES an
// override; "Reset to plan default" REMOVES the key entirely — it never
// writes the plan's current value, so the row keeps tracking the plan if the
// org's plan changes later.

import { PLAN_CATALOG, PLAN_LIMIT_KEYS, type FeatureFlagKey, type PlanId, type PlanLimitKey } from "@/lib/plans"
import type { FeatureFlags } from "@/lib/types"

/**
 * Mirrors `entitlements.overrides` jsonb shape (src/lib/types.ts's
 * `Entitlements.overrides`), but keyed on the known `PlanLimitKey`s rather
 * than `PlanLimits` directly — `PlanLimits` has a `[key: string]: number`
 * index signature (for forward-compat), which TS won't let intersect with an
 * explicitly-typed `feature_flags` property (same reasoning as
 * `PlanLimitKey` itself, see plans.ts).
 */
export type EntitlementOverrides = Partial<Record<PlanLimitKey, number>> & { feature_flags?: FeatureFlags }

/** Returns a new overrides object with `flag` set to `value` inside `overrides.feature_flags`. Never mutates the input. */
export function mergeFlagOverride(
  overrides: EntitlementOverrides,
  flag: string,
  value: boolean
): EntitlementOverrides {
  return {
    ...overrides,
    feature_flags: { ...(overrides.feature_flags ?? {}), [flag]: value },
  }
}

/**
 * Returns a new overrides object with `flag` removed from
 * `overrides.feature_flags` (falls back to the plan default). Drops the
 * `feature_flags` key entirely once it's empty, so a fully-reset org's
 * overrides serialize as `{}` rather than `{ feature_flags: {} }`.
 */
export function clearFlagOverride(overrides: EntitlementOverrides, flag: string): EntitlementOverrides {
  const { feature_flags, ...rest } = overrides
  if (!feature_flags || !(flag in feature_flags)) return overrides

  const nextFlags = { ...feature_flags }
  delete nextFlags[flag]

  return Object.keys(nextFlags).length > 0 ? { ...rest, feature_flags: nextFlags } : rest
}

/** Returns a new overrides object with the given cap keys merged in at the top level. Never touches `feature_flags`. */
export function mergeCapOverrides(
  overrides: EntitlementOverrides,
  patch: Partial<Record<PlanLimitKey, number>>
): EntitlementOverrides {
  return { ...overrides, ...patch }
}

/** Returns a new overrides object with a single cap key removed (falls back to the plan default). */
export function clearCapOverride(overrides: EntitlementOverrides, key: PlanLimitKey): EntitlementOverrides {
  if (!(key in overrides)) return overrides
  const next = { ...overrides }
  delete next[key]
  return next
}

/** True when `key` has an explicit per-org override (as opposed to inheriting the plan's value). */
export function isCapOverridden(overrides: EntitlementOverrides, key: PlanLimitKey): boolean {
  return overrides[key] !== undefined
}

/** True when `flag` has an explicit per-org override. */
export function isFlagOverridden(overrides: EntitlementOverrides, flag: string): boolean {
  return overrides.feature_flags?.[flag] !== undefined
}

export interface CapDiffEntry {
  key: PlanLimitKey
  label: string
  from: number | undefined
  to: number | undefined
}

export interface FlagDiffEntry {
  flag: FeatureFlagKey
  label: string
  from: boolean
  to: boolean
}

export interface PlanDiff {
  capDiffs: CapDiffEntry[]
  flagDiffs: FlagDiffEntry[]
}

/**
 * The before/after diff shown in the "Change plan" confirm Dialog: every
 * cap/flag that (a) is NOT overridden for this org and (b) actually differs
 * between the current and target plan. Overridden fields are excluded on
 * purpose — moving plans never touches them, so they'd be a misleading row
 * in a "here's what changes" preview.
 */
export function computePlanDiff(
  currentPlanId: string,
  overrides: EntitlementOverrides,
  targetPlanId: PlanId,
  labels: { limits: Record<PlanLimitKey, string>; flags: Record<FeatureFlagKey, string> }
): PlanDiff {
  const current = PLAN_CATALOG[currentPlanId as PlanId] ?? PLAN_CATALOG.free_test
  const target = PLAN_CATALOG[targetPlanId] ?? PLAN_CATALOG.free_test

  const capDiffs: CapDiffEntry[] = PLAN_LIMIT_KEYS.filter((key) => !isCapOverridden(overrides, key))
    .filter((key) => current.limits[key] !== target.limits[key])
    .map((key) => ({ key, label: labels.limits[key], from: current.limits[key], to: target.limits[key] }))

  const flagDiffs: FlagDiffEntry[] = (Object.keys(current.featureFlags) as FeatureFlagKey[])
    .filter((flag) => !isFlagOverridden(overrides, flag))
    .filter((flag) => Boolean(current.featureFlags[flag]) !== Boolean(target.featureFlags[flag]))
    .map((flag) => ({
      flag,
      label: labels.flags[flag],
      from: Boolean(current.featureFlags[flag]),
      to: Boolean(target.featureFlags[flag]),
    }))

  return { capDiffs, flagDiffs }
}
