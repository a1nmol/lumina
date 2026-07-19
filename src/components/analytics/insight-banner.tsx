"use client"

import Link from "next/link"
import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Sparkles, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useMounted } from "@/hooks/use-mounted"
import { duration, easing } from "@/lib/motion"
import type { AnalyticsInsight } from "@/lib/types"

const STORAGE_KEY = "localos:analytics:dismissed-insights"

/** "2026-07-19" in the visitor's local timezone — dismissals expire day-to-day. */
function todayKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}

/** Record<insightId, dayKeyDismissed>, validated on read — any malformed/foreign localStorage value is treated as empty. */
function readDismissed(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    const entries = Object.entries(parsed as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
    return Object.fromEntries(entries)
  } catch {
    return {}
  }
}

function writeDismissed(dismissed: Record<string, string>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(dismissed))
  } catch {
    // Best-effort — private browsing / storage quota shouldn't break the banner.
  }
}

type InsightBannerProps = {
  insights: AnalyticsInsight[]
  className?: string
}

/**
 * Dismissible AI-insight banner: one insight at a time, Sparkles + brand-violet
 * accent bar + one CTA + dismiss. Dismissal is remembered per insight id for
 * the current day (localStorage); the next queued insight takes its place.
 *
 * Reads localStorage directly during render (gated by `useMounted`, which is
 * itself hydration-safe via useSyncExternalStore — see src/hooks/use-mounted.ts)
 * rather than syncing into state from an effect, so dismissing bumps a plain
 * render-triggering counter instead of duplicating the dismissed-set in state.
 */
export function InsightBanner({ insights, className }: InsightBannerProps) {
  const reduceMotion = useReducedMotion()
  const mounted = useMounted()
  const [dismissVersion, setDismissVersion] = useState(0)

  const dismissed = mounted ? readDismissed() : {}
  const today = todayKey()
  // `dismissVersion` isn't read directly — it exists purely to force this
  // render-time localStorage read to re-run after a dismiss.
  void dismissVersion
  const visibleInsights = insights.filter((insight) => dismissed[insight.id] !== today)

  function dismiss(id: string) {
    const current = readDismissed()
    current[id] = todayKey()
    writeDismissed(current)
    setDismissVersion((version) => version + 1)
  }

  if (!mounted || visibleInsights.length === 0) return null

  const current = visibleInsights[0]

  return (
    <AnimatePresence initial={false} mode="wait">
      <motion.div
        key={current.id}
        initial={reduceMotion ? false : { opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
        transition={{ duration: duration.base, ease: easing.out }}
        className={className}
      >
        <div className="relative flex items-start gap-3 overflow-hidden rounded-xl border-l-4 border-l-primary bg-primary/5 py-3 pr-3 pl-4 ring-1 ring-primary/10">
          <span
            aria-hidden="true"
            className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
          >
            <Sparkles aria-hidden="true" className="size-4" />
          </span>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
            <p className="min-w-0 flex-1 text-sm text-foreground">{current.text}</p>
            <Button size="sm" render={<Link href={current.cta.href} />}>
              {current.cta.label}
            </Button>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Dismiss insight"
            onClick={() => dismiss(current.id)}
            className="shrink-0"
          >
            <X aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
