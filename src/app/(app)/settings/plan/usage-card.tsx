// Quiet "current plan + usage" card for the Settings hub. Server component —
// reads the same getUsageSummary()/getEntitlements() seam checkAllowance()
// uses internally (src/lib/usage.ts), demo-safe (all-zero usage when
// Supabase isn't configured). No upgrade CTA: billing isn't turned on yet
// during the invite-only test phase (MASTER_PLAN.md §4.G).

import { CircleDollarSign } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardIcon, CardTitle } from "@/components/ui/card"
import { DEMO_ORG } from "@/lib/demo"
import { FREE_TEST_LIMITS, getEntitlements, type ResolvedEntitlements } from "@/lib/entitlements"
import { getCurrentOrgId } from "@/lib/org"
import { formatMonthlyPrice, PLAN_CATALOG, type PlanId } from "@/lib/plans"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import type { PlanLimits, UsageFeature } from "@/lib/types"
import { getUsageSummary, type UsageSummary } from "@/lib/usage"

import { UsageBar } from "../usage-bar"

const FEATURE_ORDER: UsageFeature[] = ["content_generations", "images", "slideshows", "ai_replies"]

const FEATURE_LABELS: Record<string, string> = {
  content_generations: "Content generations",
  images: "Images",
  slideshows: "Slideshows",
  ai_replies: "AI replies",
}

function isKnownPlanId(id: string): id is PlanId {
  return id === "free_test" || id === "starter" || id === "pro"
}

function formatBar(used: number, limit: number | null, format: (value: number) => string) {
  const valueText = limit !== null ? `${format(used)} / ${format(limit)}` : `${format(used)} used`
  const percent = limit ? Math.min(100, (used / limit) * 100) : 0
  const nearLimit = limit !== null && limit > 0 && used / limit >= 0.9
  return { valueText, percent, nearLimit }
}

/** Zero usage, free_test limits — for a live org that hasn't resolved yet (no org id to query). */
function emptyUsageState(): { entitlements: ResolvedEntitlements; usage: UsageSummary } {
  return {
    entitlements: { orgId: "", planId: "free_test", limits: { ...FREE_TEST_LIMITS }, featureFlags: {} },
    usage: {
      unitsByFeature: {},
      costByFeature: {},
      totalCostUsd: 0,
      periodStart: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString(),
    },
  }
}

/** Loads entitlements + usage for the given org id, falling back to the demo org's data when Supabase isn't configured (local/demo mode). */
async function loadUsageState(orgId: string): Promise<{ entitlements: ResolvedEntitlements; usage: UsageSummary }> {
  const [entitlements, usage] = await Promise.all([getEntitlements(orgId), getUsageSummary(orgId)])
  return { entitlements, usage }
}

export async function UsageCard() {
  const orgId = await getCurrentOrgId()

  // Demo mode always has an org (the seeded demo org); a live, configured
  // deployment with no resolved org id has no org to query yet — render the
  // honest zero state rather than borrowing the demo org's usage.
  const { entitlements, usage } = orgId
    ? await loadUsageState(orgId)
    : isSupabaseConfigured()
      ? emptyUsageState()
      : await loadUsageState(DEMO_ORG.id)

  const plan = isKnownPlanId(entitlements.planId) ? PLAN_CATALOG[entitlements.planId] : PLAN_CATALOG.free_test
  const spendCap = entitlements.limits.spend_cap_usd ?? null

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CardIcon>
              <CircleDollarSign />
            </CardIcon>
            <CardTitle>Usage this month</CardTitle>
          </div>
          <Badge variant="secondary">{plan.name}</Badge>
        </div>
        <CardDescription>
          {plan.monthly_price_cents === 0
            ? "Invite-only test phase — billing isn't turned on yet."
            : `${formatMonthlyPrice(plan.monthly_price_cents)} — billing isn't turned on yet.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {FEATURE_ORDER.map((feature) => {
          const used = usage.unitsByFeature[feature] ?? 0
          const limit = entitlements.limits[feature as keyof PlanLimits] ?? null
          const { valueText, percent, nearLimit } = formatBar(used, limit, (value) => `${value}`)
          return (
            <UsageBar
              key={feature}
              label={FEATURE_LABELS[feature] ?? feature}
              percent={percent}
              valueText={valueText}
              nearLimit={nearLimit}
            />
          )
        })}

        {spendCap !== null &&
          (() => {
            const { valueText, percent, nearLimit } = formatBar(
              usage.totalCostUsd,
              spendCap,
              (value) => `$${value.toFixed(2)}`
            )
            return <UsageBar label="AI spend cap" percent={percent} valueText={valueText} nearLimit={nearLimit} />
          })()}
      </CardContent>
    </Card>
  )
}
