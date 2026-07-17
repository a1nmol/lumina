import type { Metadata } from "next"
import { Sparkles } from "lucide-react"

import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"

export const metadata: Metadata = { title: "Content Studio" }

export default function StudioPage() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader
        title="Content Studio"
        description="Draft posts, generate images, and build your queue with AI."
      />
      <EmptyState
        icon={<Sparkles aria-hidden="true" className="size-6" />}
        title="Create your first post"
        description="Describe what you want to post and AI drafts the caption, image, and hashtags — ready for every platform."
        actionLabel="New post"
      />
    </div>
  )
}
