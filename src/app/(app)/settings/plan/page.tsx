import type { Metadata } from "next"

import { PageHeader } from "@/components/page-header"

import { UsageCard } from "./usage-card"

export const metadata: Metadata = { title: "Plan & usage — Settings" }

export default function SettingsPlanPage() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader title="Plan & usage" description="Your current plan and this month's usage against it." />
      <UsageCard />
    </div>
  )
}
