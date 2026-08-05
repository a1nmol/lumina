import type { Metadata } from "next"

import { PageHeader } from "@/components/page-header"
import { Composer } from "@/components/studio/composer"
import { listTemplates } from "@/lib/content"
import { getCurrentOrgId } from "@/lib/org"
import { isSupabaseConfigured } from "@/lib/supabase/config"

import { getBusinessBrain } from "@/app/(app)/settings/brain/actions"

import { isAiAssistAvailable } from "./actions"
import { DEMO_TEMPLATES, mapTemplate } from "./demo-templates"
import type { StudioTemplate } from "./types"

export const metadata: Metadata = { title: "Content Studio" }

/** Loads this org's saved templates, falling back to demo data when Supabase isn't configured. */
async function loadInitialTemplates(): Promise<StudioTemplate[]> {
  if (!isSupabaseConfigured()) return DEMO_TEMPLATES

  const orgId = await getCurrentOrgId()
  if (!orgId) return []

  const templates = await listTemplates(orgId)
  return templates.map(mapTemplate)
}

export default async function StudioPage() {
  // getBusinessBrain() already falls back to DEMO_BUSINESS_BRAIN (Sunrise
  // Bakery) whenever Supabase isn't configured or there's no resolvable org
  // — see src/app/(app)/settings/brain/actions.ts — so demo mode keeps its
  // existing preview exactly, while real orgs get their own saved name (or
  // a neutral placeholder before Brain setup) instead of the demo bakery's.
  const [templates, businessBrain, aiAssistAvailable] = await Promise.all([
    loadInitialTemplates(),
    getBusinessBrain(),
    isAiAssistAvailable(),
  ])

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader
        title="Content Studio"
        description="Describe what you want to post — AI drafts the caption, image, and hashtags, ready for every platform."
      />
      <Composer
        businessName={businessBrain.business_name ?? "Your Business"}
        templates={templates}
        aiAssistAvailable={aiAssistAvailable}
      />
    </div>
  )
}
