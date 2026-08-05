import type { Metadata } from "next"

import { PageHeader } from "@/components/page-header"
import { isSupabaseConfigured } from "@/lib/supabase/config"

import { getReviewAutoReplySettings } from "@/app/(app)/growth/actions"

import { getBusinessBrain } from "../brain/actions"
import { AiIntroCard } from "./ai-intro-card"
import { AlwaysOnCard } from "./always-on-card"
import { AutoRepliesCard } from "./auto-replies-card"
import { AutoReplySettingsCard } from "./auto-reply-settings-card"
import { FollowUpsCard } from "./follow-ups-card"
import { listStandingOrders } from "./standing-orders-actions"
import { StandingOrdersCard } from "./standing-orders-card"

export const metadata: Metadata = { title: "AI behaviour — Settings" }

export default async function SettingsAiPage() {
  const [brain, { orders: standingOrders, isLive: standingOrdersLive }, reviewAutoReplySettings] = await Promise.all([
    getBusinessBrain(),
    listStandingOrders(),
    getReviewAutoReplySettings(),
  ])

  const isLive = isSupabaseConfigured()

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader
        title="AI behaviour"
        description="How Lumina's FrontDesk AI introduces itself, replies, and follows up on its own."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <AutoRepliesCard initialEnabled={brain.frontdesk_auto_reply} isLive={isLive} />
        <AiIntroCard
          initialIntroEnabled={brain.ai_intro_enabled}
          initialIntroText={brain.ai_intro_text ?? ""}
          isLive={isLive}
        />
        <AlwaysOnCard initialAlwaysOn={brain.ai_always_on} isLive={isLive} />
        <FollowUpsCard initialEnabled={brain.follow_ups_enabled} isLive={isLive} />
      </div>

      <StandingOrdersCard initialOrders={standingOrders} isLive={standingOrdersLive} className="max-w-2xl" />
      <AutoReplySettingsCard initialSettings={reviewAutoReplySettings} className="max-w-2xl" />
    </div>
  )
}
