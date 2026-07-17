import type { Metadata } from "next"
import { TrendingUp } from "lucide-react"

import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"

export const metadata: Metadata = { title: "Growth" }

export default function GrowthPage() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader
        title="Growth"
        description="Reviews, listings, and local marketing tools that bring customers back."
      />
      <EmptyState
        icon={<TrendingUp aria-hidden="true" className="size-6" />}
        title="Grow with local tools"
        description="Generate reviews, post to Google Business, and re-engage past customers automatically."
        actionLabel="Explore growth tools"
      />
    </div>
  )
}
