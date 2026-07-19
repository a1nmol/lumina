import { FileText, MessageSquareHeart, Radio, Star, UserPlus } from "lucide-react"

import { StatCard } from "@/components/stat-card"
import { EmptyState } from "@/components/empty-state"
import type { AnalyticsOverviewStats, LoopPair, PostMetrics } from "@/lib/types"

import { deriveDailySeries } from "./derive-daily-series"
import { LeadsBookingsChart } from "./leads-bookings-chart"
import { PostMetricCard } from "./post-metric-card"

function deltaFor(value: number): { direction: "up" | "down"; value: string } {
  return { direction: value >= 0 ? "up" : "down", value: `${value >= 0 ? "+" : ""}${value}%` }
}

type OverviewTabProps = {
  overview: AnalyticsOverviewStats
  postMetrics: PostMetrics[]
  loopPairs: LoopPair[]
  rangeDays: number
}

export function OverviewTab({ overview, postMetrics, loopPairs, rangeDays }: OverviewTabProps) {
  const dailySeries = deriveDailySeries(loopPairs, rangeDays)

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          index={0}
          label="Posts"
          value={overview.postsPublished}
          delta={deltaFor(overview.deltas.postsPublished)}
          icon={<FileText aria-hidden="true" className="size-3.5" />}
        />
        <StatCard
          index={1}
          label="Reach"
          value={overview.reach.toLocaleString()}
          delta={deltaFor(overview.deltas.reach)}
          icon={<Radio aria-hidden="true" className="size-3.5" />}
        />
        <StatCard
          index={2}
          label="Leads"
          value={overview.leads}
          delta={deltaFor(overview.deltas.leads)}
          icon={<UserPlus aria-hidden="true" className="size-3.5" />}
        />
        <StatCard
          index={3}
          label="Bookings"
          value={overview.bookings}
          delta={deltaFor(overview.deltas.bookings)}
          icon={<MessageSquareHeart aria-hidden="true" className="size-3.5" />}
        />
        <StatCard
          index={4}
          label="Reviews"
          value={overview.reviewsCount}
          delta={deltaFor(overview.deltas.reviewsCount)}
          icon={<Star aria-hidden="true" className="size-3.5" />}
        />
      </div>

      <LeadsBookingsChart data={dailySeries} />

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-foreground">Post performance</h2>
        {postMetrics.length === 0 ? (
          <EmptyState
            icon={<FileText aria-hidden="true" className="size-6" />}
            title="No posts in this range"
            description="Publish a post from Content Studio and its performance will show up here."
            actionLabel="Go to Content Studio"
            actionHref="/studio"
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {postMetrics.map((metrics) => (
              <PostMetricCard key={metrics.contentId} metrics={metrics} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
