// FOOTER — landing-copy.md "FOOTER". Light paper register (owner-approved
// light-first flip): espresso text on the paper background, and a thin
// line-art skyline strip (1.5px ink strokes at ~30%, a handful of amber
// window accents) instead of the full-bleed dusk StreetSilhouette. This
// strip is intentionally its own small local component rather than a new
// StreetSilhouette variant — street-silhouette.tsx is owned by another
// agent this pass — but it echoes the same hand-placed, deterministic
// building layout so the footer still reads as "the same street."

import Link from "next/link"

import { Wordmark } from "./wordmark"

const LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#faq", label: "FAQ" },
  { href: "/privacy", label: "Privacy" },
  { href: "mailto:hello@lumina.app", label: "hello@lumina.app" },
]

export function MarketingFooter() {
  return (
    <footer id="footer" data-scene="footer" className="bg-background">
      <div className="mx-auto max-w-6xl px-4 pt-12 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center gap-6 pb-10 text-center sm:flex-row sm:justify-between sm:text-left">
          <div>
            <Wordmark className="text-base text-foreground" />
            <p className="mt-1.5 text-sm text-muted-foreground">Lumina — built for main street.</p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 rounded-sm"
              >
                <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-amber-glow shadow-[0_0_4px_var(--amber-glow)]" />
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
      <FooterSkylineStrip />
    </footer>
  )
}

/** Building outline (x, width, height) — deterministic, hand-placed to loosely echo street-silhouette.tsx's skyline rhythm at a much thinner scale. */
const STRIP_BUILDINGS: Array<{ x: number; width: number; height: number }> = [
  { x: 4, width: 44, height: 30 },
  { x: 56, width: 34, height: 20 },
  { x: 98, width: 52, height: 40 },
  { x: 158, width: 32, height: 24 },
  { x: 198, width: 46, height: 34 },
  { x: 252, width: 30, height: 18 },
  { x: 290, width: 48, height: 36 },
  { x: 346, width: 34, height: 22 },
  { x: 388, width: 50, height: 38 },
  { x: 446, width: 32, height: 20 },
  { x: 486, width: 40, height: 28 },
]

/** (building index, offset-x-within-building, offset-y-from-baseline) — 3 tiny amber "lit window" accents scattered across the strip. The middle entry (building 4, roughly the strip's geometric center) is the "outshining" one — Track E's street-spec.md echo at this tiny scale: brighter + slightly larger than its neighbors. */
const LIT_ACCENTS: Array<{ building: number; dx: number; dy: number; center?: boolean }> = [
  { building: 2, dx: 22, dy: -22 },
  { building: 4, dx: 18, dy: -18, center: true },
  { building: 8, dx: 24, dy: -20 },
]

/** (building index, offset-x-within-building, offset-y-from-baseline) — 2 micro "✕" marks on unlit buildings, echoing street-spec.md's negation-cue language at strip scale. Deliberately tiny (compact, "administrative not sad") and plain ink — no text fits at this size. */
const X_MARKS: Array<{ building: number; dx: number; dy: number }> = [
  { building: 0, dx: 30, dy: -22 },
  { building: 9, dx: 20, dy: -12 },
]

const STRIP_VIEW_WIDTH = 540
const STRIP_VIEW_HEIGHT = 42
const STRIP_BASELINE = STRIP_VIEW_HEIGHT

function FooterSkylineStrip() {
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${STRIP_VIEW_WIDTH} ${STRIP_VIEW_HEIGHT}`}
      preserveAspectRatio="none"
      className="block h-9 w-full sm:h-11"
    >
      <g
        className="text-foreground/30"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
      >
        {STRIP_BUILDINGS.map((building, index) => (
          <rect
            key={index}
            x={building.x}
            y={STRIP_BASELINE - building.height}
            width={building.width}
            height={building.height}
          />
        ))}
      </g>
      <g className="text-foreground/35" stroke="currentColor" strokeWidth={0.9} strokeLinecap="round">
        {X_MARKS.map((mark, index) => {
          const building = STRIP_BUILDINGS[mark.building]
          const cx = building.x + mark.dx
          const cy = STRIP_BASELINE + mark.dy
          const r = 1.8
          return (
            <g key={index}>
              <line x1={cx - r} y1={cy - r} x2={cx + r} y2={cy + r} />
              <line x1={cx + r} y1={cy - r} x2={cx - r} y2={cy + r} />
            </g>
          )
        })}
      </g>
      {LIT_ACCENTS.map((accent, index) => {
        const building = STRIP_BUILDINGS[accent.building]
        const size = accent.center ? 6 : 4
        return (
          <rect
            key={index}
            x={building.x + accent.dx - (accent.center ? (size - 4) / 2 : 0)}
            y={STRIP_BASELINE + accent.dy - (accent.center ? (size - 4) / 2 : 0)}
            width={size}
            height={size}
            rx={0.8}
            className="fill-amber-glow"
            style={{
              filter: accent.center
                ? "drop-shadow(0 0 2px var(--amber-glow)) drop-shadow(0 0 5px var(--amber-glow))"
                : "drop-shadow(0 0 2px var(--amber-glow))",
              opacity: accent.center ? 1 : 0.85,
            }}
          />
        )
      })}
    </svg>
  )
}
