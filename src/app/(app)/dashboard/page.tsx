import type { Metadata } from "next"
import type { ReactNode } from "react"
import { CalendarCheck2, Link2, Send, Star, UserPlus } from "lucide-react"

import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { getOverviewStats } from "@/lib/analytics"
import { DEMO_ORG } from "@/lib/demo"
import { getOrgSidebarContext } from "@/lib/org"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import type { AnalyticsOverviewStats } from "@/lib/types"

export const metadata: Metadata = { title: "Command Center" }

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 5) return "Still up"
  if (hour < 12) return "Good morning"
  if (hour < 18) return "Good afternoon"
  return "Good evening"
}

type DashboardStat = {
  label: string
  value: number
  delta?: { direction: "up" | "down"; value: string }
  icon: ReactNode
  sparkline?: number[]
}

/** Rich demo stats (7-day window, with sparklines) — kept exactly as before for demo mode. */
const DEMO_STATS: DashboardStat[] = [
  {
    label: "Posts published",
    value: 18,
    delta: { direction: "up", value: "+12%" },
    icon: <Send aria-hidden="true" className="size-3.5" />,
    sparkline: [4, 5, 4, 6, 7, 6, 8],
  },
  {
    label: "Leads captured",
    value: 42,
    delta: { direction: "up", value: "+26%" },
    icon: <UserPlus aria-hidden="true" className="size-3.5" />,
    sparkline: [3, 5, 6, 8, 7, 9, 11],
  },
  {
    label: "Bookings",
    value: 15,
    delta: { direction: "down", value: "-4%" },
    icon: <CalendarCheck2 aria-hidden="true" className="size-3.5" />,
    sparkline: [4, 3, 4, 3, 2, 3, 2],
  },
  {
    label: "Reviews",
    value: 9,
    delta: { direction: "up", value: "+50%" },
    icon: <Star aria-hidden="true" className="size-3.5" />,
    sparkline: [0, 1, 1, 2, 2, 3, 3],
  },
]

/** Formats a percent-change delta honestly — omitted entirely when flat (0%) rather than faking a direction. */
function formatDelta(percent: number): { direction: "up" | "down"; value: string } | undefined {
  if (percent === 0) return undefined
  return { direction: percent > 0 ? "up" : "down", value: `${percent > 0 ? "+" : ""}${percent}%` }
}

function liveStats(overview: AnalyticsOverviewStats): DashboardStat[] {
  return [
    {
      label: "Posts published",
      value: overview.postsPublished,
      delta: formatDelta(overview.deltas.postsPublished),
      icon: <Send aria-hidden="true" className="size-3.5" />,
    },
    {
      label: "Leads captured",
      value: overview.leads,
      delta: formatDelta(overview.deltas.leads),
      icon: <UserPlus aria-hidden="true" className="size-3.5" />,
    },
    {
      label: "Bookings",
      value: overview.bookings,
      delta: formatDelta(overview.deltas.bookings),
      icon: <CalendarCheck2 aria-hidden="true" className="size-3.5" />,
    },
    {
      label: "Reviews",
      value: overview.reviewsCount,
      delta: formatDelta(overview.deltas.reviewsCount),
      icon: <Star aria-hidden="true" className="size-3.5" />,
    },
  ]
}

type DashboardData = {
  orgName: string
  stats: DashboardStat[]
}

/** Loads the Command Center greeting name + stat strip, falling back to the rich demo dataset when Supabase isn't configured or the org can't be resolved yet. */
async function loadDashboardData(): Promise<DashboardData> {
  if (!isSupabaseConfigured()) {
    return { orgName: DEMO_ORG.name, stats: DEMO_STATS }
  }

  const context = await getOrgSidebarContext()
  if (!context) {
    // Authenticated but no org resolved yet (should self-heal via
    // ensureOrgBootstrap in the layout on the next request) — show an
    // honest all-zero strip rather than querying analytics with no org id.
    return {
      orgName: "your business",
      stats: liveStats({
        rangeDays: 7,
        postsPublished: 0,
        reach: 0,
        leads: 0,
        bookings: 0,
        reviewsCount: 0,
        deltas: { postsPublished: 0, reach: 0, leads: 0, bookings: 0, reviewsCount: 0 },
      }),
    }
  }

  const overview = await getOverviewStats(context.orgId, 7)
  return { orgName: context.orgName, stats: liveStats(overview) }
}

export default async function DashboardPage() {
  const { orgName, stats } = await loadDashboardData()

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader
        title={`${getGreeting()}, ${orgName}`}
        description="Here's how your content and front desk loop performed this week."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat, index) => (
          <StatCard key={stat.label} index={index} {...stat} />
        ))}
      </div>

      <EmptyState
        icon={<Link2 aria-hidden="true" className="size-6" />}
        title="Connect your channels"
        description="Link Google Business, Instagram, and SMS so LocalOS can post content and catch every lead automatically."
        actionLabel="Connect a channel"
        actionHref="/settings"
      />
    </div>
  )
}
