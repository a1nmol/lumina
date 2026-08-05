"use client"

// Generic accessible segmented control (Redesign wave R3 — Inbox as canvas,
// item 7). `role="radiogroup"` of `role="radio"` pills with WAI-ARIA
// roving-tabindex arrow-key navigation (ArrowLeft/Right/Up/Down, Home, End) —
// de-duplicates the four copy-pasted keyboard handlers that used to live in
// src/components/inbox/reply-composer.tsx (Reply/Note), ./ai-mode-toggle.tsx
// (Auto/Off), src/components/studio/format-segmented.tsx, and
// src/components/analytics/range-segmented.tsx.
//
// Deliberately unopinionated about size/visuals: every call site keeps its
// EXACT prior appearance (h-6 AI-mode pill vs h-8 composer pill vs h-9
// studio/analytics pill, icon-vs-text-only, flex-1-vs-content-width, etc.) by
// supplying its own `className` (outer radiogroup) and `itemClassName`
// (per-pill, receives `isSelected` so hover/selected states stay caller-
// controlled). Only the selected/unselected color tokens are baked in here
// since all four call sites already shared that exact pair verbatim.

import { useRef, type KeyboardEvent, type ReactNode } from "react"

import { cn } from "@/lib/utils"

export type SegmentedOption<T extends string> = {
  value: T
  /** Visible pill content — a label string, or label+icon markup for callers like FormatSegmented. */
  label: ReactNode
  /** Accessible name override for the pill button, when `label` hides text visually (e.g. icon-only below a breakpoint). */
  ariaLabel?: string
  /** Native title tooltip for this specific pill (e.g. AiModeToggle's per-option explanation). */
  title?: string
  disabled?: boolean
}

type SegmentedProps<T extends string> = {
  value: T
  onChange: (value: T) => void
  options: SegmentedOption<T>[]
  /** Accessible name for the radiogroup itself. */
  "aria-label": string
  /** Disables the whole control (every pill + keyboard nav). */
  disabled?: boolean
  /** Classes for the outer `role="radiogroup"` element — this is where each call site sets its exact height/padding/background/radius. */
  className?: string
  /** Classes for each pill button, given whether it's currently selected — this is where each call site sets its exact pill height/padding/text-size/radius/font-weight. */
  itemClassName?: (isSelected: boolean) => string
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  "aria-label": ariaLabel,
  disabled,
  className,
  itemClassName,
}: SegmentedProps<T>) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([])

  function selectAndFocus(index: number) {
    const option = options[index]
    if (!option || option.disabled) return
    onChange(option.value)
    buttonRefs.current[index]?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return
    const currentIndex = options.findIndex((option) => option.value === value)
    if (currentIndex === -1) return

    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault()
        selectAndFocus((currentIndex + 1) % options.length)
        break
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault()
        selectAndFocus((currentIndex - 1 + options.length) % options.length)
        break
      case "Home":
        event.preventDefault()
        selectAndFocus(0)
        break
      case "End":
        event.preventDefault()
        selectAndFocus(options.length - 1)
        break
      default:
        break
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      onKeyDown={handleKeyDown}
      className={className}
    >
      {options.map((option, index) => {
        const isSelected = value === option.value
        return (
          <button
            key={option.value}
            ref={(el) => {
              buttonRefs.current[index] = el
            }}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={option.ariaLabel}
            title={option.title}
            disabled={disabled || option.disabled}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative inline-flex items-center justify-center border border-transparent whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring",
              isSelected
                ? "bg-background text-foreground shadow-soft dark:border-input dark:bg-input/30"
                : "text-foreground/60 hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground",
              itemClassName?.(isSelected)
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
