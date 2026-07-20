// Quiet "current plan + usage" card for the Settings hub. Server component —
// reads the same getUsageSummary()/getEntitlements() seam checkAllowance()
// uses internally (src/lib/usage.ts), demo-safe (all-zero usage when
// Supabase isn't configured). No upgrade CTA: billing isn't turned on yet
// during the invite-only test phase (MASTER_PLAN.md §4.G).

import { CircleDollarSign } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DEMO_ORG } from "@/lib/demo"
import { getEntitlements } from "@/lib/entitlements"
import { getCurrentOrgId } from "@/lib/org"
import { formatMonthlyPrice, PLAN_CATALOG, type PlanId } from "@/lib/plans"
import type { PlanLimits, UsageFeature } from "@/lib/types"
import { getUsageSummary } from "@/lib/usage"

import { UsageBar } from "./usage-bar"

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

export async function UsageCard() {
  const orgId = await getCurrentOrgId()
  const resolvedOrgId = orgId ?? DEMO_ORG.id

  const [entitlements, usage] = await Promise.all([
    getEntitlements(resolvedOrgId),
    getUsageSummary(resolvedOrgId),
  ])

  const plan = isKnownPlanId(entitlements.planId) ? PLAN_CATALOG[entitlements.planId] : PLAN_CATALOG.free_test
  const spendCap = entitlements.limits.spend_cap_usd ?? null

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
            >
              <CircleDollarSign className="size-4" />
            </span>
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
