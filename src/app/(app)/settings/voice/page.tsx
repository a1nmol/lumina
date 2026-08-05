import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { DEMO_ORG } from "@/lib/demo"
import { getCurrentOrgId } from "@/lib/org"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import { getUsageSummary } from "@/lib/usage"

import { getVoiceSettings } from "../voice-actions"
import { VoicePhoneNumberCard } from "./voice-phone-number-card"
import { VoicePickerCard } from "./voice-picker-card"
import { VoiceScriptsCard } from "./voice-scripts-card"
import { VoiceStatusCard } from "./voice-status-card"
import { VoiceTestCallCard } from "./voice-test-call-card"
import { VoiceTransferBudgetCard } from "./voice-transfer-budget-card"

export const metadata: Metadata = { title: "AI Receptionist" }

const DEFAULT_MAX_MINUTES_MONTH = 60

/** This month's voice-minute usage, demo-safe (mirrors ./../usage-card.tsx's org-resolution fallback chain — see its header comment for why the three branches exist). */
async function resolveUsedVoiceMinutes(): Promise<number> {
  const orgId = await getCurrentOrgId()
  if (orgId) {
    const usage = await getUsageSummary(orgId)
    return usage.unitsByFeature.voice_minutes ?? 0
  }
  if (isSupabaseConfigured()) return 0
  const usage = await getUsageSummary(DEMO_ORG.id)
  return usage.unitsByFeature.voice_minutes ?? 0
}

export default async function VoiceSettingsPage() {
  const [{ settings, isLive, retellConfigured }, usedVoiceMinutes] = await Promise.all([
    getVoiceSettings(),
    resolveUsedVoiceMinutes(),
  ])

  const canTestCall = retellConfigured && Boolean(settings?.enabled)

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader
        title="AI Receptionist"
        description="Configure the phone number that answers, texts back, and books for your business — 24/7."
        actions={
          <Button variant="ghost" size="sm" render={<Link href="/settings/channels" />}>
            <ArrowLeft aria-hidden="true" data-icon="inline-start" className="size-3.5" />
            Back to Settings
          </Button>
        }
      />

      <VoiceStatusCard
        initialEnabled={settings?.enabled ?? false}
        phoneNumber={settings?.phone_number ?? null}
        retellConfigured={retellConfigured}
        isLive={isLive}
        className="max-w-2xl"
      />

      <VoicePickerCard initialVoiceId={settings?.voice_id ?? null} isLive={isLive} className="max-w-2xl" />

      <VoiceScriptsCard
        initialGreeting={settings?.greeting ?? ""}
        initialAfterHoursScript={settings?.after_hours_script ?? ""}
        isLive={isLive}
        className="max-w-2xl gap-3"
      />

      <VoiceTransferBudgetCard
        initialTransferNumber={settings?.transfer_number ?? ""}
        initialMaxMinutesMonth={settings?.max_minutes_month ?? DEFAULT_MAX_MINUTES_MONTH}
        usedMinutesThisMonth={usedVoiceMinutes}
        isLive={isLive}
        className="max-w-2xl gap-3"
      />

      <VoicePhoneNumberCard phoneNumber={settings?.phone_number ?? null} className="max-w-2xl" />

      <VoiceTestCallCard canTestCall={canTestCall} isLive={isLive} className="max-w-2xl" />
    </div>
  )
}
