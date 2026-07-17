import type { Metadata } from "next"

import { PageHeader } from "@/components/page-header"
import { Composer } from "@/components/studio/composer"
import { listTemplates } from "@/lib/content"
import { DEMO_BUSINESS_BRAIN } from "@/lib/demo"
import { getCurrentOrgId } from "@/lib/org"
import { isSupabaseConfigured } from "@/lib/supabase/config"

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
  const templates = await loadInitialTemplates()

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader
        title="Content Studio"
        description="Describe what you want to post — AI drafts the caption, image, and hashtags, ready for every platform."
      />
      <Composer businessName={DEMO_BUSINESS_BRAIN.business_name ?? "Your Business"} templates={templates} />
    </div>
  )
}
