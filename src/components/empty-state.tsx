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
  /** Pre-rendered Lucide icon, e.g. `<Sparkles aria-hidden className="size-6" />`. Required in the default (non-compact) treatment — even when `withWick` is true, since Wick only replaces the ring's contents. Omit (or ignore) when `compact` is true; compact never renders an icon. */
  icon?: ReactNode
  title: string
  description?: string
  /** Omit entirely to render no CTA — some empty states (e.g. a filtered-out list) have their action live elsewhere on the page. */
  actionLabel?: string
  /** If provided, the CTA navigates here. */
  actionHref?: string
  /** If provided (and `actionHref` isn't), the CTA calls this instead of surfacing the default "coming soon" toast — for actions that open a dialog or run local state, not a route. */
  onAction?: () => void
  className?: string
  /**
   * When true, Wick hovers above the empty state instead of the icon ring
   * (which hides) — an emotional-edge moment per brand-redesign-plan.md §4.
   * Off by default. Never enable on admin/settings/dense-table surfaces
   * (Wick's own dev-only guard also warns for `/admin` and `/settings`).
   * Ignored when `compact` is true.
   */
  withWick?: boolean
  /** Only meaningful when `withWick` is true — which Wick state to render. Defaults to "idle". */
  wickState?: WickState
  /**
   * Small, dense-UI-safe treatment for in-pane use (a day cell, a context
   * pane, a filtered sub-list) — no illustrated icon ring, no display serif,
   * tight padding. Use the default (non-compact) treatment for a page- or
   * panel-level empty state; use `compact` for a small placeholder nested
   * inside an already-populated screen.
   */
  compact?: boolean
}

/** Illustrated (monochrome, gradient-ring — or Wick) empty state with an optional single primary CTA. */
export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  className,
  withWick = false,
  wickState = "idle",
  compact = false,
}: EmptyStateProps) {
  const reduceMotion = useReducedMotion()

  const action = actionLabel ? (
    actionHref ? (
      <Button size={compact ? "sm" : "default"} render={<Link href={actionHref} />}>
        {actionLabel}
      </Button>
    ) : (
      <Button
        size={compact ? "sm" : "default"}
        onClick={
          onAction ??
          (() => toast.info(title, { description: "This part of Lumina is coming soon." }))
        }
      >
        {actionLabel}
      </Button>
    )
  ) : null

  if (compact) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/70 px-3 py-6 text-center",
          className
        )}
      >
        {icon && (
          <span aria-hidden="true" className="text-muted-foreground [&_svg]:size-4">
            {icon}
          </span>
        )}
        <p className="text-xs font-medium text-foreground">{title}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
        {action}
      </div>
    )
  }

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
        {/* One of the deliberate, sparing display-serif spots (see
            globals.css's `--font-heading` note) — an empty state is a
            signature moment, not dense chrome. */}
        <h3 className="font-heading text-2xl leading-tight font-normal text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </motion.div>
  )
}
