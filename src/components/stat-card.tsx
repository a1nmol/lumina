"use client"

import { useId, type ReactNode } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { ArrowDownRight, ArrowUpRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { duration, easing } from "@/lib/motion"

type Delta = {
  direction: "up" | "down"
  value: string
}

type StatCardProps = {
  label: string
  value: string | number
  delta?: Delta
  /** Pre-rendered Lucide icon, e.g. `<Send aria-hidden className="size-3.5" />`. */
  icon?: ReactNode
  /** Trend data for the axis-less sparkline, oldest first. */
  sparkline?: number[]
  /** Position in a staggered grid — drives the entrance delay. */
  index?: number
  className?: string
}

/** Command Center / Admin stat surface: label → value → delta chip → sparkline. */
export function StatCard({
  label,
  value,
  delta,
  icon,
  sparkline,
  index = 0,
  className,
}: StatCardProps) {
  const reduceMotion = useReducedMotion()
  const gradientId = useId()
  const positiveTrend = delta ? delta.direction === "up" : true

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: duration.base,
        ease: easing.out,
        delay: reduceMotion ? 0 : index * 0.05,
      }}
      whileHover={reduceMotion ? undefined : { y: -2 }}
      className={cn(
        "group relative flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 shadow-soft transition-shadow duration-200 hover:shadow-raised",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </span>
        {icon && (
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </span>
        )}
      </div>

      <div className="flex items-end justify-between gap-2">
        <span className="font-heading text-3xl leading-none font-semibold text-foreground tabular-nums">
          {value}
        </span>
        {delta && (
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium",
              delta.direction === "up"
                ? "bg-success/10 text-success"
                : "bg-destructive/10 text-destructive"
            )}
          >
            {delta.direction === "up" ? (
              <ArrowUpRight aria-hidden="true" className="size-3" />
            ) : (
              <ArrowDownRight aria-hidden="true" className="size-3" />
            )}
            {delta.value}
          </span>
        )}
      </div>

      {sparkline && sparkline.length > 1 && (
        <Sparkline data={sparkline} gradientId={gradientId} positive={positiveTrend} />
      )}
    </motion.div>
  )
}

function Sparkline({
  data,
  gradientId,
  positive,
}: {
  data: number[]
  gradientId: string
  positive: boolean
}) {
  const width = 100
  const height = 28
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const stepX = width / (data.length - 1)

  const points = data.map((point, i) => {
    const x = i * stepX
    const y = height - ((point - min) / range) * height
    return [x, y] as const
  })

  const linePath = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ")
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`
  const stroke = positive ? "var(--success)" : "var(--destructive)"

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="h-7 w-full"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
