import type { Metadata } from "next"

import { PageHeader } from "@/components/page-header"

import { getBusinessBrain } from "./brain/actions"
import { computeBrainCompleteness } from "./brain-completeness"
import { BrainSummaryCard } from "./brain-summary-card"

export const metadata: Metadata = { title: "Settings & Brain" }

export default async function SettingsPage() {
  const brain = await getBusinessBrain()
  const completeness = computeBrainCompleteness(brain)

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader
        title="Settings & Brain"
        description="Business info, team, channels, and the Business Brain that powers content and FrontDesk."
      />
      <BrainSummaryCard brain={brain} completeness={completeness} />
    </div>
  )
}
