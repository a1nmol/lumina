import { cn } from "@/lib/utils"

/**
 * TimeStamp — the "7:00 AM" section-header device from the Main Street at
 * Dusk landing story (docs/design-briefs/brand-redesign-plan.md §5 micro-
 * signatures: "section headers get a tiny time-of-day stamp"). Purely
 * presentational: callers pass the literal label for the scene they're
 * building (this is not a live clock — that's `sonner.tsx`'s receipt
 * header). Not wired into any screen yet; ships ahead of the landing page
 * sections that will use it.
 */
interface TimeStampProps {
  /** e.g. "7:00 AM", "11 PM", "6:45 AM" */
  label: string
  /** amber-glow = ambient/daylight scenes (default); flame = decisive/CTA-adjacent moments */
  tone?: "amber" | "flame"
  className?: string
}

export function TimeStamp({ label, tone = "amber", className }: TimeStampProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center font-mono text-xs font-medium tracking-[0.2em] uppercase",
        tone === "amber" ? "text-amber-glow" : "text-flame",
        className
      )}
    >
      {label}
    </span>
  )
}
