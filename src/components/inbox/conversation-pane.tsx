"use client"

import { useEffect, useRef, type Ref } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ArrowLeft, Info } from "lucide-react"

import { Wick } from "@/components/brand/wick"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { duration, easing } from "@/lib/motion"
import { cn } from "@/lib/utils"
import type { ConversationStatus, Message } from "@/lib/types"

import type { InboxConversationDetail } from "@/app/(app)/inbox/actions"

import { AiStateChip } from "./ai-state-chip"
import { ChannelGlyph, CHANNEL_GLYPHS } from "./channel-glyphs"
import { initialsFromName } from "./inbox-filters"
import { MessageBubble } from "./message-bubble"
import { ReplyComposer, type ReplyComposerHandle } from "./reply-composer"
import { CONVERSATION_STATUS_META } from "./status-pill"

const STATUS_OPTIONS: ConversationStatus[] = ["open", "pending", "resolved"]

type ConversationPaneProps = {
  detail: InboxConversationDetail | null
  loading: boolean
  onBack: () => void
  onStatusChange: (status: ConversationStatus) => void
  onMessageSent: (message: Message) => void
  onEscalated: (conversationId: string, reason: string) => void
  onOpenContext: () => void
  composerRef?: Ref<ReplyComposerHandle>
  className?: string
}

export function ConversationPane({
  detail,
  loading,
  onBack,
  onStatusChange,
  onMessageSent,
  onEscalated,
  onOpenContext,
  composerRef,
  className,
}: ConversationPaneProps) {
  const reduceMotion = useReducedMotion()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [detail?.messages.length, detail?.id])

  if (loading) {
    return (
      <div className={cn("flex h-full flex-col", className)}>
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-3 p-4">
          <Skeleton className="h-16 w-2/3 rounded-2xl" />
          <Skeleton className="ml-auto h-12 w-1/2 rounded-2xl" />
          <Skeleton className="h-10 w-3/5 rounded-2xl" />
        </div>
      </div>
    )
  }

  if (!detail) {
    return (
      <div className={cn("flex h-full flex-col items-center justify-center gap-3 p-8 text-center", className)}>
        <Wick state="idle" size={56} />
        <div className="flex max-w-xs flex-col gap-1">
          <h3 className="text-sm font-medium text-foreground">Select a conversation</h3>
          <p className="text-sm text-muted-foreground">
            Choose a thread from the list to read the full conversation and reply.
          </p>
        </div>
      </div>
    )
  }

  const channelMeta = CHANNEL_GLYPHS[detail.channel]

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className="flex items-center gap-3 border-b border-border px-3 py-2.5 sm:px-4">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onBack}
          className="md:hidden"
          aria-label="Back to conversations"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
        </Button>

        <Avatar size="lg" className="shrink-0">
          <AvatarFallback>{initialsFromName(detail.contact_name)}</AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{detail.contact_name ?? "Unknown contact"}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <ChannelGlyph channel={detail.channel} className="size-3" />
              {channelMeta.label}
            </span>
            <Select value={detail.status} onValueChange={(value) => onStatusChange(value as ConversationStatus)}>
              <SelectTrigger size="sm" aria-label="Conversation status" className="h-6 gap-1 border-none bg-transparent px-1.5 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start">
                {STATUS_OPTIONS.map((status) => (
                  <SelectItem key={status} value={status}>
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-1.5 rounded-full",
                        status === "open" && "bg-info",
                        status === "pending" && "bg-warning",
                        status === "resolved" && "bg-success"
                      )}
                    />
                    {CONVERSATION_STATUS_META[status].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <AiStateChip state={detail.ai_state} />
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onOpenContext}
          className="xl:hidden"
          aria-label="View contact details"
        >
          <Info aria-hidden="true" className="size-4" />
        </Button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 sm:px-4">
        <AnimatePresence mode="wait">
          <motion.div key={detail.id} className="flex flex-col gap-3">
            {detail.messages.map((message, index) => (
              <motion.div
                key={message.id}
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: duration.base, ease: easing.out, delay: reduceMotion ? 0 : Math.min(index * 0.03, 0.3) }}
              >
                <MessageBubble message={message} />
              </motion.div>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="border-t border-border p-3 sm:p-4">
        {/* Keyed on conversation id so the composer fully remounts (fresh
            state, no in-flight request can leak across threads) instead of
            reusing an instance across a selection change — the fix for the
            cross-conversation composer race. */}
        <ReplyComposer
          key={detail.id}
          ref={composerRef}
          conversationId={detail.id}
          onSent={onMessageSent}
          onEscalated={onEscalated}
        />
      </div>
    </div>
  )
}
