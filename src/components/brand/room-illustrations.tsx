/**
 * Room illustrations — Companion C5A ("rooms that teach"): a small set of
 * hand-crafted, fine line-art engraving scenes for page-level empty states
 * (see src/components/empty-state.tsx's `illustration` prop). Never-repeat
 * rule: each scene is its own distinct composition, no shared layout.
 *
 * Shared visual language (DESIGN_SYSTEM.md tokens-only rule — no hex/raw
 * Tailwind color classes inside any SVG attribute):
 *  - `var(--color-border)` — background/container structure (the counter,
 *    the awning, the tray, the ledger's covers).
 *  - `var(--color-muted-foreground)` — the scene's content/subject elements
 *    (bubbles, grid ticks, entry lines, stars, sheets).
 *  - `var(--color-lamplight)` — exactly ONE accent per scene, the element
 *    that carries the scene's meaning, and the one animated element (via
 *    the shared `lamplight-breathe` / `lamplight-float` keyframes hoisted in
 *    globals.css's C5 block).
 *
 * All strokes: `strokeWidth={1.5}`, round caps/joins, `fill="none"` except
 * the tiny accent fills called out per scene. No emoji, no faces, no
 * AI-blob shapes — semantic objects only. Every `<svg>` is `aria-hidden`
 * (purely decorative, paired with real title/description text in
 * EmptyState) and every animated element carries `motion-reduce:animate-none`.
 */

import type { SVGProps } from "react"

type SceneProps = {
  className?: string
}

const STROKE = 1.5

/** Shared stroke defaults so every scene's <svg> reads identically. */
function svgProps(className: string): SVGProps<SVGSVGElement> {
  return {
    viewBox: "0 0 160 110",
    "aria-hidden": true,
    className,
    fill: "none",
    strokeLinecap: "round",
    strokeLinejoin: "round",
  }
}

