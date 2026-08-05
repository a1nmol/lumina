import type { Metadata } from "next"

import { PageHeader } from "@/components/page-header"
import { isSupabaseConfigured } from "@/lib/supabase/config"

import { getBusinessBrain } from "../brain/actions"
import { computeBrainCompleteness } from "../brain-completeness"
import { BrainSummaryCard } from "./brain-summary-card"
import { FaqCard } from "./faq-card"

export const metadata: Metadata = { title: "Business profile — Settings" }

export default async function SettingsBusinessPage() {
  const brain = await getBusinessBrain()
  const completeness = computeBrainCompleteness(brain)

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader
        title="Business profile"
        description="The Business Brain that powers your content and FrontDesk — hours, services, tone, and FAQ."
      />
      <BrainSummaryCard brain={brain} completeness={completeness} />
      <FaqCard initialFaq={brain.faq} isLive={isSupabaseConfigured()} />
    </div>
  )
}
