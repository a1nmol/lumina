import type { Metadata } from "next"

import { PageHeader } from "@/components/page-header"
import { isSupabaseConfigured } from "@/lib/supabase/config"

import { getBusinessBrain } from "./brain/actions"
import { computeBrainCompleteness } from "./brain-completeness"
import { BrainSummaryCard } from "./brain-summary-card"
import { ChannelsCard } from "./channels-card"
import { FaqCard } from "./faq-card"
import { FrontdeskAutoReplyCard } from "./frontdesk-auto-reply-card"
import { listStandingOrders } from "./standing-orders-actions"
import { StandingOrdersCard } from "./standing-orders-card"
import { UsageCard } from "./usage-card"
import { getVoiceSettings } from "./voice-actions"
import { VoiceEntryCard } from "./voice-entry-card"

export const metadata: Metadata = { title: "Settings & Brain" }

type SettingsPageProps = {
  searchParams: Promise<{
    connected?: string | string[]
    metaError?: string | string[]
    igError?: string | string[]
  }>
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const params = await searchParams
  const brain = await getBusinessBrain()
  const completeness = computeBrainCompleteness(brain)
  const { orders: standingOrders, isLive: standingOrdersLive } = await listStandingOrders()
  const { settings: voiceSettings, retellConfigured } = await getVoiceSettings()

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader
        title="Settings & Brain"
        description="Business info, team, channels, and the Business Brain that powers content and FrontDesk."
      />
      <BrainSummaryCard brain={brain} completeness={completeness} />
      <FaqCard initialFaq={brain.faq} isLive={isSupabaseConfigured()} />
      <FrontdeskAutoReplyCard
        initialEnabled={brain.frontdesk_auto_reply}
        initialIntroEnabled={brain.ai_intro_enabled}
        initialIntroText={brain.ai_intro_text ?? ""}
        initialAlwaysOn={brain.ai_always_on}
        isLive={isSupabaseConfigured()}
      />
      <StandingOrdersCard initialOrders={standingOrders} isLive={standingOrdersLive} />
      <VoiceEntryCard settings={voiceSettings} retellConfigured={retellConfigured} />
      <ChannelsCard
        connectedParam={firstParam(params.connected)}
        errorParam={firstParam(params.metaError)}
        igErrorParam={firstParam(params.igError)}
      />
      <UsageCard />
    </div>
  )
}
