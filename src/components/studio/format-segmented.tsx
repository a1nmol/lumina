"use client"

import { GalleryHorizontal, LayoutGrid, MonitorPlay, type LucideIcon } from "lucide-react"

import { Segmented, type SegmentedOption } from "@/components/ui/segmented"
import { cn } from "@/lib/utils"
import type { PostFormat } from "@/app/(app)/studio/types"

const FORMAT_OPTIONS: { value: PostFormat; label: string; icon: LucideIcon }[] = [
  { value: "single", label: "Single", icon: LayoutGrid },
  { value: "carousel", label: "Carousel", icon: GalleryHorizontal },
  { value: "slideshow", label: "Slideshow", icon: MonitorPlay },
]

/** Exported for reuse by templates-panel.tsx (format icon on saved template cards). */
export const FORMAT_META: Record<PostFormat, { label: string; icon: LucideIcon }> = {
  single: { label: "Single", icon: LayoutGrid },
  carousel: { label: "Carousel", icon: GalleryHorizontal },
  slideshow: { label: "Slideshow", icon: MonitorPlay },
}

type FormatSegmentedProps = {
  value: PostFormat
  onChange: (format: PostFormat) => void
  disabled?: boolean
  className?: string
}

const SEGMENTED_OPTIONS: SegmentedOption<PostFormat>[] = FORMAT_OPTIONS.map(({ value, label, icon: Icon }) => ({
  value,
  ariaLabel: label,
  label: (
    <>
      <Icon aria-hidden="true" className="size-3.5" />
      <span className="hidden sm:inline">{label}</span>
    </>
  ),
}))

/**
 * Pill-segmented format picker. Built on the shared roving-tabindex
 * `Segmented` control (src/components/ui/segmented.tsx) — visuals are
 * unchanged from the prior standalone implementation.
 */
export function FormatSegmented({ value, onChange, disabled, className }: FormatSegmentedProps) {
  return (
    <Segmented
      value={value}
      onChange={onChange}
      options={SEGMENTED_OPTIONS}
      aria-label="Post format"
      disabled={disabled}
      className={cn(
        "inline-flex h-9 w-fit items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground",
        className
      )}
      itemClassName={() =>
        "h-[calc(100%-1px)] flex-1 gap-1.5 rounded-md px-3 py-0.5 text-sm font-medium disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
      }
    />
  )
}
