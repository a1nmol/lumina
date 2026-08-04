"use client"

import { useState, type ReactNode } from "react"
import { motion, useReducedMotion, AnimatePresence } from "framer-motion"
import { CalendarClock, MessagesSquare, Phone, Repeat2 } from "lucide-react"

import { ChannelGlyph } from "@/components/inbox/channel-glyphs"
import { duration, easing } from "@/lib/motion"
import { cn } from "@/lib/utils"
import { callOutcomeMeta, formatCallDuration } from "@/lib/voice/call-display"
import type { ContactTimelineEvent } from "@/lib/types"

import { CONTACT_STATUS_META } from "@/components/inbox/status-pill"
import { relativeTime } from "../utils"

const APPOINTMENT_STATUS_LABEL: Record<string, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
}

function snippet(text: string, max = 96): string {
  const trimmed = text.trim()
  return trimmed.length > max ? `${trimmed.slice(0, max).trimEnd()}…` : trimmed
}

function eventKey(event: ContactTimelineEvent, index: number): string {
  if (event.type === "message") return `message-${event.message.id}`
  if (event.type === "appointment") return `appointment-${event.appointment.id}`
  if (event.type === "call") return `call-${event.call.id}`
  return `status-${event.at}-${index}`
}

type ActivityTimelineProps = {
  events: ContactTimelineEvent[]
}

/**
 * Twenty-style unified activity feed: messages, status changes, and
 * appointments merged chronologically. Type icon in a small ring, a
 * continuous hairline connects entries, each collapses to a one-line
 * snippet and expands on click.
 */
export function ActivityTimeline({ events }: ActivityTimelineProps) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card/40 px-6 py-12 text-center">
        <MessagesSquare aria-hidden="true" className="size-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No activity yet — messages, bookings, and status changes will show up here.</p>
      </div>
    )
  }

  // Most recent first for the profile feed.
  const ordered = [...events].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  return (
    <ol className="relative m-0 flex list-none flex-col gap-5 p-0">
      <div aria-hidden="true" className="absolute top-2 bottom-2 left-4 w-px bg-border" />
      {ordered.map((event, index) => (
        <TimelineEntry key={eventKey(event, index)} event={event} />
      ))}
    </ol>
  )
}

function TimelineEntry({ event }: { event: ContactTimelineEvent }) {
  const [expanded, setExpanded] = useState(false)
  const reduceMotion = useReducedMotion()

  const { icon, title, meta, body } = describeEvent(event)
  const expandable = Boolean(body)

  return (
    <li className="relative flex gap-3">
      <span className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full bg-card text-muted-foreground ring-1 ring-border">
        {icon}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <button
          type="button"
          disabled={!expandable}
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expandable ? expanded : undefined}
          className={cn(
            "flex w-full flex-col gap-0.5 rounded-lg text-left transition-colors",
            expandable && "cursor-pointer hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            !expandable && "cursor-default"
          )}
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium text-foreground">{title}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(event.at)}</span>
          </div>
          {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
          {body && !expanded && (
            <span className="mt-1 line-clamp-1 text-sm text-foreground/90">{snippet(body)}</span>
          )}
        </button>
        <AnimatePresence initial={false}>
          {body && expanded && (
            <motion.p
              initial={reduceMotion ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={reduceMotion ? undefined : { opacity: 0, height: 0 }}
              transition={{ duration: duration.fast, ease: easing.out }}
              className="mt-1 overflow-hidden text-sm whitespace-pre-wrap text-foreground/90"
            >
              {body}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </li>
  )
}

function describeEvent(event: ContactTimelineEvent): {
  icon: ReactNode
  title: string
  meta?: string
  body?: string
} {
  if (event.type === "message") {
    const { message, channel } = event
    const isNote = message.kind === "note"
    const direction = message.direction === "inbound" ? "Customer" : isNote ? "Internal note" : "You"
    return {
      icon: <ChannelGlyph channel={channel} className="size-4" />,
      title: isNote ? "Internal note" : direction === "Customer" ? "Message from customer" : "You replied",
      meta: message.ai_handled ? "AI-handled" : undefined,
      body: message.body ?? undefined,
    }
  }

  if (event.type === "appointment") {
    const { appointment } = event
    return {
      icon: <CalendarClock aria-hidden="true" className="size-4" />,
      title: appointment.service ?? "Appointment",
      meta: APPOINTMENT_STATUS_LABEL[appointment.status] ?? appointment.status,
      body: appointment.notes ?? undefined,
    }
  }

  if (event.type === "call") {
    const { call } = event
    const durationText = formatCallDuration(call.duration_secs)
    const outcome = callOutcomeMeta(call.outcome)
    return {
      icon: <Phone aria-hidden="true" className="size-4" />,
      title: "Phone call",
      meta: [durationText, outcome.label].filter(Boolean).join(" · "),
      body: call.summary ?? undefined,
    }
  }

  return {
    icon: <Repeat2 aria-hidden="true" className="size-4" />,
    title: `Moved to ${CONTACT_STATUS_META[event.status].label}`,
  }
}
