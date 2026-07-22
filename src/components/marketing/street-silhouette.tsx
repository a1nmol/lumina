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

/** Deterministic "which windows are lit" pattern — a fixed set of (building index, window index) pairs. Reused by the "line" variant below as its sparse set of "which windows get outlined panes" — same rhythm, different treatment. */
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

/** "line" variant only — the daylight hero's Main Street strip: outlined
 * buildings, a couple of scalloped awnings, and one door with the OPEN sign
 * (the strip's single amber accent). Buildings chosen for visual balance
 * across the 800-unit viewBox. */
const LINE_DOOR_BUILDING_INDEX = 6
const LINE_AWNING_BUILDING_INDICES = [2, 8]

const INK_LINE_STYLE = { stroke: "var(--ink)", strokeOpacity: 0.35 } as const

interface StreetSilhouetteProps {
  className?: string
  /** "scattered" = several lit amber windows across the street (hero, pre-daylight-flip; still used by night scenes elsewhere on the page). "single" = every window dark except one (final CTA "your lights, always on"). "dim" = all windows dark (footer base, before link dots). "line" = fine espresso line-art (no fill), daylight hero backdrop — outlined buildings, a couple of awnings, one door + OPEN sign. */
  variant?: "scattered" | "single" | "dim" | "line"
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
      {variant === "line"
        ? renderLineArtStreet()
        : BUILDINGS.map((building, buildingIndex) => {
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

/** Renders the "line" variant's outlined-building panes for a sparse subset
 * of windows (the same LIT_WINDOW_PATTERN keys used elsewhere for lit
 * windows) — a stroke-only rect plus a cross mullion per pane. */
function renderWindowPanes() {
  const panes: React.ReactNode[] = []
  BUILDINGS.forEach((building, buildingIndex) => {
    const windowW = building.width / (building.cols * 2.2)
    const windowH = building.height / (building.rows * 2.6)
    for (let row = 0; row < building.rows; row++) {
      for (let col = 0; col < building.cols; col++) {
        const key = `${buildingIndex}-${row * building.cols + col}`
        if (!LIT_WINDOW_PATTERN.has(key)) continue
        const wx = building.x + (building.width / (building.cols + 1)) * (col + 1) - windowW / 2
        const wy =
          VIEW_HEIGHT - building.height + (building.height / (building.rows + 1)) * (row + 1) - windowH / 2
        panes.push(
          <g key={key}>
            <rect x={wx} y={wy} width={windowW} height={windowH} rx={0.5} fill="none" strokeWidth={1} style={INK_LINE_STYLE} />
            <line x1={wx + windowW / 2} y1={wy} x2={wx + windowW / 2} y2={wy + windowH} strokeWidth={0.75} style={INK_LINE_STYLE} />
            <line x1={wx} y1={wy + windowH / 2} x2={wx + windowW} y2={wy + windowH / 2} strokeWidth={0.75} style={INK_LINE_STYLE} />
          </g>
        )
      }
    }
  })
  return panes
}

/** A small scalloped-edge awning over one building's ground floor. */
function LineAwning({ building }: { building: Building }) {
  const x = building.x + 6
  const width = building.width - 12
  const roofY = VIEW_HEIGHT - 44
  const roofH = 6
  const teeth = 4
  const toothW = width / teeth
  const points: string[] = [`${x},${roofY + roofH}`]
  for (let i = 0; i < teeth; i += 1) {
    const tx = x + i * toothW
    points.push(`${tx + toothW / 2},${roofY + roofH + 5}`)
    points.push(`${tx + toothW},${roofY + roofH}`)
  }
  return (
    <g>
      <rect x={x} y={roofY} width={width} height={roofH} fill="none" strokeWidth={1.2} style={INK_LINE_STYLE} />
      <polyline points={points.join(" ")} fill="none" strokeWidth={1.2} strokeLinejoin="round" style={INK_LINE_STYLE} />
    </g>
  )
}

/** The one door in the line-art strip, topped with the small OPEN sign — the
 * scene's single amber accent (brand-redesign-plan.md §3 amber-glow rule). */
function LineDoor({ building }: { building: Building }) {
  const doorW = 14
  const doorH = 30
  const cx = building.x + building.width / 2
  const doorX = cx - doorW / 2
  const doorY = VIEW_HEIGHT - doorH
  const signW = 30
  const signH = 12
  const signX = cx - signW / 2
  const signY = doorY - 20

  return (
    <g>
      <rect x={doorX} y={doorY} width={doorW} height={doorH} rx={2} fill="none" strokeWidth={1.4} style={INK_LINE_STYLE} />
      <line x1={cx} y1={doorY} x2={cx} y2={doorY + doorH} strokeWidth={1} style={INK_LINE_STYLE} />
      <circle cx={cx + doorW / 2 - 2.5} cy={doorY + doorH / 2} r={0.9} style={{ fill: "var(--ink)", opacity: 0.35 }} />
      {/* .sign-buzz-soft: same neon-flicker shape as the night scenes' .sign-buzz, stretched to a slower/quieter cadence for the daylight hero (globals.css). */}
      <g className="sign-buzz-soft" style={{ filter: "drop-shadow(0 0 3px var(--amber-glow))" }}>
        <rect x={signX} y={signY} width={signW} height={signH} rx={2.5} style={{ fill: "var(--amber-glow)", opacity: 0.16 }} />
        <rect x={signX} y={signY} width={signW} height={signH} rx={2.5} fill="none" strokeWidth={1} style={{ stroke: "var(--amber-glow)", opacity: 0.75 }} />
        <text
          x={cx}
          y={signY + signH / 2 + 2.4}
          textAnchor="middle"
          style={{ fill: "var(--amber-glow)", fontFamily: "var(--font-mono)", fontSize: 6.5, letterSpacing: "0.05em" }}
        >
          OPEN
        </text>
      </g>
    </g>
  )
}

function renderLineArtStreet() {
  return (
    <>
      {BUILDINGS.map((building, buildingIndex) => (
        <rect
          key={buildingIndex}
          x={building.x}
          y={VIEW_HEIGHT - building.height}
          width={building.width}
          height={building.height}
          fill="none"
          strokeWidth={1.5}
          style={INK_LINE_STYLE}
        />
      ))}
      {renderWindowPanes()}
      {LINE_AWNING_BUILDING_INDICES.map((index) => (
        <LineAwning key={index} building={BUILDINGS[index]} />
      ))}
      <LineDoor building={BUILDINGS[LINE_DOOR_BUILDING_INDEX]} />
    </>
  )
}
