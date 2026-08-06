import type { Metadata } from "next"

import { InboxShell } from "@/components/inbox/inbox-shell"

import { getInboxData } from "./actions"

export const metadata: Metadata = { title: "Inbox" }

type InboxPageProps = {
  searchParams: Promise<{ conversation?: string | string[]; focus?: string | string[]; contact?: string | string[] }>
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

// No PageHeader here on purpose (Redesign wave R3 — Inbox as canvas): the
// RoomHeader already reads "Inbox", and a title+description
// row above the densest, most-used surface in the app was pure overhead
// eating vertical space. The shell below fills the rest of the viewport
// directly via flex-1 min-h-0 (see src/app/(app)/layout.tsx for the
// h-svh + overflow-y-auto ancestor that makes that sizing real, instead of
// the old hard-coded `h-[calc(100svh-13rem)]` magic-number height).
//
// Deep links (Redesign wave R4 — the discoverability layer): `?conversation=`
// preselects a thread (validated against the loaded list here, server-side —
// a stale/foreign id is ignored silently rather than erroring), `?focus=search`
// focuses the thread-search input on mount, and `?contact=` (see the
// Contacts "Message" action) is resolved client-side in InboxShell to that
// contact's most recent conversation.
export default async function InboxPage({ searchParams }: InboxPageProps) {
  const params = await searchParams
  const { conversations } = await getInboxData()

  const requestedConversationId = firstParam(params.conversation)
  const initialSelectedId =
    requestedConversationId && conversations.some((conversation) => conversation.id === requestedConversationId)
      ? requestedConversationId
      : undefined

  // Never combined with a deep-link selection (review): if both were ever on
  // one URL, stealing focus into search from a just-opened thread would jar —
  // selection wins, focus request is dropped.
  const focusSearchOnMount =
    firstParam(params.focus) === "search" && !initialSelectedId && !firstParam(params.contact)
  const initialContactId = firstParam(params.contact)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <InboxShell
        initialConversations={conversations}
        initialSelectedId={initialSelectedId}
        initialContactId={initialContactId}
        focusSearchOnMount={focusSearchOnMount}
      />
    </div>
  )
}
