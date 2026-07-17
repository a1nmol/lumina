"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Inbox as InboxIcon } from "lucide-react"
import { toast } from "sonner"

import { EmptyState } from "@/components/empty-state"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import type { ConversationStatus, ContactStatus, Message } from "@/lib/types"

import {
  addContactTag,
  getConversationDetail,
  setContactPipelineStatus,
  setState,
  setStatus,
  type InboxConversationDetail,
  type ThreadListConversation,
} from "@/app/(app)/inbox/actions"

import { ContextPane } from "./context-pane"
import { ConversationPane } from "./conversation-pane"
import type { ChannelFilterValue, ThreadFilter } from "./inbox-filters"
import type { ReplyComposerHandle } from "./reply-composer"
import { ThreadList } from "./thread-list"

type InboxShellProps = {
  initialConversations: ThreadListConversation[]
}

export function InboxShell({ initialConversations }: InboxShellProps) {
  const composerRef = useRef<ReplyComposerHandle>(null)

  const [conversations, setConversations] = useState<ThreadListConversation[]>(initialConversations)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedDetail, setSelectedDetail] = useState<InboxConversationDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [filter, setFilter] = useState<ThreadFilter>("all")
  const [channelFilter, setChannelFilter] = useState<ChannelFilterValue>("all")
  const [contextSheetOpen, setContextSheetOpen] = useState(false)

  useEffect(() => {
    if (!selectedId) return

    let cancelled = false
    // Deliberate setState-in-effect: arms the loading state for the fetch
    // kicked off immediately below (an external system — the server action)
    // — see the identical, reviewed pattern in
    // src/components/calendar/reminder-button.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDetailLoading(true)
    getConversationDetail(selectedId)
      .then((detail) => {
        if (cancelled) return
        setSelectedDetail(detail)
        if (!detail) {
          toast.error("Couldn't load that conversation")
        }
      })
      .catch(() => {
        if (!cancelled) toast.error("Couldn't load that conversation")
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectedId])

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id)
    setConversations((current) => current.map((c) => (c.id === id ? { ...c, unread: false } : c)))
  }, [])

  function handleBack() {
    setSelectedId(null)
    setSelectedDetail(null)
  }

  async function handleStatusChange(status: ConversationStatus) {
    if (!selectedDetail) return
    const conversationId = selectedDetail.id
    const previousStatus = selectedDetail.status

    setSelectedDetail((prev) => (prev ? { ...prev, status } : prev))
    setConversations((current) => current.map((c) => (c.id === conversationId ? { ...c, status } : c)))

    const result = await setStatus(conversationId, status)
    if (!result.ok) {
      setSelectedDetail((prev) => (prev ? { ...prev, status: previousStatus } : prev))
      setConversations((current) =>
        current.map((c) => (c.id === conversationId ? { ...c, status: previousStatus } : c))
      )
      toast.error("Couldn't update status", { description: "Please try again." })
    }
  }

  function handleMessageSent(message: Message) {
    if (!selectedDetail) return
    const conversationId = selectedDetail.id

    setSelectedDetail((prev) => (prev ? { ...prev, messages: [...prev.messages, message] } : prev))

    const isRealMessage = message.kind !== "note"
    setConversations((current) =>
      current.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              messages: [...(c.messages ?? []), message],
              last_message_at: message.created_at,
              ...(isRealMessage ? { status: "open" as ConversationStatus, unread: false } : {}),
            }
          : c
      )
    )

    // A verbatim (or lightly edited) AI draft that just got sent counts as the AI having answered the thread.
    if (isRealMessage && message.ai_handled) {
      setSelectedDetail((prev) => (prev ? { ...prev, ai_state: "ai_answered" } : prev))
      setConversations((current) =>
        current.map((c) => (c.id === conversationId ? { ...c, ai_state: "ai_answered" } : c))
      )
      void setState(conversationId, "ai_answered")
    }
  }

  function handleEscalated() {
    if (!selectedDetail) return
    const conversationId = selectedDetail.id
    setSelectedDetail((prev) => (prev ? { ...prev, ai_state: "escalated" } : prev))
    setConversations((current) =>
      current.map((c) => (c.id === conversationId ? { ...c, ai_state: "escalated" } : c))
    )
  }

  async function handleContactStatusChange(status: ContactStatus) {
    if (!selectedDetail?.contact) return
    const contactId = selectedDetail.contact.id
    const previousStatus = selectedDetail.contact.status

    setSelectedDetail((prev) => (prev && prev.contact ? { ...prev, contact: { ...prev.contact, status } } : prev))

    const result = await setContactPipelineStatus(contactId, status)
    if (!result.ok) {
      setSelectedDetail((prev) =>
        prev && prev.contact ? { ...prev, contact: { ...prev.contact, status: previousStatus } } : prev
      )
      toast.error("Couldn't update pipeline status", { description: "Please try again." })
    }
  }

  async function handleAddTag(tag: string) {
    if (!selectedDetail?.contact) return
    const contactId = selectedDetail.contact.id
    const currentTags = selectedDetail.contact.tags
    const nextTags = Array.from(new Set([...currentTags, tag]))

    setSelectedDetail((prev) =>
      prev && prev.contact ? { ...prev, contact: { ...prev.contact, tags: nextTags } } : prev
    )

    const result = await addContactTag(contactId, currentTags, tag)
    if (!result.ok) {
      setSelectedDetail((prev) =>
        prev && prev.contact ? { ...prev, contact: { ...prev.contact, tags: currentTags } } : prev
      )
      toast.error("Couldn't add tag", { description: "Please try again." })
    }
  }

  function handleAddNote() {
    composerRef.current?.focusNote()
    setContextSheetOpen(false)
  }

  if (conversations.length === 0) {
    return (
      <EmptyState
        icon={<InboxIcon aria-hidden="true" className="size-6" />}
        title="Every conversation, one inbox"
        description="Comments, DMs, texts, and emails land here with AI-drafted replies ready to send."
        actionLabel="Connect a channel"
      />
    )
  }

  const contextPaneNode = (
    <ContextPane
      contact={selectedDetail?.contact ?? null}
      currentConversationId={selectedDetail?.id ?? ""}
      conversations={conversations}
      onSelectConversation={(id) => {
        handleSelect(id)
        setContextSheetOpen(false)
      }}
      onStatusChange={handleContactStatusChange}
      onAddTag={handleAddTag}
      onAddNote={handleAddNote}
    />
  )

  return (
    <div className="flex h-[calc(100svh-13rem)] min-h-[26rem] flex-1 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
      <div
        className={cn(
          "w-full flex-col md:w-[340px] md:shrink-0 md:border-r md:border-border",
          selectedId ? "hidden md:flex" : "flex"
        )}
      >
        <ThreadList
          conversations={conversations}
          selectedId={selectedId}
          filter={filter}
          channelFilter={channelFilter}
          onFilterChange={setFilter}
          onChannelFilterChange={setChannelFilter}
          onSelect={handleSelect}
          className="h-full"
        />
      </div>

      <div
        className={cn(
          "min-w-0 flex-1 flex-col xl:border-r xl:border-border",
          selectedId ? "flex" : "hidden md:flex"
        )}
      >
        <ConversationPane
          detail={selectedDetail}
          loading={detailLoading}
          onBack={handleBack}
          onStatusChange={handleStatusChange}
          onMessageSent={handleMessageSent}
          onEscalated={handleEscalated}
          onOpenContext={() => setContextSheetOpen(true)}
          composerRef={composerRef}
          className="h-full"
        />
      </div>

      <div className="hidden xl:flex xl:w-[300px] xl:shrink-0 xl:flex-col">{contextPaneNode}</div>

      <Sheet open={contextSheetOpen} onOpenChange={setContextSheetOpen}>
        <SheetContent side="right" className="xl:hidden">
          <SheetHeader>
            <SheetTitle>Contact details</SheetTitle>
          </SheetHeader>
          {contextPaneNode}
        </SheetContent>
      </Sheet>
    </div>
  )
}
