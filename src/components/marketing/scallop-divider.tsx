// Awning-scallop section separator — brand-redesign-plan.md §3/§5 "awning"
// motif, requested by the light-first landing flip: a very subtle scalloped
// trim line (like the fabric edge of a shop awning) between major sections,
// built from a single repeating CSS radial-gradient — no image asset, no
// extra markup weight. Purely decorative (aria-hidden, role="presentation"):
// the section landmarks on either side already carry the real document
// structure, so this never needs to announce anything to assistive tech.

import { cn } from "@/lib/utils"

const SCALLOP_TILE_PX = 24
const SCALLOP_HEIGHT_PX = 16

interface ScallopDividerProps {
  className?: string
}

export function ScallopDivider({ className }: ScallopDividerProps) {
  return (
    <div
      aria-hidden="true"
      role="presentation"
      data-scene="scallop-divider"
      className={cn("relative w-full overflow-hidden bg-background", className)}
      style={{ height: `${SCALLOP_HEIGHT_PX}px` }}
    >
      <div
        className="absolute inset-x-0 top-0"
        style={{
          height: `${SCALLOP_HEIGHT_PX}px`,
          // Each tile draws a thin ring arc (radius 7-8px) centered just
          // above the strip — only the bottom of the ring falls inside the
          // 16px box, reading as a repeating scalloped trim. 1px-thick ring,
          // ink at 15% via color-mix so it stays a whisper, never a hairline
          // that competes with real content.
          backgroundImage:
            "repeating-radial-gradient(circle at 12px 0, transparent 0 7px, color-mix(in oklch, var(--foreground) 15%, transparent) 7px 8px, transparent 8px 12px)",
          backgroundSize: `${SCALLOP_TILE_PX}px ${SCALLOP_HEIGHT_PX}px`,
          backgroundRepeat: "repeat-x",
        }}
      />
    </div>
  )
}
