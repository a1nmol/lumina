import { Sparkles, StickyNote } from "lucide-react"

import { cn } from "@/lib/utils"
import type { Message } from "@/lib/types"

import { formatFullTime, formatMessageTime } from "./relative-time"

type MessageBubbleProps = {
  message: Message
}

export function MessageBubble({ message }: MessageBubbleProps) {
  if (message.kind === "note") {
    return (
      <div className="flex w-full items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5">
        <StickyNote aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-warning" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-warning">Internal note</p>
          <p className="mt-0.5 text-sm whitespace-pre-wrap text-foreground">{message.body}</p>
          <time
            dateTime={message.created_at}
            title={formatFullTime(message.created_at)}
            className="mt-1 block text-[11px] text-muted-foreground"
          >
            {formatMessageTime(message.created_at)}
          </time>
        </div>
      </div>
    )
  }

  const isOutbound = message.direction === "outbound"

  return (
    <div className={cn("flex w-full flex-col gap-1", isOutbound ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap",
          isOutbound
            ? "rounded-br-md bg-primary/10 text-foreground"
            : "rounded-bl-md bg-muted text-foreground"
        )}
      >
        {message.body}
      </div>
      <div className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
        {message.ai_handled && (
          <span className="inline-flex items-center gap-0.5 font-medium text-primary">
            <Sparkles aria-hidden="true" className="size-3" />
            AI
          </span>
        )}
        <time dateTime={message.created_at} title={formatFullTime(message.created_at)}>
          {formatMessageTime(message.created_at)}
        </time>
      </div>
    </div>
  )
}
