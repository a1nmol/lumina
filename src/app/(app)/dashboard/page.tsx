import type { Metadata } from "next"
import { CalendarCheck2, Send, Star, UserPlus } from "lucide-react"

import { DigestSeenTracker } from "@/components/dashboard/digest-seen-tracker"
import { HomeConversation, type AwayReport, type DashboardStat } from "@/components/companion/home-conversation"
import { getOverviewSparklines, getOverviewStats, type OverviewSparklines } from "@/lib/analytics"
import { DEMO_ORG } from "@/lib/demo"
import { getNeedsYouCount, getWhileYouWereAwayDigest } from "@/lib/digest"
import { getOrgSidebarContext } from "@/lib/org"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import type { AnalyticsOverviewStats } from "@/lib/types"

export const metadata: Metadata = { title: "Command Center" }

/** Casual, time-aware greeting word for the Companion Home bubble ("Evening, Anmol."). Computed server-side so it never mismatches client hydration. */
function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 5) return "Still up"
  if (hour < 12) return "Morning"
  if (hour < 18) return "Afternoon"
  return "Evening"
}

/** Rich demo stats (7-day window, with sparklines) — kept exactly as before for demo mode. */
const DEMO_STATS: DashboardStat[] = [
  {
    label: "Posts published",
    value: 18,
    delta: { direction: "up", value: "+12%" },
    icon: <Send aria-hidden="true" className="size-3.5" />,
    sparkline: [4, 5, 4, 6, 7, 6, 8],
    href: "/studio",
  },
  {
    label: "Leads captured",
    value: 42,
    delta: { direction: "up", value: "+26%" },
    icon: <UserPlus aria-hidden="true" className="size-3.5" />,
    sparkline: [3, 5, 6, 8, 7, 9, 11],
    href: "/contacts",
  },
  {
    label: "Bookings",
    value: 15,
    delta: { direction: "down", value: "-4%" },
    icon: <CalendarCheck2 aria-hidden="true" className="size-3.5" />,
    sparkline: [4, 3, 4, 3, 2, 3, 2],
    href: "/calendar",
  },
  {
    label: "Reviews",
    value: 9,
    delta: { direction: "up", value: "+50%" },
    icon: <Star aria-hidden="true" className="size-3.5" />,
    sparkline: [0, 1, 1, 2, 2, 3, 3],
    href: "/growth",
  },
]

/** Formats a percent-change delta honestly — a flat 0% still renders (muted, arrow-less "±0%") rather than vanishing, since "nothing changed" is a real data point too. */
function formatDelta(percent: number): { direction: "up" | "down" | "flat"; value: string } {
  if (percent === 0) return { direction: "flat", value: "±0%" }
  return { direction: percent > 0 ? "up" : "down", value: `${percent > 0 ? "+" : ""}${percent}%` }
}

function liveStats(overview: AnalyticsOverviewStats, sparklines: OverviewSparklines | null): DashboardStat[] {
  return [
    {
      label: "Posts published",
      value: overview.postsPublished,
      delta: formatDelta(overview.deltas.postsPublished),
      icon: <Send aria-hidden="true" className="size-3.5" />,
      sparkline: sparklines?.postsPublished,
      href: "/studio",
    },
    {
      label: "Leads captured",
      value: overview.leads,
      delta: formatDelta(overview.deltas.leads),
      icon: <UserPlus aria-hidden="true" className="size-3.5" />,
      sparkline: sparklines?.leads,
      href: "/contacts",
    },
    {
      label: "Bookings",
      value: overview.bookings,
      delta: formatDelta(overview.deltas.bookings),
      icon: <CalendarCheck2 aria-hidden="true" className="size-3.5" />,
      sparkline: sparklines?.bookings,
      href: "/calendar",
    },
    {
      label: "Reviews",
      value: overview.reviewsCount,
      delta: formatDelta(overview.deltas.reviewsCount),
      icon: <Star aria-hidden="true" className="size-3.5" />,
      sparkline: sparklines?.reviewsCount,
      href: "/growth",
    },
  ]
}

type DashboardData = {
  /** Who the greeting addresses — the user's real name when set, else the org name. */
  greetName: string
  stats: DashboardStat[]
  orgId: string | null
}

/** Loads the Companion Home greeting name + stat strip, falling back to the rich demo dataset when Supabase isn't configured or the org can't be resolved yet. */
async function loadDashboardData(): Promise<DashboardData> {
  if (!isSupabaseConfigured()) {
    return { greetName: DEMO_ORG.name, stats: DEMO_STATS, orgId: null }
  }

  const context = await getOrgSidebarContext()
  if (!context) {
    // Authenticated but no org resolved yet (should self-heal via
    // ensureOrgBootstrap in the layout on the next request) — show an
    // honest all-zero strip rather than querying analytics with no org id.
    return {
      greetName: "your business",
      orgId: null,
      stats: liveStats(
        {
          rangeDays: 7,
          postsPublished: 0,
          reach: 0,
          leads: 0,
          bookings: 0,
          reviewsCount: 0,
          deltas: { postsPublished: 0, reach: 0, leads: 0, bookings: 0, reviewsCount: 0 },
        },
        null
      ),
    }
  }

  const [overview, sparklines] = await Promise.all([
    getOverviewStats(context.orgId, 7),
    getOverviewSparklines(context.orgId, 7),
  ])
  return {
    greetName: context.userName ?? context.orgName,
    orgId: context.orgId,
    stats: liveStats(overview, sparklines),
  }
}

export default async function DashboardPage() {
  const isLive = isSupabaseConfigured()
  const [{ greetName, stats, orgId }, digest] = await Promise.all([loadDashboardData(), getWhileYouWereAwayDigest()])
  const needsYouCount = await getNeedsYouCount(orgId)

  // A live org with real activity shouldn't be told to "get started" — only
  // prompt to connect channels in demo mode or when the org's stats are
  // genuinely all zero (nothing to show yet). Mirrors the old Command
  // Center's EmptyState gate exactly.
  const showConnectPrompt = !isLive || stats.every((stat) => stat.value === 0)

  const away: AwayReport =
    digest === null
      ? { kind: "unresolved" }
      : digest.kind === "caught_up"
        ? { kind: "caught_up" }
        : { kind: "activity", counts: digest.counts }

  return (
    <>
      <HomeConversation
        greeting={getGreeting()}
        greetName={greetName}
        away={away}
        stats={stats}
        needsYouCount={needsYouCount}
        showConnectPrompt={showConnectPrompt}
      />
      {isLive && <DigestSeenTracker />}
    </>
  )
}
