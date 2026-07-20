// Typed plan catalog — MASTER_PLAN.md §4.G "subscription tiers (structure
// now, charge later)". Prices and limits below are INDICATIVE ONLY: there is
// no Stripe/billing wiring yet, and every org is on `free_test` during the
// invite-only phase (supabase/migrations/0001_foundation.sql seeds it as the
// entitlements default). Once billing goes live, the DB `plans` table stays
// the source of truth (src/lib/entitlements.ts reads it) — this catalog just
// mirrors the same numbers so the UI (admin Plans table, future upgrade
// flows) has a typed, importable copy without a round-trip.
//
// Keep in sync by hand with:
//   - supabase/migrations/0001_foundation.sql (seeds `free_test`)
//   - supabase/migrations/0005_plans.sql (seeds `starter` / `pro`)
//   - src/lib/entitlements.ts's FREE_TEST_LIMITS (the live demo-mode fallback)

import type { FeatureFlags, Plan, PlanLimits } from "@/lib/types"

export type PlanId = "free_test" | "starter" | "pro"

/** The known, explicit PlanLimits keys (PlanLimits also has a `[key: string]` index signature for forward-compat, which is why we don't use `keyof PlanLimits` directly here). */
export type PlanLimitKey = "content_generations" | "images" | "slideshows" | "ai_replies" | "spend_cap_usd"

export interface PlanCatalogEntry extends Plan {
  id: PlanId
  /** One-line description shown in the admin Plans table. */
  tagline: string
  /**
   * Indicative feature flags for this tier. NOT wired to the entitlements
   * table yet — `entitlements.feature_flags` is set per-org today, not
   * derived from `plan_id` (see supabase/migrations/0001_foundation.sql).
   * Shown as a preview of what each tier will unlock once plan-level flag
   * inheritance ships.
   */
  featureFlags: FeatureFlags
}

const FREE_TEST_LIMITS: PlanLimits = {
  content_generations: 200,
  images: 100,
  slideshows: 20,
  ai_replies: 500,
  spend_cap_usd: 10,
}

const STARTER_LIMITS: PlanLimits = {
  content_generations: 500,
  images: 300,
  slideshows: 60,
  ai_replies: 2000,
  spend_cap_usd: 25,
}

const PRO_LIMITS: PlanLimits = {
  content_generations: 2000,
  images: 1000,
  slideshows: 200,
  ai_replies: 8000,
  spend_cap_usd: 80,
}

const BASE_FLAGS: FeatureFlags = {
  voice: false,
  video: false,
  white_label_reports: false,
}

export const PLAN_CATALOG: Record<PlanId, PlanCatalogEntry> = {
  free_test: {
    id: "free_test",
    name: "Free (Test Phase)",
    monthly_price_cents: 0,
    tagline: "Invite-only test phase — every org is on this plan today.",
    limits: FREE_TEST_LIMITS,
    featureFlags: { ...BASE_FLAGS },
  },
  starter: {
    id: "starter",
    name: "Starter",
    monthly_price_cents: 2900,
    tagline: "A single location getting content + FrontDesk off the ground.",
    limits: STARTER_LIMITS,
    featureFlags: { ...BASE_FLAGS },
  },
  pro: {
    id: "pro",
    name: "Pro",
    monthly_price_cents: 7900,
    tagline: "Busier locations that want higher ceilings and video content.",
    limits: PRO_LIMITS,
    featureFlags: { ...BASE_FLAGS, video: true, white_label_reports: true },
  },
}

/** Display order, cheapest first — drives the admin Plans table row order. */
export const PLAN_ORDER: PlanId[] = ["free_test", "starter", "pro"]

export function formatMonthlyPrice(cents: number): string {
  if (cents <= 0) return "Free"
  return `$${(cents / 100).toFixed(0)}/mo`
}

/** Human labels for the PlanLimits keys shown in the catalog/admin table. */
export const PLAN_LIMIT_LABELS: Record<PlanLimitKey, string> = {
  content_generations: "Content gens",
  images: "Images",
  slideshows: "Slideshows",
  ai_replies: "AI replies",
  spend_cap_usd: "Spend cap",
}
