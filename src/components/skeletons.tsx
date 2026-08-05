// Shared, shape-accurate loading primitives for the (app) route group's
// loading.tsx files (docs: R1 redesign wave — route infra). Server-light on
// purpose: no "use client", no hooks, just the existing Skeleton component
// (a plain animate-pulse div) composed into layouts that mirror each real
// page, so the loading state doesn't jump/reflow once data arrives.

import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

/** Mirrors <PageHeader> — title bar + description bar (+ optional action pill on the right). */
export function PageHeaderSkeleton({
  withActions = false,
  withDescription = true,
}: {
  withActions?: boolean
  withDescription?: boolean
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-48" />
        {withDescription && <Skeleton className="h-4 w-72 max-w-full" />}
      </div>
      {withActions && <Skeleton className="h-8 w-32 shrink-0 rounded-lg" />}
    </div>
  )
}

/** Mirrors the Command Center / Admin stat-card grid. */
export function StatGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="size-7 rounded-lg" />
          </div>
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-7 w-full" />
        </div>
      ))}
    </div>
  )
}

/** Mirrors a settings/growth-style ui/card: icon-chip header + a few content rows. */
export function CardSkeleton({
  lines = 2,
  withFooter = false,
  className,
}: {
  lines?: number
  withFooter?: boolean
  className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10", className)}>
      <div className="flex items-center gap-2">
        <Skeleton className="size-8 shrink-0 rounded-lg" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-56 max-w-full" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: lines }).map((_, index) => (
          <Skeleton key={index} className="h-4 w-full" />
        ))}
      </div>
      {withFooter && (
        <div className="flex justify-end">
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
      )}
    </div>
  )
}

/** Mirrors a Table: header row + N body rows of even-width cells. */
export function TableSkeleton({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
      <div className="flex items-center gap-4 border-b border-border bg-muted/40 px-4 py-3">
        {Array.from({ length: cols }).map((_, index) => (
          <Skeleton key={index} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className={cn("flex items-center gap-4 px-4 py-3.5", rowIndex > 0 && "border-t border-border")}
        >
          {Array.from({ length: cols }).map((_, colIndex) => (
            <Skeleton key={colIndex} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Mirrors InboxShell's 3-pane desktop layout (thread list / conversation / context). Narrower panes collapse on small screens same as the real shell, so this doesn't rely on JS to look right. */
export function ThreePaneSkeleton() {
  return (
    <div className="flex flex-1 gap-4 overflow-hidden">
      <div className="hidden w-80 shrink-0 flex-col gap-3 rounded-xl border border-border bg-card/40 p-3 md:flex">
        <Skeleton className="h-8 w-full rounded-lg" />
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="flex items-center gap-2.5">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-3 rounded-xl border border-border bg-card/40 p-4">
        <div className="flex items-center gap-2.5 border-b border-border pb-3">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <Skeleton className="h-4 w-32" />
        </div>
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton
            key={index}
            className={cn("h-14 rounded-xl", index % 2 === 0 ? "ml-auto w-2/3" : "w-1/2")}
          />
        ))}
      </div>
      <div className="hidden w-72 shrink-0 flex-col gap-3 rounded-xl border border-border bg-card/40 p-4 lg:flex">
        <Skeleton className="mx-auto size-14 rounded-full" />
        <Skeleton className="mx-auto h-4 w-32" />
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-20 w-full rounded-lg" />
      </div>
    </div>
  )
}
