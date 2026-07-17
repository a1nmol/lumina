import "server-only"

// Shared "which business is this widget for" resolver — used by the widget
// page (src/app/widget/[org]/page.tsx) AND the two public FrontDesk API
// routes (src/app/api/frontdesk/chat, .../missed-call) so the slug format,
// demo-org special-case, and org/business_brain lookup only live in one
// place. Deliberately NOT under src/lib/** (kept colocated with this
// feature) and NOT reusing src/lib/frontdesk.ts's helpers, which use the
// RLS-scoped, cookie-authenticated server client — these callers are public,
// unauthenticated endpoints with no session, so they need the service-role
// admin client to bypass RLS entirely (see the longer comment in the chat
// route for why that's safe here).

import { DEMO_BUSINESS_BRAIN, DEMO_ORG } from "@/lib/demo"
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin"
import type { BusinessBrain } from "@/lib/types"

/** Lowercase, hyphen-separated, 1-64 chars — matches the slug shape produced by src/lib/org.ts#slugify. */
export const ORG_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/

export interface ResolvedWidgetOrg {
  orgId: string
  slug: string
  businessName: string
  brain: BusinessBrain | null
  /** True for the built-in "sunrise-bakery" showcase org — no real row backs it, callers must not attempt writes. */
  isDemo: boolean
}

/**
 * Resolves an org slug to the widget's business identity + Business Brain.
 * Returns null when the slug is malformed, Supabase isn't configured (and
 * it isn't the demo slug), or no matching org exists — callers should treat
 * that as "this chat isn't available" rather than a 500.
 */
export async function resolveWidgetOrg(orgSlug: string): Promise<ResolvedWidgetOrg | null> {
  if (orgSlug === DEMO_ORG.slug) {
    return {
      orgId: DEMO_ORG.id,
      slug: DEMO_ORG.slug,
      businessName: DEMO_BUSINESS_BRAIN.business_name ?? DEMO_ORG.name,
      brain: DEMO_BUSINESS_BRAIN,
      isDemo: true,
    }
  }

  if (!ORG_SLUG_RE.test(orgSlug) || !isSupabaseConfigured()) return null

  const supabase = createAdminClient()
  const { data: org, error: orgError } = await supabase
    .from("orgs")
    .select("id, name, slug")
    .eq("slug", orgSlug)
    .maybeSingle()

  if (orgError || !org) return null

  const { data: brain } = await supabase.from("business_brain").select().eq("org_id", org.id).maybeSingle()

  return {
    orgId: org.id,
    slug: org.slug,
    businessName: (brain?.business_name || org.name) ?? org.name,
    brain: brain ?? null,
    isDemo: false,
  }
}
