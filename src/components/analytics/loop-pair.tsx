"use client"

import { format, parseISO } from "date-fns"
import { motion, useReducedMotion } from "framer-motion"
import {
  CalendarCheck2,
  GalleryHorizontal,
  LayoutGrid,
  MonitorPlay,
  PhoneIncoming,
  UserPlus,
  Waypoints,
  type LucideIcon,
} from "lucide-react"

import { duration, easing } from "@/lib/motion"
import type { LoopOutcome, LoopOutcomeKind, LoopPair as LoopPairType } from "@/lib/types"
import { ChannelGlyph } from "@/components/inbox/channel-glyphs"

import { primaryPlatformMeta } from "./platform-meta"
import { thumbnailStyle } from "./seeded"

const FORMAT_ICON: Record<LoopPairType["post"]["format"], LucideIcon> = {
  single: LayoutGrid,
  carousel: GalleryHorizontal,
  slideshow: MonitorPlay,
}

const OUTCOME_KIND_META: Record<LoopOutcomeKind, { label: string; icon: LucideIcon }> = {
  lead: { label: "Lead", icon: UserPlus },
  booking: { label: "Booking", icon: CalendarCheck2 },
  call: { label: "Call", icon: PhoneIncoming },
}

function snippet(caption: string | null, max: number): string {
  if (!caption) return "(no caption)"
  if (caption.length <= max) return caption
  return `${caption.slice(0, max).trimEnd()}…`
}

function SourceCard({ pair }: { pair: LoopPairType }) {
  const primaryPlatform = primaryPlatformMeta(pair.post.platforms)
  const PrimaryIcon = primaryPlatform.icon
  const FormatIcon = FORMAT_ICON[pair.post.format]
  const publishedAt = format(parseISO(pair.post.publishedAt), "MMM d, h:mm a")

  return (
    <div className="flex flex-1 items-start gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10 shadow-soft transition-shadow duration-200 group-hover/pair:ring-primary/30">
      <div
        style={thumbnailStyle(pair.post.id)}
        className="relative size-12 shrink-0 overflow-hidden rounded-lg ring-1 ring-foreground/10"
      >
        <span
          aria-hidden="true"
          className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full bg-card text-foreground/80 ring-1 ring-border"
        >
          <PrimaryIcon aria-hidden="true" className="size-3" />
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="line-clamp-2 text-sm text-foreground">{snippet(pair.post.caption, 90)}</p>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <FormatIcon aria-hidden="true" className="size-3" />
          {publishedAt}
        </span>
      </div>
    </div>
  )
}

function OutcomeChip({ outcome }: { outcome: LoopOutcome }) {
  const kindMeta = OUTCOME_KIND_META[outcome.kind]
  const KindIcon = kindMeta.icon
  const time = format(parseISO(outcome.occurredAt), "MMM d, h:mm a")

  return (
    <div className="flex items-center gap-2 rounded-xl bg-card p-2.5 ring-1 ring-foreground/10 shadow-soft transition-shadow duration-200 group-hover/pair:ring-primary/30">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <ChannelGlyph channel={outcome.channel} className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-foreground">
          {outcome.contactName ?? "New contact"}
        </span>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <KindIcon aria-hidden="true" className="size-3" />
          {kindMeta.label} · {time}
        </span>
      </div>
      <span className="inline-flex h-5 w-fit shrink-0 items-center rounded-full bg-primary/10 px-2 text-[11px] font-medium whitespace-nowrap text-primary">
        {outcome.deltaHours}h after post
      </span>
    </div>
  )
}

/** SVG bezier thread connecting the source and outcome columns (desktop only). Draw-in via Framer's `pathLength` (internally animates stroke-dasharray/offset) — static under reduced motion. Hover/focus thickens + brightens via the shared `group/pair` state. */
function ConnectorThread() {
  const reduceMotion = useReducedMotion()

  return (
    <div className="relative hidden w-16 shrink-0 self-stretch sm:block md:w-24" aria-hidden="true">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full">
        <motion.path
          d="M0,50 C32,18 68,82 100,50"
          fill="none"
          stroke="var(--chart-1)"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          className="opacity-40 stroke-[1.5] transition-[opacity,stroke-width] duration-200 ease-out group-hover/pair:opacity-70 group-hover/pair:stroke-[2.5]"
          initial={{ pathLength: reduceMotion ? 1 : 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: duration.slow, ease: easing.out }}
        />
        <circle cx="2" cy="50" r="2.5" fill="var(--chart-1)" className="opacity-40 transition-opacity duration-200 group-hover/pair:opacity-70" />
        <circle cx="98" cy="50" r="2.5" fill="var(--chart-1)" className="opacity-40 transition-opacity duration-200 group-hover/pair:opacity-70" />
      </svg>
    </div>
  )
}

function MobileConnector() {
  return (
    <div className="flex items-center justify-center py-1 sm:hidden" aria-hidden="true">
      <span className="h-5 w-px bg-[var(--chart-1)] opacity-40 transition-opacity duration-200 group-hover/pair:opacity-70" />
    </div>
  )
}

/** Small icon+text attribution-transparency caption — mirrors the AiStateChip convention (never a bare score). */
function MatchCaption({ text }: { text: string }) {
  return (
    <span className="inline-flex h-6 w-fit items-center gap-1.5 rounded-full bg-muted/60 px-2.5 text-xs font-medium text-muted-foreground">
      <Waypoints aria-hidden="true" className="size-3.5" />
      {text}
    </span>
  )
}

type LoopPairProps = {
  pair: LoopPairType
}

/**
 * The Loop's signature moment: source post card ↔ animated thread ↔ outcome
 * chip stack. The whole pair is one hoverable unit (`group/pair`) — hovering
 * anywhere highlights both cards and the thread together, per the design
 * brief. The wrapper itself isn't a focusable/interactive control (its
 * content — cards, captions — reads naturally in document order), so it
 * carries no role/tabIndex/aria-label; there's no keyboard-reachable dead
 * element here.
 */
export function LoopPair({ pair }: LoopPairProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="group/pair relative flex flex-col gap-0 rounded-2xl sm:flex-row sm:items-center">
        <SourceCard pair={pair} />
        <MobileConnector />
        <ConnectorThread />
        <div className="flex flex-1 flex-col gap-2">
          {pair.outcomes.map((outcome, index) => (
            <OutcomeChip key={`${outcome.occurredAt}-${index}`} outcome={outcome} />
          ))}
        </div>
      </div>
      <MatchCaption text={pair.matchMethod} />
    </div>
  )
}
