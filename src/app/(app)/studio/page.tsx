import type { Metadata } from "next"

import { PageHeader } from "@/components/page-header"
import { Composer } from "@/components/studio/composer"
import { DEMO_BUSINESS_BRAIN } from "@/lib/demo"

export const metadata: Metadata = { title: "Content Studio" }

export default function StudioPage() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader
        title="Content Studio"
        description="Describe what you want to post — AI drafts the caption, image, and hashtags, ready for every platform."
      />
      <Composer businessName={DEMO_BUSINESS_BRAIN.business_name ?? "Your Business"} />
    </div>
  )
}
