// Compact call-metadata strip for voice-channel conversations (AI Phone
// Receptionist wave V2) — sits above the message list, under the thread
// header. Shows the latest call's duration/outcome/relative time and, when
// a caller has rung more than once, how many calls total. Deliberately
// quiet — same visual weight as ./ai-memory-strip.tsx, tokens only, no
// motion beyond what the rest of the pane already does.
//
// The transcript itself renders as normal message bubbles (voice messages
// are just messages with channel "voice" on their parent conversation) —
// this strip is metadata only, never a duplicate of the conversation.

import { Clock3, Phone } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { callOutcomeMeta, formatCallDuration, latestCall, type CallOutcomeTone } from "@/lib/voice/call-display"
import { cn } from "@/lib/utils"
import type { Call } from "@/lib/types"

import { formatFullTime, formatRelativeTime } from "./relative-time"

const OUTCOME_BADGE_CLASS: Record<CallOutcomeTone, string> = {
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  neutral: "border-border bg-muted text-muted-foreground",
}

type CallHeaderProps = {
  calls: Call[]
  className?: string
}

/** Renders nothing when there are no calls yet (e.g. a voice conversation created before the first webhook delivery lands) — never an empty/broken-looking strip. */
export function CallHeader({ calls, className }: CallHeaderProps) {
  const latest = latestCall(calls)
  if (!latest) return null

  const outcome = callOutcomeMeta(latest.outcome)
  const duration = formatCallDuration(latest.duration_secs)

  return (
    <div
      className={cn(
        "flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground sm:px-4",
        className
      )}
    >
      <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
        <Phone aria-hidden="true" className="size-3.5" />
        Phone call
      </span>

      {duration && (
        <span className="inline-flex items-center gap-1">
          <Clock3 aria-hidden="true" className="size-3" />
          {duration}
        </span>
      )}

      <Badge variant="outline" className={cn("border", OUTCOME_BADGE_CLASS[outcome.tone])}>
        {outcome.label}
      </Badge>

      {latest.started_at && (
        <time dateTime={latest.started_at} title={formatFullTime(latest.started_at)}>
          {formatRelativeTime(latest.started_at)}
        </time>
      )}

      {calls.length > 1 && (
        <span className="ml-auto text-muted-foreground/80">
          {calls.length} calls
        </span>
      )}
    </div>
  )
}
