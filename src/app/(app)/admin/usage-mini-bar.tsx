"use client"

// Compact spend-cap usage indicator for the admin Accounts table row (design
// brief: "usage-% mini bar with animated fill on first render only"). Each
// row mounts once per page load (server-rendered list, no client refetch),
// so a plain mount-time `initial` fill IS "first render only" here — no
// extra ref/state bookkeeping needed.

import { motion, useReducedMotion } from "framer-motion"

import { duration, easing } from "@/lib/motion"
import { cn } from "@/lib/utils"

interface UsageMiniBarProps {
  /** 0–100, or null when the plan has no spend cap to measure against. */
  percent: number | null
  className?: string
}

export function UsageMiniBar({ percent, className }: UsageMiniBarProps) {
  const reduceMotion = useReducedMotion()

  if (percent === null) {
    return <span className="text-xs text-muted-foreground">—</span>
  }

  const clamped = Math.min(100, Math.max(0, percent))
  const nearLimit = clamped >= 90

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`${Math.round(clamped)}% of this month's spend cap used`}
      >
        <motion.div
          className={cn("h-full rounded-full", nearLimit ? "bg-warning" : "bg-primary")}
          initial={reduceMotion ? { width: `${clamped}%` } : { width: 0 }}
          animate={{ width: `${clamped}%` }}
          transition={{ duration: duration.slow, ease: easing.out }}
        />
      </div>
      <span className={cn("text-xs tabular-nums", nearLimit ? "text-warning" : "text-muted-foreground")}>
        {Math.round(clamped)}%
      </span>
    </div>
  )
}
