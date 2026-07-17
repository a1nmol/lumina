"use client"

import { GalleryHorizontal, LayoutGrid, MonitorPlay, type LucideIcon } from "lucide-react"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { PostFormat } from "@/app/(app)/studio/types"

const FORMAT_OPTIONS: { value: PostFormat; label: string; icon: LucideIcon }[] = [
  { value: "single", label: "Single", icon: LayoutGrid },
  { value: "carousel", label: "Carousel", icon: GalleryHorizontal },
  { value: "slideshow", label: "Slideshow", icon: MonitorPlay },
]

type FormatSegmentedProps = {
  value: PostFormat
  onChange: (format: PostFormat) => void
  disabled?: boolean
  className?: string
}

/** Pill-segmented format picker — a restyled Tabs used as a value control, no panels. */
export function FormatSegmented({ value, onChange, disabled, className }: FormatSegmentedProps) {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => {
        if (typeof next === "string") onChange(next as PostFormat)
      }}
      className={className}
    >
      <TabsList aria-label="Post format" className="h-9 p-1">
        {FORMAT_OPTIONS.map(({ value: optionValue, label, icon: Icon }) => (
          <TabsTrigger key={optionValue} value={optionValue} disabled={disabled} className="gap-1.5 px-3">
            <Icon aria-hidden="true" className="size-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
