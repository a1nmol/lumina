import type { Metadata } from "next"
import { CalendarCheck2, Link2, Send, Star, UserPlus } from "lucide-react"

import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { DEMO_ORG } from "@/lib/demo"

export const metadata: Metadata = { title: "Command Center" }

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 5) return "Still up"
  if (hour < 12) return "Good morning"
  if (hour < 18) return "Good afternoon"
  return "Good evening"
}

const STATS = [
  {
    label: "Posts published",
    value: 18,
    delta: { direction: "up" as const, value: "+12%" },
    icon: <Send aria-hidden="true" className="size-3.5" />,
    sparkline: [4, 5, 4, 6, 7, 6, 8],
  },
  {
    label: "Leads captured",
    value: 42,
    delta: { direction: "up" as const, value: "+26%" },
    icon: <UserPlus aria-hidden="true" className="size-3.5" />,
    sparkline: [3, 5, 6, 8, 7, 9, 11],
  },
  {
    label: "Bookings",
    value: 15,
    delta: { direction: "down" as const, value: "-4%" },
    icon: <CalendarCheck2 aria-hidden="true" className="size-3.5" />,
    sparkline: [4, 3, 4, 3, 2, 3, 2],
  },
  {
    label: "Reviews",
    value: 9,
    delta: { direction: "up" as const, value: "+50%" },
    icon: <Star aria-hidden="true" className="size-3.5" />,
    sparkline: [0, 1, 1, 2, 2, 3, 3],
  },
]

export default function DashboardPage() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader
        title={`${getGreeting()}, ${DEMO_ORG.name}`}
        description="Here's how your content and front desk loop performed this week."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {STATS.map((stat, index) => (
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
