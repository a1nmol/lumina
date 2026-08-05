import type { Metadata } from "next"

import { InboxShell } from "@/components/inbox/inbox-shell"

import { getInboxData } from "./actions"

export const metadata: Metadata = { title: "Inbox" }

// No PageHeader here on purpose (Redesign wave R3 — Inbox as canvas): the
// breadcrumb in the app header already reads "Inbox", and a title+description
// row above the densest, most-used surface in the app was pure overhead
// eating vertical space. The shell below fills the rest of the viewport
// directly via flex-1 min-h-0 (see src/app/(app)/layout.tsx for the
// h-svh + overflow-y-auto ancestor that makes that sizing real, instead of
// the old hard-coded `h-[calc(100svh-13rem)]` magic-number height).
export default async function InboxPage() {
  const { conversations } = await getInboxData()

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <InboxShell initialConversations={conversations} />
    </div>
  )
}
