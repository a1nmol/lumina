"use client"

// Companion Home (C1) — /dashboard is no longer a stat-grid page, it's the
// opening of a conversation with Wick. Every number here comes straight
// from the same real data sources the old Command Center used (see the
// server page for exactly which query feeds which bubble) — this component
// only composes prose + inline chips around numbers it's handed, it never
// invents a data path of its own.

import type { ReactNode } from "react"
import Link from "next/link"
import { motion, useReducedMotion } from "framer-motion"
import { ArrowRight } from "lucide-react"

import { DashboardHeroAccent } from "@/components/dashboard/dashboard-hero-accent"
import { Wick } from "@/components/brand/wick"
import { duration, easing } from "@/lib/motion"
import { cn } from "@/lib/utils"

export type DashboardStat = {
  label: string
  value: number
  delta?: { direction: "up" | "down" | "flat"; value: string }
  icon: ReactNode
  sparkline?: number[]
  href: string
}

/** Mirrors src/lib/digest.ts's WhileYouWereAwayDigest, minus the ReceiptCard-formatted `rows` this surface doesn't need — the server page passes exactly this shape down. */
export type AwayReport =
  | { kind: "activity"; counts: { conversations: number; leads: number; bookings: number; calls: number } }
  | { kind: "caught_up" }
  | { kind: "unresolved" }

type HomeConversationProps = {
  /** Time-aware greeting word ("Morning" / "Afternoon" / "Evening" / "Still up") — computed server-side (see dashboard/page.tsx) so it never mismatches between server and client render. */
  greeting: string
  greetName: string
  away: AwayReport
  stats: DashboardStat[]
  /** Conversations the AI escalated or drafted-but-didn't-send — src/lib/digest.ts's getNeedsYouCount(), the same "needs a human" definition the notification tray uses. */
  needsYouCount: number
  /** Mirrors the old Command Center's EmptyState nudge: true in demo mode, or once the org's stats genuinely are all zero — a brand-new org with nothing connected yet. */
  showConnectPrompt: boolean
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return count === 1 ? singular : plural
}

/** "While you were away I heard from 4 people, landed 2 leads, and booked 1 appointment." — every clause is conditional on its own real count being > 0, joined with an Oxford "and" only in the last spot. */
function formatAwaySentence(counts: { conversations: number; leads: number; bookings: number; calls: number }): string {
  const parts: string[] = []
  if (counts.conversations > 0) {
    parts.push(`heard from ${counts.conversations} ${pluralize(counts.conversations, "person", "people")}`)
  }
  if (counts.leads > 0) {
    parts.push(`landed ${counts.leads} new ${pluralize(counts.leads, "lead")}`)
  }
  if (counts.bookings > 0) {
    parts.push(`booked ${counts.bookings} ${pluralize(counts.bookings, "appointment")}`)
  }
  if (counts.calls > 0) {
    parts.push(`took ${counts.calls} ${pluralize(counts.calls, "call")}`)
  }
  if (parts.length === 0) return "It was quiet while you were away — nothing to report."
  if (parts.length === 1) return `While you were away I ${parts[0]}.`
  if (parts.length === 2) return `While you were away I ${parts[0]} and ${parts[1]}.`
  return `While you were away I ${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}.`
}

function findStat(stats: DashboardStat[], label: string) {
  return stats.find((stat) => stat.label === label)
}

/** "This week: 3 posts out, 5 leads in, 2 bookings." — the same three figures the old stat strip led with, now read as a sentence. */
function formatWeekSentence(stats: DashboardStat[]): string {
  const posts = findStat(stats, "Posts published")?.value ?? 0
  const leads = findStat(stats, "Leads captured")?.value ?? 0
  const bookings = findStat(stats, "Bookings")?.value ?? 0
  return `This week: ${posts} ${pluralize(posts, "post")} out, ${leads} ${pluralize(leads, "lead")} in, ${bookings} ${pluralize(bookings, "booking")}.`
}

