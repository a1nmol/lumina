import type { Metadata } from "next"
import { headers } from "next/headers"

import { PageHeader } from "@/components/page-header"
import { listReviews } from "@/lib/analytics"
import { DEMO_ORG, DEMO_REVIEWS } from "@/lib/demo"
import { buildReviewLink } from "@/lib/growth"
import { getCurrentOrgId } from "@/lib/org"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"
import type { Review } from "@/lib/types"

import { getBusinessBrain } from "@/app/(app)/settings/brain/actions"

import { getReviewAutoReplySettings } from "./actions"
import { QrCodesCard } from "./qr-codes-card"
import { ReviewRequestDialog } from "./review-request-dialog"
import { ReviewsSection } from "./review-list"
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

// Illustrative-only placeholder used while demo mode has no real Supabase
// contacts table to count against (src/lib/demo.ts DEMO_CONTACTS isn't sized
// to match — this is just "some customers" for the demo narrative).
const DEMO_RECIPIENT_COUNT = 24

interface GrowthData {
  reviews: Review[]
  isLive: boolean
  /** This org's public slug — powers the widget embed snippet/preview and the QR codes' booking/chat links. Empty string only in the (unreachable in practice) orphaned-user case. */
  orgSlug: string
  /** Real count of this org's contacts with a phone number on file (org-scoped, RLS-enforced) — demo mode uses DEMO_RECIPIENT_COUNT instead. */
  recipientCount: number
}

/** Loads this org's reviews, slug, and SMS-reachable contact count in one pass, falling back to demo data when unconfigured. */
async function loadGrowthData(): Promise<GrowthData> {
  if (!isSupabaseConfigured()) {
    return { reviews: DEMO_REVIEWS, isLive: false, orgSlug: DEMO_ORG.slug, recipientCount: DEMO_RECIPIENT_COUNT }
  }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { reviews: [], isLive: true, orgSlug: "", recipientCount: 0 }

  const supabase = await createClient()
  const [reviews, { data: org }, { count }] = await Promise.all([
    listReviews(orgId),
    supabase.from("orgs").select("slug").eq("id", orgId).maybeSingle(),
    supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .not("phone", "is", null)
      .neq("phone", ""),
  ])

  return { reviews, isLive: true, orgSlug: org?.slug ?? "", recipientCount: count ?? 0 }
}

export default async function GrowthPage() {
  const [origin, { reviews, isLive, orgSlug, recipientCount }, businessBrain, autoReplySettings] = await Promise.all([
    resolveOrigin(),
    loadGrowthData(),
    getBusinessBrain(),
    getReviewAutoReplySettings(),
  ])

  return (
    <div className="flex flex-1 flex-col gap-8">
      <PageHeader
        title="Growth"
        description="Reviews, referrals, and the tools that bring customers back."
        actions={
          <ReviewRequestDialog businessBrain={businessBrain} recipientCount={recipientCount} isLive={isLive} />
        }
      />

      <ReviewsSection initialReviews={reviews} isLive={isLive} initialAutoReplySettings={autoReplySettings} />

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-foreground">Web chat widget</h2>
          <p className="text-sm text-muted-foreground">
            Embed the FrontDesk chat bubble on your site — AI-answered from your Business Brain.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <WidgetEmbedCard origin={origin} orgSlug={orgSlug} />
        </div>
      </section>

      <QrCodesCard
        reviewLink={buildReviewLink(businessBrain.business_name)}
        // No dedicated public booking page yet — booking happens inside the
        // chat widget (MASTER_PLAN.md §4.D), so this reuses the widget link
        // until a standalone booking URL ships.
        bookingLink={`${origin}/widget/${orgSlug}`}
        chatLink={`${origin}/widget/${orgSlug}`}
      />
    </div>
  )
}
