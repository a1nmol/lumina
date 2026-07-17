import type { Metadata } from "next"
import { Inbox } from "lucide-react"

import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"

export const metadata: Metadata = { title: "Inbox" }

export default function InboxPage() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader
        title="Inbox"
        description="Comments, DMs, chat, SMS, and email — one unified thread list."
      />
      <EmptyState
        icon={<Inbox aria-hidden="true" className="size-6" />}
        title="Every conversation, one inbox"
        description="Comments, DMs, texts, and emails land here with AI-drafted replies ready to send."
        actionLabel="Connect a channel"
      />
    </div>
  )
}
