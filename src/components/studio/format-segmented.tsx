"use client"

import { useRef, type KeyboardEvent } from "react"
import { GalleryHorizontal, LayoutGrid, MonitorPlay, type LucideIcon } from "lucide-react"

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

/**
 * Pill-segmented format picker. `role="radiogroup"` of `role="radio"` pills
 * (a single logical choice, not a tabbed panel set — Tabs was the wrong
 * semantic here) with WAI-ARIA roving-tabindex arrow-key navigation. Visuals
 * are unchanged from the prior Tabs-based implementation.
 */
export function FormatSegmented({ value, onChange, disabled, className }: FormatSegmentedProps) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([])

  function selectAndFocus(index: number) {
    const option = FORMAT_OPTIONS[index]
    if (!option) return
    onChange(option.value)
    buttonRefs.current[index]?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return
    const currentIndex = FORMAT_OPTIONS.findIndex((option) => option.value === value)
    if (currentIndex === -1) return

    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault()
        selectAndFocus((currentIndex + 1) % FORMAT_OPTIONS.length)
        break
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault()
        selectAndFocus((currentIndex - 1 + FORMAT_OPTIONS.length) % FORMAT_OPTIONS.length)
        break
      case "Home":
        event.preventDefault()
        selectAndFocus(0)
        break
      case "End":
        event.preventDefault()
        selectAndFocus(FORMAT_OPTIONS.length - 1)
        break
      default:
        break
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label="Post format"
      aria-disabled={disabled || undefined}
      onKeyDown={handleKeyDown}
      className={cn(
        "inline-flex h-9 w-fit items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground",
        className
      )}
    >
      {FORMAT_OPTIONS.map(({ value: optionValue, label, icon: Icon }, index) => {
        const isSelected = value === optionValue
        return (
          <button
            key={optionValue}
            ref={(el) => {
              buttonRefs.current[index] = el
            }}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={label}
            disabled={disabled}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onChange(optionValue)}
            className={cn(
              "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-3 py-0.5 text-sm font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
              isSelected
                ? "bg-background text-foreground shadow-soft dark:border-input dark:bg-input/30"
                : "text-foreground/60 hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground"
            )}
          >
            <Icon aria-hidden="true" className="size-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        )
      })}
    </div>
  )
}
