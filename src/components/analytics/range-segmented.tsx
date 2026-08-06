"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { Segmented, type SegmentedOption } from "@/components/ui/segmented"
import { cn } from "@/lib/utils"
import { DEFAULT_RANGE, RANGE_OPTIONS, parseRangeParam, type RangeValue } from "./range"

const SEGMENTED_OPTIONS: SegmentedOption<RangeValue>[] = RANGE_OPTIONS.map((option) => ({
  value: option.value,
  label: option.label,
}))

/**
 * Time-range radiogroup (Today · 7d · 30d), state lives in the `range` URL
 * query param so the server page re-fetches on change. Built on the shared
 * roving-tabindex `Segmented` control (src/components/ui/segmented.tsx).
 */
export function RangeSegmented({ className }: { className?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const value = parseRangeParam(searchParams.get("range") ?? undefined)

  function setRange(next: RangeValue) {
    const params = new URLSearchParams(searchParams.toString())
    if (next === DEFAULT_RANGE) params.delete("range")
    else params.set("range", next)
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  return (
    <Segmented
      value={value}
      onChange={setRange}
      options={SEGMENTED_OPTIONS}
      aria-label="Time range"
      className={cn(
        // Companion C3 — "range/tab controls into the room header line": a
        // lifted card pill (faint edge ring + soft shadow) instead of a flat
        // muted well, so this reads as chrome continuing the slim room
        // header above rather than dense-UI filler.
        "inline-flex h-9 w-fit items-center justify-center rounded-lg bg-card p-1 text-muted-foreground ring-1 ring-border/40 shadow-soft",
        className
      )}
      itemClassName={() => "h-[calc(100%-1px)] rounded-md px-3 py-0.5 text-sm font-medium"}
    />
  )
}
