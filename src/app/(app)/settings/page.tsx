import type { Metadata } from "next"
import { BrainCircuit } from "lucide-react"

import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"

export const metadata: Metadata = { title: "Settings & Brain" }

export default function SettingsPage() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader
        title="Settings & Brain"
        description="Business info, team, channels, and the Business Brain that powers content and FrontDesk."
      />
      <EmptyState
        icon={<BrainCircuit aria-hidden="true" className="size-6" />}
        title="Set up your Business Brain"
        description="Hours, services, prices, and tone — the info that powers your content and FrontDesk agent."
        actionLabel="Start setup"
      />
    </div>
  )
}
