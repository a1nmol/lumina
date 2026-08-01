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
import { isSupabaseConfigured } from "@/lib/supabase/config"
import { cn } from "@/lib/utils"
import type { ConversationAiMode, ConversationStatus, ContactStatus, Message } from "@/lib/types"

import { toggleContactVip } from "@/app/(app)/contacts/actions"
import {
  addContactTag,
  getConversationDetail,
  markRead,
  setContactPipelineStatus,
  setConversationAiMode,
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

// Debounce before firing the conversation-detail fetch after `selectedId`
// changes — absorbs rapid re-selection (arrow-key nav, fast re-clicks)
// without firing a redundant fetch per keystroke. Row highlight and the
// optimistic unread-clear in handleSelect update synchronously and are
// unaffected by this delay.
const DETAIL_FETCH_DEBOUNCE_MS = 180

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
    const timeoutId = window.setTimeout(() => {
      // Arms the loading state for the fetch kicked off immediately below
      // (an external system — the server action). Nested inside the
      // setTimeout (rather than a direct effect-body call), so the
      // react-hooks/set-state-in-effect rule doesn't flag it here — compare
      // the direct-call case in src/components/calendar/reminder-button.tsx.
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
    }, DETAIL_FETCH_DEBOUNCE_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [selectedId])

  const handleSelect = useCallback(
    (id: string) => {
      setSelectedId(id)

      const target = conversations.find((c) => c.id === id)
      const wasUnread = target?.unread ?? false
      setConversations((current) => current.map((c) => (c.id === id ? { ...c, unread: false } : c)))

      if (!wasUnread) return

      // Fire-and-forget, revert-on-error — mirrors handleStatusChange /
      // handleContactStatusChange's optimistic-update pattern above, just
      // without awaiting the result before returning.
      void markRead(id).then((result) => {
        if (!result.ok) {
          setConversations((current) => current.map((c) => (c.id === id ? { ...c, unread: true } : c)))
          toast.error("Couldn't mark conversation read", { description: "Please try again." })
        }
      })
    },
    [conversations]
  )

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

  /**
   * Sets the selected conversation's per-thread AI autonomy (Auto/Off).
   * Optimistic like handleStatusChange above. Demo mode is a local-only
   * no-op with the standard "changes aren't saved" toast (matching
   * src/app/(app)/settings/faq-card.tsx) instead of round-tripping to the
   * server action, which would otherwise silently no-op with no feedback.
   */
  async function handleAiModeChange(mode: ConversationAiMode) {
    if (!selectedDetail) return
    const conversationId = selectedDetail.id
    const previousMode = selectedDetail.ai_mode
    if (mode === previousMode) return

    setSelectedDetail((prev) => (prev ? { ...prev, ai_mode: mode } : prev))
    setConversations((current) => current.map((c) => (c.id === conversationId ? { ...c, ai_mode: mode } : c)))

    if (!isSupabaseConfigured()) {
      toast.success(mode === "auto" ? "AI replies set to Auto" : "AI replies set to Off", {
        description: "Demo mode — changes aren't saved.",
      })
      return
    }

    const result = await setConversationAiMode(conversationId, mode)
    if (!result.ok) {
      setSelectedDetail((prev) => (prev && prev.id === conversationId ? { ...prev, ai_mode: previousMode } : prev))
      setConversations((current) =>
        current.map((c) => (c.id === conversationId ? { ...c, ai_mode: previousMode } : c))
      )
      toast.error("Couldn't update AI replies", { description: "Please try again." })
    }
  }

  // Keyed off message.conversation_id (not selectedDetail.id) — defense in
  // depth against the cross-conversation composer race: a reply sent from a
  // thread the user has since navigated away from must still land on ITS
  // thread-list row, and must never be applied to whatever conversation
  // happens to be selected now. selectedDetail is only ever touched when its
  // id matches the message's conversation.
  function handleMessageSent(message: Message) {
    const conversationId = message.conversation_id

    setSelectedDetail((prev) =>
      prev && prev.id === conversationId ? { ...prev, messages: [...prev.messages, message] } : prev
    )

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
      setSelectedDetail((prev) => (prev && prev.id === conversationId ? { ...prev, ai_state: "ai_answered" } : prev))
      setConversations((current) =>
        current.map((c) => (c.id === conversationId ? { ...c, ai_state: "ai_answered" } : c))
      )
      void setState(conversationId, "ai_answered")
    }
  }

  // Threaded conversationId (rather than assuming selectedDetail) for the
  // same reason as handleMessageSent above — an AI draft request kicked off
  // from a thread the user has since navigated away from must escalate ITS
  // thread, not whatever is currently selected.
  function handleEscalated(conversationId: string, reason: string) {
    void reason // surfaced to the user directly by the composer's toast; only the ai_state flip happens here.
    setSelectedDetail((prev) => (prev && prev.id === conversationId ? { ...prev, ai_state: "escalated" } : prev))
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

  async function handleToggleVip() {
    if (!selectedDetail?.contact) return
    const contactId = selectedDetail.contact.id
    const previousIsVip = selectedDetail.contact.is_vip
    const nextIsVip = !previousIsVip

    setSelectedDetail((prev) => (prev && prev.contact ? { ...prev, contact: { ...prev.contact, is_vip: nextIsVip } } : prev))
    // The thread list renders its own star off conversation.contact_is_vip —
    // mirror the toggle there too (every conversation with this contact), or
    // the left-pane badge goes stale until a reload.
    setConversations((current) =>
      current.map((c) => (c.contact_id === contactId ? { ...c, contact_is_vip: nextIsVip } : c))
    )

    const result = await toggleContactVip(contactId, nextIsVip)
    if (!result.ok) {
      setSelectedDetail((prev) =>
        prev && prev.contact ? { ...prev, contact: { ...prev.contact, is_vip: previousIsVip } } : prev
      )
      setConversations((current) =>
        current.map((c) => (c.contact_id === contactId ? { ...c, contact_is_vip: previousIsVip } : c))
      )
      toast.error("Couldn't update VIP status", { description: "Please try again." })
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
        withWick
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
      onToggleVip={handleToggleVip}
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
          onAiModeChange={handleAiModeChange}
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
