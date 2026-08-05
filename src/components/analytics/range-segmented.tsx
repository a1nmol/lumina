"use client"

import { useRef, type KeyboardEvent } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { cn } from "@/lib/utils"
import { DEFAULT_RANGE, RANGE_OPTIONS, parseRangeParam, type RangeValue } from "./range"

/**
 * Time-range radiogroup (Today · 7d · 30d), state lives in the `range` URL
 * query param so the server page re-fetches on change. Same roving-tabindex
 * radiogroup pattern as src/components/studio/format-segmented.tsx.
 */
export function RangeSegmented({ className }: { className?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const value = parseRangeParam(searchParams.get("range") ?? undefined)
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([])

  function setRange(next: RangeValue) {
    const params = new URLSearchParams(searchParams.toString())
    if (next === DEFAULT_RANGE) params.delete("range")
    else params.set("range", next)
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  function selectAndFocus(index: number) {
    const option = RANGE_OPTIONS[index]
    if (!option) return
    setRange(option.value)
    buttonRefs.current[index]?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const currentIndex = RANGE_OPTIONS.findIndex((option) => option.value === value)
    if (currentIndex === -1) return

    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault()
        selectAndFocus((currentIndex + 1) % RANGE_OPTIONS.length)
        break
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault()
        selectAndFocus((currentIndex - 1 + RANGE_OPTIONS.length) % RANGE_OPTIONS.length)
        break
      case "Home":
        event.preventDefault()
        selectAndFocus(0)
        break
      case "End":
        event.preventDefault()
        selectAndFocus(RANGE_OPTIONS.length - 1)
        break
      default:
        break
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label="Time range"
      onKeyDown={handleKeyDown}
      className={cn(
        "inline-flex h-9 w-fit items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground",
        className
      )}
    >
      {RANGE_OPTIONS.map((option, index) => {
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
            tabIndex={isSelected ? 0 : -1}
            onClick={() => setRange(option.value)}
            className={cn(
              "relative inline-flex h-[calc(100%-1px)] items-center justify-center rounded-md border border-transparent px-3 py-0.5 text-sm font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring",
              isSelected
                ? "bg-background text-foreground shadow-soft dark:border-input dark:bg-input/30"
                : "text-foreground/60 hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground"
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
