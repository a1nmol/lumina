"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { toast } from "sonner"

import { Wick, type WickState } from "@/components/brand/wick"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { duration, easing } from "@/lib/motion"

type EmptyStateProps = {
  /** Pre-rendered Lucide icon, e.g. `<Sparkles aria-hidden className="size-6" />`. Still required even when `withWick` is true, since Wick only replaces the ring's contents. */
  icon: ReactNode
  title: string
  description: string
  actionLabel: string
  /** If provided, the CTA navigates here. Otherwise it surfaces a "coming soon" toast. */
  actionHref?: string
  className?: string
  /**
   * When true, Wick hovers above the empty state instead of the icon ring
   * (which hides) — an emotional-edge moment per brand-redesign-plan.md §4.
   * Off by default. Never enable on admin/settings/dense-table surfaces
   * (Wick's own dev-only guard also warns for `/admin` and `/settings`).
   */
  withWick?: boolean
  /** Only meaningful when `withWick` is true — which Wick state to render. Defaults to "idle". */
  wickState?: WickState
}

/** Illustrated (monochrome, gradient-ring — or Wick) empty state with a single primary CTA. */
export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
  className,
  withWick = false,
  wickState = "idle",
}: EmptyStateProps) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.base, ease: easing.out }}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border bg-card/40 px-6 py-16 text-center",
        className
      )}
    >
      {withWick ? (
        <Wick state={wickState} size={56} />
      ) : (
        <span
          aria-hidden="true"
          className="flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-primary/15 via-primary/5 to-[var(--chart-2)]/10 text-primary ring-1 ring-primary/10"
        >
          {icon}
        </span>
      )}
      <div className="flex max-w-sm flex-col gap-1.5">
        <h3 className="text-base font-medium text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {actionHref ? (
        <Button render={<Link href={actionHref} />}>{actionLabel}</Button>
      ) : (
        <Button
          onClick={() =>
            toast.info(title, { description: "This part of LocalOS is coming soon." })
          }
        >
          {actionLabel}
        </Button>
      )}
    </motion.div>
  )
}
