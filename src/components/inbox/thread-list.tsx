"use client"

import { useMemo, useRef } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Filter, Inbox as InboxIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { duration, easing } from "@/lib/motion"
import { cn } from "@/lib/utils"

import type { ThreadListConversation } from "@/app/(app)/inbox/actions"

import { CHANNEL_GLYPHS, type Channel } from "./channel-glyphs"
import {
  matchesChannelFilter,
  matchesThreadFilter,
  THREAD_FILTERS,
  type ChannelFilterValue,
  type ThreadFilter,
} from "./inbox-filters"
import { ThreadRow } from "./thread-row"

const CHANNELS = Object.keys(CHANNEL_GLYPHS) as Channel[]

type ThreadListProps = {
  conversations: ThreadListConversation[]
  selectedId: string | null
  filter: ThreadFilter
  channelFilter: ChannelFilterValue
  onFilterChange: (filter: ThreadFilter) => void
  onChannelFilterChange: (channel: ChannelFilterValue) => void
  onSelect: (id: string) => void
  className?: string
}

export function ThreadList({
  conversations,
  selectedId,
  filter,
  channelFilter,
  onFilterChange,
  onChannelFilterChange,
  onSelect,
  className,
}: ThreadListProps) {
  const reduceMotion = useReducedMotion()
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([])

  const filtered = useMemo(
    () =>
      conversations.filter(
        (conversation) => matchesThreadFilter(conversation, filter) && matchesChannelFilter(conversation, channelFilter)
      ),
    [conversations, filter, channelFilter]
  )

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
    event.preventDefault()
    const currentIndex = filtered.findIndex((c) => c.id === selectedId)
    const delta = event.key === "ArrowDown" ? 1 : -1
    const nextIndex = currentIndex === -1 ? 0 : Math.min(Math.max(currentIndex + delta, 0), filtered.length - 1)
    const next = filtered[nextIndex]
    if (next) {
      onSelect(next.id)
      rowRefs.current[nextIndex]?.focus()
    }
  }

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-2.5">
        <div className="flex flex-1 flex-wrap items-center gap-1">
          {THREAD_FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={filter === option.value}
              onClick={() => onFilterChange(option.value)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors",
                "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                filter === option.value
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant={channelFilter === "all" ? "ghost" : "secondary"}
                size="icon-sm"
                aria-label="Filter by channel"
              />
            }
          >
            <Filter aria-hidden="true" className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup
              value={channelFilter}
              onValueChange={(value) => onChannelFilterChange(value as ChannelFilterValue)}
            >
              <DropdownMenuRadioItem value="all">All channels</DropdownMenuRadioItem>
              {CHANNELS.map((channel) => (
                <DropdownMenuRadioItem key={channel} value={channel}>
                  {CHANNEL_GLYPHS[channel].label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div
        role="listbox"
        aria-label="Conversations"
        onKeyDown={handleKeyDown}
        className="flex-1 space-y-0.5 overflow-y-auto p-1.5"
      >
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
            <InboxIcon aria-hidden="true" className="size-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No conversations match this filter.</p>
          </div>
        ) : (
          filtered.map((conversation, index) => (
            <motion.div
              key={conversation.id}
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: duration.fast, ease: easing.out, delay: reduceMotion ? 0 : index * 0.02 }}
            >
              <ThreadRow
                ref={(el) => {
                  rowRefs.current[index] = el
                }}
                conversation={conversation}
                selected={conversation.id === selectedId}
                onSelect={onSelect}
              />
            </motion.div>
          ))
        )}
      </div>
    </div>
  )
}
