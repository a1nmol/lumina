import type { Metadata } from "next"
import { headers } from "next/headers"

import { PageHeader } from "@/components/page-header"
import { DEMO_ORG } from "@/lib/demo"
import { getOrgSidebarContext } from "@/lib/org"
import { isSupabaseConfigured } from "@/lib/supabase/config"

import { getVoiceSettings } from "../voice-actions"
import { ChannelsCard } from "./channels-card"
import { VoiceEntryCard } from "./voice-entry-card"
import { WidgetEmbedCard } from "./widget-embed-card"

export const metadata: Metadata = { title: "Channels & phone — Settings" }

const PLACEHOLDER_ORIGIN = "https://your-domain.com"

/** Best-effort "this deployment's own origin" for the widget embed snippet — derived server-side (no client effect/hydration mismatch). Mirrors src/app/(app)/growth/page.tsx's former resolveOrigin (widget card relocated here in redesign R2). */
async function resolveOrigin(): Promise<string> {
  const headerList = await headers()
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host")
  if (!host) return PLACEHOLDER_ORIGIN
  const proto = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")
  return `${proto}://${host}`
}

/** This org's public slug for the widget embed snippet/preview — reuses the same cache()-wrapped lookup the app shell already makes per request (src/lib/org.ts#getOrgSidebarContext), so this costs no extra round trip. Demo mode uses the seeded showcase org's slug. */
async function resolveOrgSlug(): Promise<string> {
  if (!isSupabaseConfigured()) return DEMO_ORG.slug
  const context = await getOrgSidebarContext()
  return context?.orgSlug ?? ""
}

type SettingsChannelsPageProps = {
  searchParams: Promise<{
    connected?: string | string[]
    metaError?: string | string[]
    igError?: string | string[]
  }>
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function SettingsChannelsPage({ searchParams }: SettingsChannelsPageProps) {
  const params = await searchParams
  const [origin, orgSlug, { settings: voiceSettings, retellConfigured }] = await Promise.all([
    resolveOrigin(),
    resolveOrgSlug(),
    getVoiceSettings(),
  ])

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader
        title="Channels & phone"
        description="Where customers reach you — social connections, the AI Receptionist phone line, and your web chat widget."
      />
      <ChannelsCard
        connectedParam={firstParam(params.connected)}
        errorParam={firstParam(params.metaError)}
        igErrorParam={firstParam(params.igError)}
      />
      <VoiceEntryCard settings={voiceSettings} retellConfigured={retellConfigured} />
      <WidgetEmbedCard origin={origin} orgSlug={orgSlug} />
    </div>
  )
}
