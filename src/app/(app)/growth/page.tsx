import type { Metadata } from "next"
import { headers } from "next/headers"
import { TrendingUp } from "lucide-react"

import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"

import { WidgetEmbedCard } from "./widget-embed-card"

export const metadata: Metadata = { title: "Growth" }

const PLACEHOLDER_ORIGIN = "https://your-domain.com"

/** Best-effort "this deployment's own origin" for the embed snippet — derived server-side (no client effect/hydration mismatch). Falls back to a placeholder if headers are unexpectedly absent (e.g. static export). */
async function resolveOrigin(): Promise<string> {
  const headerList = await headers()
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host")
  if (!host) return PLACEHOLDER_ORIGIN
  const proto = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")
  return `${proto}://${host}`
}

export default async function GrowthPage() {
  const origin = await resolveOrigin()

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader
        title="Growth"
        description="Reviews, listings, and local marketing tools that bring customers back."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <WidgetEmbedCard origin={origin} />
      </div>
      <EmptyState
        icon={<TrendingUp aria-hidden="true" className="size-6" />}
        title="More growth tools on the way"
        description="Review generation, Google Business posting, and win-back campaigns are coming next."
        actionLabel="Explore growth tools"
      />
    </div>
  )
}
