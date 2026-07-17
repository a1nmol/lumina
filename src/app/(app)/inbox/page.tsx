import type { Metadata } from "next"

import { PageHeader } from "@/components/page-header"
import { InboxShell } from "@/components/inbox/inbox-shell"

import { getInboxData } from "./actions"

export const metadata: Metadata = { title: "Inbox" }

export default async function InboxPage() {
  const { conversations } = await getInboxData()

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader
        title="Inbox"
        description="Comments, DMs, chat, SMS, and email — one unified thread list."
      />
      <InboxShell initialConversations={conversations} />
    </div>
  )
}