/** 5-point star outline centered at (cx, cy), outer radius ~7 * scale. */
function starPath(cx: number, cy: number, scale = 1) {
  const points: [number, number][] = [
    [0, -7],
    [1.6, -2.3],
    [6.7, -2.2],
    [2.7, 0.9],
    [4.1, 5.7],
    [0, 2.8],
    [-4.1, 5.7],
    [-2.7, 0.9],
    [-6.7, -2.2],
    [-1.6, -2.3],
  ]
  const d = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${cx + x * scale},${cy + y * scale}`)
    .join(" ")
  return `${d} Z`
}

/** Inbox — a shop counter with three staggered speech bubbles; the front
 *  bubble carries a lamplight 4-point spark, the scene's animated element. */
export function InboxScene({ className = "w-40" }: SceneProps) {
  return (
    <svg {...svgProps(className)}>
      {/* Counter — background structure */}
      <g stroke="var(--color-border)" strokeWidth={STROKE}>
        <path d="M20,88 H140" />
        <path d="M30,88 V100" />
        <path d="M130,88 V100" />
      </g>

      {/* Back bubble — furthest, smallest, no tail */}
      <rect
        x={98}
        y={12}
        width={28}
        height={18}
        rx={6}
        stroke="var(--color-muted-foreground)"
        strokeWidth={STROKE}
      />

      {/* Middle bubble */}
      <g stroke="var(--color-muted-foreground)" strokeWidth={STROKE}>
        <rect x={60} y={24} width={34} height={22} rx={7} />
        <path d="M72,46 L78,55 L84,46" />
      </g>

      {/* Front bubble — closest to the counter, lamplight, carries the spark */}
      <g stroke="var(--color-lamplight)" strokeWidth={STROKE}>
        <rect x={22} y={40} width={46} height={32} rx={9} />
        <path d="M34,72 L40,82 L48,72" />
      </g>

      {/* The one animated element: a 4-point diamond spark — same form as the
          Loop explainer's bubble spark; crossed diagonals read as an "X"
          (failed message), caught in the visual pass. */}
      <path
        d="M45,48 l2.5,6 6,2.5 -6,2.5 -2.5,6 -2.5,-6 -6,-2.5 6,-2.5 z"
        stroke="var(--color-lamplight)"
        strokeWidth={1.3}
        strokeLinejoin="round"
        className="animate-[lamplight-breathe_2.4s_ease-in-out_infinite] motion-reduce:animate-none"
      />
    </svg>
  )
}

/** Calendar — a tilted month sheet with a light grid of day ticks; one cell
 *  is a filled lamplight accent with a small rising flag, the animated element. */
export function CalendarScene({ className = "w-40" }: SceneProps) {
  const cols = [48, 62, 76, 90, 104]
  const rows = [40, 53, 66, 79]
  // A light suggestion of ~12 day cells (not a full 5x4 grid) — skips the
  // coordinates reserved for the single filled accent cell below.
  const ticks: [number, number][] = [
    [cols[0], rows[0]],
    [cols[1], rows[0]],
    [cols[3], rows[0]],
    [cols[0], rows[1]],
    [cols[4], rows[1]],
    [cols[0], rows[2]],
    [cols[1], rows[2]],
    [cols[3], rows[2]],
    [cols[4], rows[2]],
    [cols[0], rows[3]],
    [cols[1], rows[3]],
    [cols[4], rows[3]],
  ]

  return (
    <svg {...svgProps(className)}>
      <g transform="rotate(-4 80 55)">
        {/* Month sheet — background structure */}
        <g stroke="var(--color-border)" strokeWidth={STROKE}>
          <rect x={35} y={14} width={90} height={78} rx={8} />
          <path d="M35,30 H125" />
          <path d="M55,10 V18" />
          <path d="M105,10 V18" />
        </g>

        {/* Day-cell ticks — the sheet's content, main subject */}
        <g stroke="var(--color-muted-foreground)" strokeWidth={STROKE}>
          {ticks.map(([x, y]) => (
            <path key={`${x}-${y}`} d={`M${x - 4},${y} H${x + 4}`} />
          ))}
        </g>

        {/* The one animated element: a filled lamplight accent cell + flag */}
        <g className="animate-[lamplight-breathe_2.4s_ease-in-out_infinite] motion-reduce:animate-none">
          <rect
            x={72}
            y={50}
            width={10}
            height={7}
            rx={2}
            fill="var(--color-lamplight)"
            fillOpacity={0.25}
            stroke="var(--color-lamplight)"
            strokeWidth={STROKE}
          />
          <path d="M77,50 V40 L83,43 L77,46" stroke="var(--color-lamplight)" strokeWidth={STROKE} />
        </g>
      </g>
    </svg>
  )
}

/** Contacts — an open ledger book with three entry lines per page; the
 *  right page's middle entry is a lamplight avatar dot, the animated element. */
export function ContactsScene({ className = "w-40" }: SceneProps) {
  const rowsY = [40, 55, 70]

  return (
    <svg {...svgProps(className)}>
      {/* Ledger book — background structure */}
      <g stroke="var(--color-border)" strokeWidth={STROKE}>
        <path d="M80,18 C 54,14 28,18 20,28 C 18,52 18,72 20,84 C 28,94 54,97 80,98" />
        <path d="M80,18 C 106,14 132,18 140,28 C 142,52 142,72 140,84 C 132,94 106,97 80,98" />
        <path d="M80,16 V99" />
      </g>

      {/* Left page — three entries, main subject */}
      <g stroke="var(--color-muted-foreground)" strokeWidth={STROKE}>
        {rowsY.map((y) => (
          <g key={`left-${y}`}>
            <circle cx={32} cy={y} r={2.5} />
            <path d={`M40,${y} H68`} />
          </g>
        ))}
      </g>

      {/* Right page — two ordinary entries + one lamplight entry */}
      <g stroke="var(--color-muted-foreground)" strokeWidth={STROKE}>
        <circle cx={98} cy={40} r={2.5} />
        <path d="M106,40 H130" />
        <circle cx={98} cy={70} r={2.5} />
        <path d="M106,70 H130" />
      </g>
      <path d="M106,55 H130" stroke="var(--color-lamplight)" strokeWidth={STROKE} />
      <circle
        cx={98}
        cy={55}
        r={2.5}
        fill="var(--color-lamplight)"
        stroke="var(--color-lamplight)"
        strokeWidth={STROKE}
        className="animate-[lamplight-breathe_2.4s_ease-in-out_infinite] motion-reduce:animate-none"
      />
    </svg>
  )
}

/** Reviews — a scalloped shop awning holding a row of five stars; the
 *  middle star is a lifted lamplight accent, the animated (floating) element. */
export function ReviewsScene({ className = "w-40" }: SceneProps) {
  const starX = [50, 65, 80, 95, 110]

  return (
    <svg {...svgProps(className)}>
      {/* Awning + sign rod — background structure */}
      <g stroke="var(--color-border)" strokeWidth={STROKE}>
        <rect x={30} y={14} width={100} height={18} rx={2} />
        <path d="M30,32 A12.5,10 0 0 0 55,32 A12.5,10 0 0 0 80,32 A12.5,10 0 0 0 105,32 A12.5,10 0 0 0 130,32" />
        <path d="M50,32 V44" />
        <path d="M110,32 V44" />
        <path d="M45,44 H115" />
      </g>

      {/* Four ordinary stars — main subject */}
      {starX
        .filter((x) => x !== 80)
        .map((x) => (
          <g key={x} stroke="var(--color-muted-foreground)" strokeWidth={STROKE}>
            <path d={`M${x},44 V52`} />
            <path d={starPath(x, 63)} />
          </g>
        ))}

      {/* The one animated element: the middle star, lifted 3px, lamplight.
          The static lift lives on an outer <g> because lamplight-float
          animates `transform` — on one element the CSS animation would
          override the presentation attribute and cancel the lift. */}
      <g transform="translate(0 -3)">
        <g
          stroke="var(--color-lamplight)"
          strokeWidth={STROKE}
          className="animate-[lamplight-float_2.4s_ease-in-out_infinite] motion-reduce:animate-none"
        >
          <path d="M80,44 V52" />
          <path d={starPath(80, 63)} />
        </g>
      </g>
    </svg>
  )
}

/** Queue — a paper tray holding three stacked sheets; the top sheet is
 *  lifting out at an angle, lamplight-stroked, the animated (floating) element. */
export function QueueScene({ className = "w-40" }: SceneProps) {
  return (
    <svg {...svgProps(className)}>
      {/* Tray, open box in light perspective — background structure */}
      <g stroke="var(--color-border)" strokeWidth={STROKE}>
        <path d="M30,95 H130" />
        <path d="M30,95 L40,75" />
        <path d="M40,75 H120" />
        <path d="M120,75 L130,95" />
      </g>

      {/* Two resting sheets — main subject */}
      <g stroke="var(--color-muted-foreground)" strokeWidth={STROKE}>
        <rect x={48} y={78} width={64} height={8} rx={2} />
        <rect x={46} y={70} width={68} height={8} rx={2} />
      </g>

      {/* The one animated element: the top sheet lifting out, lamplight.
          Static rotation on an outer <g>, float animation on the inner —
          lamplight-float animates `transform`, which would otherwise
          override the rotate attribute and snap the sheet flat. */}
      <g transform="rotate(-8 80 50)">
        <g
          stroke="var(--color-lamplight)"
          strokeWidth={STROKE}
          className="animate-[lamplight-float_2.4s_ease-in-out_infinite] motion-reduce:animate-none"
        >
          <rect x={42} y={42} width={72} height={20} rx={3} />
          <path d="M52,50 H100" />
          <path d="M52,58 H92" />
        </g>
      </g>
    </svg>
  )
}
