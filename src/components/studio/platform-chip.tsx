"use client"

import { Camera, MapPin, Music2, Users2, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { PLATFORM_LABELS, type Platform } from "@/app/(app)/studio/types"

const PLATFORM_META: Record<Platform, { icon: LucideIcon; dotClassName: string }> = {
  instagram: { icon: Camera, dotClassName: "bg-[var(--chart-4)]" },
  facebook: { icon: Users2, dotClassName: "bg-[var(--info)]" },
  tiktok: { icon: Music2, dotClassName: "bg-foreground" },
  google_business: { icon: MapPin, dotClassName: "bg-[var(--chart-3)]" },
}

type PlatformChipProps = {
  platform: Platform
  active: boolean
  /** Shows a brand-colored dot — used once a draft has a rewritten variant for this platform. */
  showDot?: boolean
  onToggle: () => void
  disabled?: boolean
  className?: string
}

/** Toggleable platform pill with icon + optional "has a variant" dot. */
export function PlatformChip({ platform, active, showDot, onToggle, disabled, className }: PlatformChipProps) {
  const { icon: Icon, dotClassName } = PLATFORM_META[platform]

  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium whitespace-nowrap transition-colors outline-none",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        "disabled:pointer-events-none disabled:opacity-50",
        active
          ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
          : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
        className
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {PLATFORM_LABELS[platform]}
      {showDot && active && (
        <span aria-hidden="true" className={cn("size-1.5 rounded-full", dotClassName)} />
      )}
    </button>
  )
}
