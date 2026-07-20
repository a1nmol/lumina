import type { Metadata } from "next"

import { PageHeader } from "@/components/page-header"
import { InsightBanner } from "@/components/analytics/insight-banner"
import { AnalyticsTabs } from "@/components/analytics/analytics-tabs"
import { RangeSegmented } from "@/components/analytics/range-segmented"
import { parseRangeParam, rangeDaysFor } from "@/components/analytics/range"
import { computeInsights, getLoopPairs, getOverviewStats, getPostMetrics } from "@/lib/analytics"
import { DEMO_ORG } from "@/lib/demo"
import { getCurrentOrgId } from "@/lib/org"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import type { AnalyticsInsight, AnalyticsOverviewStats, LoopPair, PostMetrics } from "@/lib/types"

export const metadata: Metadata = { title: "Analytics" }

const EMPTY_OVERVIEW = (rangeDays: number): AnalyticsOverviewStats => ({
  rangeDays,
  postsPublished: 0,
  reach: 0,
  leads: 0,
  bookings: 0,
  reviewsCount: 0,
  deltas: { postsPublished: 0, reach: 0, leads: 0, bookings: 0, reviewsCount: 0 },
})

type AnalyticsData = {
  overview: AnalyticsOverviewStats
  loopPairs: LoopPair[]
  postMetrics: PostMetrics[]
  insights: AnalyticsInsight[]
}

/**
 * Loads everything the Analytics page needs for `rangeDays`, falling back to
 * demo data when Supabase isn't configured (src/lib/analytics.ts already
 * falls back to DEMO_* internally — this just supplies a stable org id to
 * call it with, mirroring src/app/(app)/studio/page.tsx's pattern).
 *
 * Fetches loop pairs once and threads them into getPostMetrics (loop-outcome
 * counts) and, when `rangeDays` is 30, into computeInsights (which otherwise
 * needs its own trailing-30d fetch) — avoiding duplicate getLoopPairs calls
 * for the same window.
 */
async function loadAnalyticsData(rangeDays: number): Promise<AnalyticsData> {
  if (!isSupabaseConfigured()) {
    const loopPairs = await getLoopPairs(DEMO_ORG.id, rangeDays)
    const [overview, postMetrics, insights] = await Promise.all([
      getOverviewStats(DEMO_ORG.id, rangeDays),
      getPostMetrics(DEMO_ORG.id, rangeDays, loopPairs),
      computeInsights(DEMO_ORG.id, rangeDays === 30 ? loopPairs : undefined),
    ])
    return { overview, loopPairs, postMetrics, insights }
  }

  const orgId = await getCurrentOrgId()
  if (!orgId) {
    return { overview: EMPTY_OVERVIEW(rangeDays), loopPairs: [], postMetrics: [], insights: [] }
  }

  const loopPairs = await getLoopPairs(orgId, rangeDays)
  const [overview, postMetrics, insights] = await Promise.all([
    getOverviewStats(orgId, rangeDays),
    getPostMetrics(orgId, rangeDays, loopPairs),
    computeInsights(orgId, rangeDays === 30 ? loopPairs : undefined),
  ])
  return { overview, loopPairs, postMetrics, insights }
}

type AnalyticsPageProps = {
  searchParams: Promise<{ range?: string | string[] }>
}

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const params = await searchParams
  const range = parseRangeParam(params.range)
  const rangeDays = rangeDaysFor(range)

  const { overview, loopPairs, postMetrics, insights } = await loadAnalyticsData(rangeDays)

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader
        title="Analytics"
        description="Content performance and FrontDesk outcomes, joined into one loop."
        actions={<RangeSegmented />}
      />
      <InsightBanner insights={insights} />
      <AnalyticsTabs
        overview={overview}
        postMetrics={postMetrics}
        loopPairs={loopPairs}
        rangeDays={rangeDays}
      />
    </div>
  )
}
