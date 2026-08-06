"use client"

import { GalleryHorizontal, LayoutGrid, MonitorPlay, type LucideIcon } from "lucide-react"

import { Segmented, type SegmentedOption } from "@/components/ui/segmented"
import { cn } from "@/lib/utils"
import type { PostFormat } from "@/app/(app)/studio/types"

const FORMAT_OPTIONS: { value: PostFormat; label: string; icon: LucideIcon; description: string }[] = [
  { value: "single", label: "Single", icon: LayoutGrid, description: "One photo or graphic." },
  { value: "carousel", label: "Carousel", icon: GalleryHorizontal, description: "Swipe through a few photos." },
  {
    value: "slideshow",
    label: "Slideshow",
    icon: MonitorPlay,
    description: "Photos set to motion — your video, without filming one.",
  },
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

const SEGMENTED_OPTIONS: SegmentedOption<PostFormat>[] = FORMAT_OPTIONS.map(({ value, label, icon: Icon, description }) => ({
  value,
  ariaLabel: label,
  // Native tooltip fallback (e.g. before the always-visible caption row
  // below has room to render) — same one-line copy as that row.
  title: description,
  // Screen readers get the same explanation sighted users see (review fix).
  describedBy: `format-description-${value}`,
  label: (
    <>
      <Icon aria-hidden="true" className="size-3.5" />
      <span className="hidden sm:inline">{label}</span>
    </>
  ),
}))

/**
 * Pill-segmented format picker. Built on the shared roving-tabindex
 * `Segmented` control (src/components/ui/segmented.tsx) — the pills
 * themselves are visually unchanged from the prior implementation; Companion
 * C2 adds a one-line, teaching caption under each option (hidden below `sm`
 * alongside the pills' own icon-only collapse) so the format picker explains
 * itself instead of relying on a hover-only tooltip.
 */
export function FormatSegmented({ value, onChange, disabled, className }: FormatSegmentedProps) {
  return (
    <div className={cn("flex w-fit flex-col gap-1.5", className)}>
      <Segmented
        value={value}
        onChange={onChange}
        options={SEGMENTED_OPTIONS}
        aria-label="Post format"
        disabled={disabled}
        className="inline-flex h-9 w-fit items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground"
        itemClassName={() =>
          "h-[calc(100%-1px)] flex-1 gap-1.5 rounded-md px-3 py-0.5 text-sm font-medium disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
        }
      />
      {/* One full-width caption for the ACTIVE format (review fix: three
          columns under a w-fit pill row truncated the slideshow explainer —
          the star format — to a few words). All three stay in the DOM for
          aria-describedby; inactive ones are visually hidden. */}
      <div className="px-1 sm:max-w-72">
        {FORMAT_OPTIONS.map((option) => (
          <p
            key={option.value}
            id={`format-description-${option.value}`}
            className={cn(
              "text-[11px] leading-snug text-muted-foreground",
              option.value === value ? "hidden line-clamp-2 sm:block" : "sr-only"
            )}
          >
            {option.description}
          </p>
        ))}
      </div>
    </div>
  )
}
