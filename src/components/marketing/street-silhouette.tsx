// Shared "Main Street at dusk" skyline silhouette — used by the hero, final
// CTA, and footer (brand-redesign-plan.md §5.2/§5.13/§5.14). Pure SVG, no
// image asset, deterministic (no Math.random — hand-authored building/window
// layout so server and client render identically and the composition stays
// art-directed rather than noisy).

import { cn } from "@/lib/utils"

interface Building {
  x: number
  width: number
  height: number
  /** Window column/row counts. */
  cols: number
  rows: number
}

const BUILDINGS: Building[] = [
  { x: 0, width: 70, height: 120, cols: 2, rows: 4 },
  { x: 74, width: 50, height: 90, cols: 2, rows: 3 },
  { x: 128, width: 90, height: 150, cols: 3, rows: 5 },
  { x: 222, width: 60, height: 100, cols: 2, rows: 3 },
  { x: 286, width: 80, height: 130, cols: 3, rows: 4 },
  { x: 370, width: 56, height: 95, cols: 2, rows: 3 },
  { x: 430, width: 74, height: 140, cols: 2, rows: 5 },
  { x: 508, width: 64, height: 105, cols: 2, rows: 3 },
  { x: 576, width: 88, height: 145, cols: 3, rows: 5 },
  { x: 668, width: 58, height: 100, cols: 2, rows: 3 },
  { x: 730, width: 70, height: 120, cols: 2, rows: 4 },
]

const VIEW_WIDTH = 800
const VIEW_HEIGHT = 160

/** Deterministic "which windows are lit" pattern — a fixed set of (building index, window index) pairs. */
const LIT_WINDOW_PATTERN = new Set([
  "0-1",
  "0-3",
  "2-2",
  "2-6",
  "3-1",
  "4-2",
  "4-5",
  "6-0",
  "6-4",
  "8-3",
  "8-7",
  "9-1",
  "10-2",
])

interface StreetSilhouetteProps {
  className?: string
  /** "scattered" = several lit amber windows across the street (hero). "single" = every window dark except one (final CTA "your lights, always on"). "dim" = all windows dark (footer base, before link dots). */
  variant?: "scattered" | "single" | "dim"
}

export function StreetSilhouette({ className, variant = "scattered" }: StreetSilhouetteProps) {
  // The "single lit window" lives in the tallest, most central building (index 6) for visual focus.
  const singleLitKey = "6-2"

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      preserveAspectRatio="none"
      className={cn("block w-full", className)}
    >
      {BUILDINGS.map((building, buildingIndex) => {
        const windows = []
        const windowW = building.width / (building.cols * 2.2)
        const windowH = building.height / (building.rows * 2.6)
        for (let row = 0; row < building.rows; row++) {
          for (let col = 0; col < building.cols; col++) {
            const key = `${buildingIndex}-${row * building.cols + col}`
            const lit = variant === "scattered" ? LIT_WINDOW_PATTERN.has(key) : variant === "single" ? key === singleLitKey : false
            const wx =
              building.x +
              building.width / (building.cols + 1) * (col + 1) -
              windowW / 2
            const wy = VIEW_HEIGHT - building.height + (building.height / (building.rows + 1)) * (row + 1) - windowH / 2
            windows.push(
              <rect
                key={key}
                x={wx}
                y={wy}
                width={windowW}
                height={windowH}
                rx={0.6}
                className={lit ? "fill-amber-glow" : "fill-background/15"}
                style={lit ? { filter: "drop-shadow(0 0 3px var(--amber-glow))" } : undefined}
              />
            )
          }
        }
        return (
          <g key={buildingIndex}>
            <rect
              x={building.x}
              y={VIEW_HEIGHT - building.height}
              width={building.width}
              height={building.height}
              className="fill-card"
            />
            {windows}
          </g>
        )
      })}
    </svg>
  )
}