export function HomeConversation({
  greeting,
  greetName,
  away,
  stats,
  needsYouCount,
  showConnectPrompt,
}: HomeConversationProps) {
  const reduceMotion = useReducedMotion()

  const bubbles: ReactNode[] = []

  if (showConnectPrompt) {
    bubbles.push(
      <Bubble key="connect">
        <p>
          Let&apos;s connect your channels — link Google Business, Instagram, and SMS so I can post content and catch
          every lead automatically.
        </p>
        <ChipRow>
          <Chip href="/settings">Connect a channel</Chip>
        </ChipRow>
      </Bubble>
    )
  }

  if (away.kind === "activity") {
    bubbles.push(
      <Bubble key="away">
        <p>{formatAwaySentence(away.counts)}</p>
        <ChipRow>
          <Chip href="/inbox">Open inbox</Chip>
          <Chip href="/contacts">See who</Chip>
        </ChipRow>
      </Bubble>
    )
  } else if (away.kind === "caught_up") {
    bubbles.push(
      <Bubble key="away">
        <p>All caught up — nothing new since your last visit.</p>
      </Bubble>
    )
  }

  bubbles.push(
    <Bubble key="week">
      <p>{formatWeekSentence(stats)}</p>
      <div className="mt-2.5 flex flex-wrap gap-3">
        {stats.map((stat) => (
          <StatSliver key={stat.label} stat={stat} />
        ))}
      </div>
      <ChipRow>
        <Chip href="/analytics">Analytics room</Chip>
      </ChipRow>
    </Bubble>
  )

  bubbles.push(
    needsYouCount > 0 ? (
      <Bubble key="nudge">
        <p>
          <span className="font-mono font-semibold text-foreground tabular-nums">{needsYouCount}</span>{" "}
          {pluralize(needsYouCount, "conversation")} {needsYouCount === 1 ? "needs" : "need"} your voice.
        </p>
        <ChipRow>
          <Chip href="/inbox">Take me there</Chip>
        </ChipRow>
      </Bubble>
    ) : (
      <Bubble key="nudge">
        <p>Want me to draft this week&apos;s posts?</p>
        <ChipRow>
          <Chip href="/studio">Open studio</Chip>
        </ChipRow>
      </Bubble>
    )
  )

  return (
    <div className="relative isolate mx-auto flex w-full max-w-2xl flex-1 flex-col">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-3xl">
        <DashboardHeroAccent />
      </div>

      <div className="flex flex-col gap-4 py-6 sm:py-10">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: duration.base, ease: easing.out }}
          className="flex items-end gap-3"
        >
          <Wick state="idle" size={44} className="shrink-0" />
          <div className="rounded-2xl rounded-bl-sm bg-card px-4 py-3 shadow-soft ring-1 ring-border">
            <p className="font-heading text-xl leading-snug font-normal text-foreground">
              {greeting}, {greetName}.
            </p>
          </div>
        </motion.div>

        <div className="flex flex-col gap-3 pl-[3.25rem]">
          {bubbles.map((bubble, index) => (
            <motion.div
              key={index}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: duration.base,
                ease: easing.out,
                delay: reduceMotion ? 0 : 0.15 * (index + 1),
              }}
            >
              {bubble}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Bubble({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl rounded-bl-sm border-l-2 border-l-lamplight/50 bg-card px-4 py-3 text-sm text-foreground shadow-soft ring-1 ring-border">
      {children}
    </div>
  )
}

function ChipRow({ children }: { children: ReactNode }) {
  return <div className="mt-2.5 flex flex-wrap gap-2">{children}</div>
}

function Chip({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors outline-none hover:border-lamplight/50 hover:bg-muted focus-visible:border-lamplight focus-visible:ring-3 focus-visible:ring-lamplight/50 focus-visible:shadow-lamplight"
    >
      {children}
      <ArrowRight aria-hidden="true" className="size-3" />
    </Link>
  )
}

/** Inline mono numeral + tiny sparkline sliver — a compact echo of StatCard's own treatment (src/components/stat-card.tsx), shrunk to fit inside a sentence bubble instead of a card grid. */
function StatSliver({ stat }: { stat: DashboardStat }) {
  return (
    <Link
      href={stat.href}
      className="group flex items-center gap-1.5 rounded-lg px-1.5 py-1 outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-lamplight/50 focus-visible:shadow-lamplight"
    >
      <span aria-hidden="true" className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-primary [&_svg]:size-3">
        {stat.icon}
      </span>
      <span className="font-mono text-sm font-semibold tabular-nums text-foreground">{stat.value}</span>
      <span className="text-xs text-muted-foreground">{stat.label}</span>
      {stat.sparkline && stat.sparkline.length > 1 && <Sliver data={stat.sparkline} positive={stat.delta?.direction !== "down"} />}
    </Link>
  )
}

function Sliver({ data, positive }: { data: number[]; positive: boolean }) {
  const width = 36
  const height = 12
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const stepX = width / (data.length - 1)
  const points = data.map((point, i) => {
    const x = i * stepX
    const y = height - ((point - min) / range) * height
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-3 w-9" aria-hidden="true">
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={positive ? "var(--success)" : "var(--destructive)"}
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn(!positive && "opacity-80")}
      />
    </svg>
  )
}
