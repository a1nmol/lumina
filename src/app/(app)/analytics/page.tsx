import type { Metadata } from "next"
import { BarChart3 } from "lucide-react"

import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"

export const metadata: Metadata = { title: "Analytics" }

export default function AnalyticsPage() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader
        title="Analytics"
        description="Content performance and FrontDesk outcomes, joined into one loop."
      />
      <EmptyState
        icon={<BarChart3 aria-hidden="true" className="size-6" />}
        title="See what's working"
        description="Track which posts drive calls, leads, and bookings — and get plain-English suggestions on what to make next."
        actionLabel="View report"
      />
    </div>
  )
}
