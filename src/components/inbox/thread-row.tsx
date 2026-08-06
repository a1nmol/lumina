"use client"

import { forwardRef } from "react"
import { Sparkles, Star } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ChannelGlyph } from "@/components/inbox/channel-glyphs"
import { cn } from "@/lib/utils"
import type { ConversationStatus } from "@/lib/types"

import type { ThreadListConversation } from "@/app/(app)/inbox/actions"

import { AI_STATE_META } from "./ai-state-chip"
import { getThreadSnippet, initialsFromName } from "./inbox-filters"
import { formatRelativeTime } from "./relative-time"

const STATUS_DOT_CLASSES: Record<ConversationStatus, string> = {
  open: "bg-info",
  pending: "bg-warning",
  resolved: "bg-success",
}

type ThreadRowProps = {
  conversation: ThreadListConversation
  selected: boolean
  /**
   * Roving-tabindex fallback: true when nothing is selected and this is the
   * first row in the filtered list, so the listbox stays Tab-reachable even
   * before a conversation has ever been picked.
   */
  tabbable?: boolean
  onSelect: (id: string) => void
}

/** One row in the thread list — see the Pane 1 spec in the Phase 2 design brief. */
export const ThreadRow = forwardRef<HTMLButtonElement, ThreadRowProps>(function ThreadRow(
  { conversation, selected, tabbable, onSelect },
  ref
) {
  const name = conversation.contact_name ?? "Unknown contact"
  const snippet = getThreadSnippet(conversation)
  const showAiSparkle = conversation.ai_state === "ai_answered" || conversation.ai_state === "ai_draft"

  return (
    <button
      ref={ref}
      type="button"
      role="option"
      aria-selected={selected}
      tabIndex={selected || tabbable ? 0 : -1}
      onClick={() => onSelect(conversation.id)}
      className={cn(
        "group/row relative flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2.5 text-left outline-none transition-colors",
        "hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
        selected && "bg-primary/10 hover:bg-primary/10 focus-visible:bg-primary/10"
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-1/2 left-0 h-5 w-1 -translate-y-1/2 rounded-full transition-colors",
          conversation.unread ? "bg-primary" : "bg-transparent"
        )}
      />
      <div className="relative shrink-0">
        <Avatar>
          <AvatarFallback>{initialsFromName(conversation.contact_name)}</AvatarFallback>
        </Avatar>
        <span
          aria-hidden="true"
          className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full bg-card text-muted-foreground ring-1 ring-border"
        >
          <ChannelGlyph channel={conversation.channel} className="size-3" />
        </span>
        {showAiSparkle && (
          <span
            aria-label={AI_STATE_META[conversation.ai_state].label}
            title={AI_STATE_META[conversation.ai_state].label}
            className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-card"
          >
            <Sparkles aria-hidden="true" className="size-2.5" />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1">
            <span
              className={cn(
                "truncate text-sm text-foreground",
                conversation.unread ? "font-semibold" : "font-medium"
              )}
            >
              {name}
            </span>
            {conversation.contact_is_vip && (
              <span title="VIP contact" className="inline-flex shrink-0 items-center">
                <Star aria-hidden="true" className="size-3 fill-warning text-warning" />
                <span className="sr-only">VIP</span>
              </span>
            )}
          </span>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {formatRelativeTime(conversation.last_message_at)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span className="truncate text-xs text-muted-foreground">{snippet}</span>
          <span
            aria-hidden="true"
            className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT_CLASSES[conversation.status])}
          />
        </div>
      </div>
    </button>
  )
})
