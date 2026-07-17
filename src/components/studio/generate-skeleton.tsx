"use client"

import { Loader2 } from "lucide-react"

import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

import { Shimmer } from "./shimmer"

type GenerateSkeletonProps = {
  /** Aspect-ratio utility class matching the ready-state image block, e.g. "aspect-[4/5]". */
  aspectClassName: string
  /** Cycling micro-copy line ("Sketching layout…" → "Rendering image…" → "Polishing caption…"). */
  microCopy: string
  className?: string
}

/**
 * Structure-matched skeleton for the PhoneFrame content pane — image block +
 * action-icon row + caption lines, sized exactly like the ready state so
 * swapping between them never shifts layout.
 */
export function GenerateSkeleton({ aspectClassName, microCopy, className }: GenerateSkeletonProps) {
  return (
    <div className={cn("flex h-full w-full flex-col", className)}>
      <div className={cn("relative w-full overflow-hidden", aspectClassName)}>
        <Skeleton className="absolute inset-0 rounded-none" />
        <div className="absolute inset-x-3 bottom-3 flex items-center gap-1.5 rounded-full bg-background/70 px-2.5 py-1 ring-1 ring-border backdrop-blur-sm">
          <Loader2 aria-hidden="true" className="size-3 shrink-0 animate-spin text-primary" />
          <Shimmer className="truncate text-[11px] font-medium">{microCopy}</Shimmer>
        </div>
      </div>
      <div className="flex items-center gap-3 px-3 pt-2">
        <Skeleton className="size-4 rounded-full" />
        <Skeleton className="size-4 rounded-full" />
        <Skeleton className="size-4 rounded-full" />
        <Skeleton className="ml-auto size-4 rounded-full" />
      </div>
      <div className="flex flex-col gap-1.5 px-3 pt-2 pb-4">
        <Skeleton className="h-3 w-4/5 rounded-full" />
        <Skeleton className="h-3 w-3/5 rounded-full" />
      </div>
    </div>
  )
}
