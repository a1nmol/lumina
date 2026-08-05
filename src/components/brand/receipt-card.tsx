"use client"

import { motion, useReducedMotion } from "framer-motion"

import { Wick } from "@/components/brand/wick"
import { duration, easing } from "@/lib/motion"
import { cn } from "@/lib/utils"

/**
 * ReceiptCard — "toasts print like receipts" (brand-redesign-plan.md §5/§7),
 * reused here for the Command Center's "while you were away" digest. Shares
 * the dashed-perforation idea from `.receipt-toast` (src/components/ui/
 * sonner.tsx / globals.css) for the top edge, plus a torn-paper strip (small
 * triangular notches cut from the page background) above the footer line.
 * Monospace throughout for the thermal-printer read.
 *
 * Two body treatments (Redesign wave R4 — the digest surface always exists,
 * never vanishes on a quiet day): `rows` itemizes real activity; `message`
 * (optionally paired with `withWick`) is the calm "nothing new" line, same
 * receipt chrome, so the card teaches itself instead of disappearing. Pass
 * exactly one of the two.
 */

export interface ReceiptCardRow {
  label: string
  value: string
}

interface ReceiptCardProps {
  title: string
  /** Itemized activity rows — the original treatment. Omit when passing `message` instead. */
  rows?: ReceiptCardRow[]
  /** A single calm line rendered in place of `rows` — e.g. "All caught up — nothing new since your last visit." */
  message?: string
  /** Pairs with `message`: a small Wick glyph alongside the line. Command Center is an allowed Wick surface (brand-redesign-plan.md §4). Ignored when `rows` is used. */
  withWick?: boolean
  footer?: string
  /** Accessible name for the region — defaults to `title`. */
  ariaLabel?: string
  className?: string
}

export function ReceiptCard({ title, rows, message, withWick, footer, ariaLabel, className }: ReceiptCardProps) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.section
      role="region"
      aria-label={ariaLabel ?? title}
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.base, ease: easing.out }}
      className={cn(
        "receipt-card relative w-full max-w-xs overflow-hidden rounded-2xl bg-card pt-5 shadow-soft ring-1 ring-border",
        className
      )}
    >
      <h2 className="px-5 font-mono text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
        {title}
      </h2>

      {rows && rows.length > 0 ? (
        <dl className="mt-4 flex flex-col gap-2 px-5 font-mono text-sm">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-4">
              <dt className="text-foreground">{row.label}</dt>
              <dd className="tabular-nums font-semibold text-foreground">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : message ? (
        <div className="mt-4 flex items-center gap-2.5 px-5 font-mono text-sm text-foreground">
          {withWick && <Wick state="idle" size={22} className="shrink-0" />}
          <p>{message}</p>
        </div>
      ) : null}

      <div aria-hidden="true" className="receipt-card__tear mt-5 bg-card" />

      {footer ? (
        <p className="px-5 pt-3 pb-5 text-center font-mono text-xs text-muted-foreground italic">{footer}</p>
      ) : null}
    </motion.section>
  )
}
