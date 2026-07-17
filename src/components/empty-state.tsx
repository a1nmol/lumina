"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { duration, easing } from "@/lib/motion"

type EmptyStateProps = {
  /** Pre-rendered Lucide icon, e.g. `<Sparkles aria-hidden className="size-6" />`. */
  icon: ReactNode
  title: string
  description: string
  actionLabel: string
  /** If provided, the CTA navigates here. Otherwise it surfaces a "coming soon" toast. */
  actionHref?: string
  className?: string
}

/** Illustrated (monochrome, gradient-ring) empty state with a single primary CTA. */
export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
  className,
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
      <span
        aria-hidden="true"
        className="flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-primary/15 via-primary/5 to-[var(--chart-2)]/10 text-primary ring-1 ring-primary/10"
      >
        {icon}
      </span>
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
