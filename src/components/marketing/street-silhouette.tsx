"use client"

// Shared "Main Street at dusk" skyline silhouette — used by the hero, final
// CTA, and footer (brand-redesign-plan.md §5.2/§5.13/§5.14). Pure SVG, no
// image asset, deterministic (no Math.random — hand-authored building/window
// layout so server and client render identically and the composition stays
// art-directed rather than noisy).
//
// "main-street" variant (Track E, docs/design-briefs/street-spec.md) is the
// illustrated 7-shop row — every shop but the center café is visibly
// missing something (a closed sign, a missed call, a dead feed, a blank
// calendar), the café glows and wins. Needs Framer Motion for the
// SignBubble's one-time scroll-triggered entrance, hence "use client" —
// every existing consumer (hero/final-cta/footer) already renders
// client-side, so this is not a new server/client boundary.

import { motion, useReducedMotion } from "framer-motion"

import { duration, easing } from "@/lib/motion"
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

/** "line" variant's own baseline — taller than the shared VIEW_HEIGHT (kept
 * separate so the scattered/single/dim variants above are untouched) to make
 * room for the per-shop story labels added below. The buildings still sit on
 * the same 800-unit-wide street, just with more sky headroom for signage. */
const LINE_BASELINE = 200

const INK_LINE_STYLE = { stroke: "var(--ink)", strokeOpacity: 0.35 } as const

interface StreetSilhouetteProps {
  className?: string
  /** "scattered" = several lit amber windows across the street (hero, pre-daylight-flip; still used by night scenes elsewhere on the page). "single" = every window dark except one (final CTA "your lights, always on"). "dim" = all windows dark (footer base, before link dots). "line" = fine espresso line-art (no fill), daylight hero backdrop — outlined buildings, a couple of awnings, one door + OPEN sign. "main-street" = the illustrated 7-shop row (Track E) — every shop but the center café missing something, café glowing and winning; used at final-cta's full scene-locked render. */
  variant?: "scattered" | "single" | "dim" | "line" | "main-street"
}

export function StreetSilhouette({ className, variant = "scattered" }: StreetSilhouetteProps) {
  // The "single lit window" lives in the tallest, most central building (index 6) for visual focus.
  const singleLitKey = "6-2"

  if (variant === "main-street") {
    return <MainStreet className={className} />
  }

  if (variant === "line") {
    return <LineArtStreet className={className} />
  }

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
          LINE_BASELINE - building.height + (building.height / (building.rows + 1)) * (row + 1) - windowH / 2
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
  const roofY = LINE_BASELINE - 44
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
  const doorY = LINE_BASELINE - doorH
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
          y={LINE_BASELINE - building.height}
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
      {renderLineShopStories()}
    </>
  )
}

/** Line-variant 7-shop story — same shops/order as the main-street
 * composition, mapped onto 7 of the 11 outline buildings (chosen for spacing
 * so neighbouring labels don't collide; #6 is the existing door/OPEN
 * building). Quieter register than main-street: no plaque boxes, small ink
 * text, one small stroke-only glyph per lacking shop — the café gets no
 * glyph (its door + OPEN sign already carry that role) plus its own
 * full-opacity, amber-accented line. */
interface LineShopStory {
  buildingIndex: number
  lines: string[]
  icon?: "person" | "phone" | "ghost" | "calendar" | "speech"
  emphasis?: boolean
}

const LINE_SHOP_STORIES: LineShopStory[] = [
  { buildingIndex: 0, lines: ["Closed since 6"] },
  { buildingIndex: 2, lines: ["On vacation —", "back Monday"], icon: "person" },
  { buildingIndex: 4, lines: ["Family emergency —", "couldn't pick up"], icon: "phone" },
  { buildingIndex: LINE_DOOR_BUILDING_INDEX, lines: ["Open 24/7 —", "we use Lumina."], emphasis: true },
  { buildingIndex: 7, lines: ["Haven't posted", "in months"], icon: "ghost" },
  { buildingIndex: 8, lines: ["No idea what's", "booked"], icon: "calendar" },
  { buildingIndex: 10, lines: ["Closed 6 PM —", "DMs waiting"], icon: "speech" },
]

/** Tiny stroke-only glyphs, ~0.5x the main-street versions — bottom-anchored
 * at `bottomY`, centered at `cx`. Same shapes as the main-street cues
 * (waiting customer / phone / dead-feed ghost card / blank calendar /
 * queued DM) so the two scenes read as one family. */
function LineTinyIcon({ kind, cx, bottomY }: { kind: NonNullable<LineShopStory["icon"]>; cx: number; bottomY: number }) {
  switch (kind) {
    case "person": {
      const bodyW = 5.5
      const bodyH = 9
      const headR = 2.3
      const headCy = bottomY - bodyH - headR
      return (
        <g>
          <circle cx={cx} cy={headCy} r={headR} fill="none" strokeWidth={0.7} style={INK_LINE_STYLE} />
          <rect x={cx - bodyW / 2} y={headCy + headR} width={bodyW} height={bodyH} rx={bodyW / 2} fill="none" strokeWidth={0.7} style={INK_LINE_STYLE} />
        </g>
      )
    }
    case "phone": {
      const s = 3
      return (
        <g>
          <rect x={cx - 6} y={bottomY - 8.5} width={s} height={s} rx={0.6} fill="none" strokeWidth={0.6} style={INK_LINE_STYLE} />
          <rect x={cx + 3} y={bottomY - 3.5} width={s} height={s} rx={0.6} fill="none" strokeWidth={0.6} style={INK_LINE_STYLE} />
          <line x1={cx - 4.5} y1={bottomY - 7} x2={cx + 4.5} y2={bottomY - 2} strokeWidth={0.6} style={INK_LINE_STYLE} />
        </g>
      )
    }
    case "ghost": {
      const w = 15
      const h = 11
      return (
        <rect x={cx - w / 2} y={bottomY - h} width={w} height={h} rx={1.5} fill="none" strokeWidth={0.6} strokeDasharray="1.5 1.5" style={INK_LINE_STYLE} />
      )
    }
    case "calendar": {
      const w = 16
      const h = 12
      const x = cx - w / 2
      const y = bottomY - h
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} rx={1} fill="none" strokeWidth={0.6} style={INK_LINE_STYLE} />
          <line x1={x} y1={y + 3.5} x2={x + w} y2={y + 3.5} strokeWidth={0.6} style={INK_LINE_STYLE} />
          <line x1={x + w / 2} y1={y + 3.5} x2={x + w / 2} y2={y + h} strokeWidth={0.5} style={INK_LINE_STYLE} />
        </g>
      )
    }
    case "speech": {
      const w = 13
      const h = 9
      const x = cx - w / 2
      const y = bottomY - h
      return <rect x={x} y={y} width={w} height={h} rx={1.5} fill="none" strokeWidth={0.6} style={INK_LINE_STYLE} />
    }
  }
}

/** Renders each story's icon (if any) + 1-2 line caption, stacked in the
 * sky above that shop's own roofline — a consistent gap/rhythm across all 7
 * shops even though roof heights differ. */
function renderLineShopStories() {
  const labelLineHeight = 8.5
  const roofGap = 8
  const iconGap = 6

  return LINE_SHOP_STORIES.map((story) => {
    const building = BUILDINGS[story.buildingIndex]
    const cx = building.x + building.width / 2
    const roofTop = LINE_BASELINE - building.height
    const labelBottomY = roofTop - roofGap
    const labelTopY = labelBottomY - (story.lines.length - 1) * labelLineHeight
    const iconBottomY = labelTopY - iconGap

    const textStyle = story.emphasis
      ? { fill: "var(--amber-glow)", fontFamily: "var(--font-sans)", fontSize: 7.5, fontWeight: 600, letterSpacing: "0.01em" }
      : { fill: "var(--ink)", fillOpacity: 0.6, fontFamily: "var(--font-sans)", fontSize: 7, letterSpacing: "0.01em" }

    return (
      <g key={story.buildingIndex} style={story.emphasis ? { filter: "drop-shadow(0 0 3px var(--amber-glow))" } : undefined}>
        {story.icon && <LineTinyIcon kind={story.icon} cx={cx} bottomY={iconBottomY} />}
        {story.lines.map((line, i) => (
          <text key={i} x={cx} y={labelTopY + i * labelLineHeight} textAnchor="middle" style={textStyle}>
            {line}
          </text>
        ))}
      </g>
    )
  })
}

/** Wrapper for the "line" variant — same illustration as before plus the
 * 7-shop story text, so (unlike the bare `<svg>` the other window-grid
 * variants render) it needs a sibling `sr-only` paragraph the way
 * `MainStreet` below already has one. */
function LineArtStreet({ className }: { className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <svg aria-hidden="true" viewBox={`0 0 ${VIEW_WIDTH} ${LINE_BASELINE}`} preserveAspectRatio="none" className="block h-full w-full">
        {renderLineArtStreet()}
      </svg>
      <p className="sr-only">
        Illustration: seven shops along Main Street, each with a small sign explaining what it&apos;s missing —
        closed since six, on vacation, a missed family-emergency call, months without a post, no idea what&apos;s
        booked, or closed at six with messages still waiting. The centre shop stays open 24/7, always answering,
        because it uses Lumina.
      </p>
    </div>
  )
}

/* ---------------------------------------------------------------------
   "main-street" variant — the illustrated 7-shop Main Street row
   (docs/design-briefs/street-spec.md). One flat-ink line-art street: the
   ONLY color/glow in the whole scene belongs to the center café (shop #4,
   "the Lumina shop") — every other shop stays plain ink and carries
   exactly one negation cue (a single muted prop, sometimes paired with one
   ✕ chip) that reads as administrative, not sad. Own coordinate space
   (wider/taller viewBox than the other variants) since this composition
   needs real headroom for signage + the café's SignBubble above its
   roofline — kept as a separate constant block rather than reusing
   BUILDINGS/VIEW_WIDTH/VIEW_HEIGHT above, which are tuned for the
   window-grid variants and the "line" hero strip. Rect/circle/line/
   polyline/text primitives only — no freehand <path>, no images. */

const MAIN_STREET_VIEW_WIDTH = 900
/** Grew taller (was 230) so every lacking shop has real sky headroom for its
 * own sign-plaque label above the roofline, without crowding the café's
 * SignBubble. */
const MAIN_STREET_VIEW_HEIGHT = 270
/** Sidewalk/street level — every building rect sits on this line. Raised
 * (was 205) alongside the taller viewBox so the extra height mostly becomes
 * sky headroom, not empty sidewalk. */
const MAIN_STREET_BASELINE = 235

interface MainStreetShop {
  x: number
  width: number
  height: number
}

/** Left → right, center = café (shop #4 of 7). Widths/heights hand-tuned
 * for a musical skyline rhythm (no repeating grid) rather than uniform
 * spacing — the café is deliberately the widest AND tallest silhouette. */
const MAIN_STREET_SHOPS: Record<
  "bakery" | "salon" | "plumber" | "cafe" | "florist" | "barber" | "hardware",
  MainStreetShop
> = {
  bakery: { x: 60, width: 94, height: 112 },
  salon: { x: 166, width: 76, height: 134 },
  plumber: { x: 254, width: 90, height: 98 },
  cafe: { x: 356, width: 148, height: 158 },
  florist: { x: 516, width: 80, height: 118 },
  barber: { x: 608, width: 96, height: 90 },
  hardware: { x: 716, width: 108, height: 128 },
}

/** Silhouette/feature ink — a touch bolder than the hero's subtle
 * INK_LINE_STYLE since this illustration renders larger and carries more
 * detail per shop. */
const SHOP_INK = { stroke: "var(--ink)", strokeOpacity: 0.5 } as const
/** Negation-cue ink — "muted ink / desaturation", never a second accent
 * hue (street-spec.md craft rule). */
const SHOP_INK_MUTED = { stroke: "var(--ink)", strokeOpacity: 0.3 } as const

function ShopBuilding({ shop }: { shop: MainStreetShop }) {
  return (
    <rect
      x={shop.x}
      y={MAIN_STREET_BASELINE - shop.height}
      width={shop.width}
      height={shop.height}
      fill="none"
      strokeWidth={1.5}
      style={SHOP_INK}
    />
  )
}

function ShopDoor({ shop }: { shop: MainStreetShop }) {
  const doorW = 15
  const doorH = 32
  const cx = shop.x + shop.width / 2
  const doorX = cx - doorW / 2
  const doorY = MAIN_STREET_BASELINE - doorH
  return (
    <g>
      <rect x={doorX} y={doorY} width={doorW} height={doorH} rx={1.5} fill="none" strokeWidth={1} style={SHOP_INK} />
      <line x1={cx} y1={doorY} x2={cx} y2={doorY + doorH} strokeWidth={0.75} style={SHOP_INK} />
      <circle cx={cx + doorW / 2 - 2.5} cy={doorY + doorH / 2} r={0.9} style={{ fill: "var(--ink)", opacity: 0.45 }} />
    </g>
  )
}

/** One short, human sign-plaque per lacking shop — a small card (rect +
 * centered text, 1-2 lines) sitting a consistent gap above that shop's own
 * roofline. Replaces ambiguity, not adds clutter: pairs with the shop's one
 * existing icon/negation cue rather than introducing a second one. Muted ink
 * only (never a second accent hue), so hierarchy stays "café brightest,
 * every lacking shop quiet" per the craft rule above. */
function ShopLabel({ shop, lines }: { shop: MainStreetShop; lines: string[] }) {
  const cx = shop.x + shop.width / 2
  const roofTop = MAIN_STREET_BASELINE - shop.height
  const fontSize = 8
  const lineHeight = 10.5
  const paddingX = 6
  const paddingY = 4.5
  const boxW = Math.max(...lines.map((line) => line.length * fontSize * 0.56)) + paddingX * 2
  const boxH = lines.length * lineHeight + paddingY * 2 - (lineHeight - fontSize)
  const boxY = roofTop - 11 - boxH
  const boxX = cx - boxW / 2
  return (
    <g>
      <rect x={boxX} y={boxY} width={boxW} height={boxH} rx={3} className="fill-card" stroke="var(--ink)" strokeOpacity={0.15} strokeWidth={0.75} />
      {lines.map((line, i) => (
        <text
          key={i}
          x={cx}
          y={boxY + paddingY + fontSize * 0.74 + i * lineHeight}
          textAnchor="middle"
          style={{ fill: "var(--ink)", fillOpacity: 0.66, fontFamily: "var(--font-sans)", fontSize, letterSpacing: "0.005em" }}
        >
          {line}
        </text>
      ))}
    </g>
  )
}

/** Small negation "✕" chip — 15 units (≈16-20px at this composition's
 * typical render scale), low-saturation ink only, never a second hue. */
function XChip({ cx, cy, size = 15 }: { cx: number; cy: number; size?: number }) {
  const r = size / 2
  const pad = size * 0.3
  const x = cx - r
  const y = cy - r
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} className="fill-card" stroke="var(--ink)" strokeOpacity={0.35} strokeWidth={1} />
      <line x1={x + pad} y1={y + pad} x2={x + size - pad} y2={y + size - pad} strokeWidth={1} strokeLinecap="round" stroke="var(--ink)" strokeOpacity={0.6} />
      <line x1={x + size - pad} y1={y + pad} x2={x + pad} y2={y + size - pad} strokeWidth={1} strokeLinecap="round" stroke="var(--ink)" strokeOpacity={0.6} />
    </g>
  )
}

/** The café's one accent glyph — a green "✓" chip (posts/replies/bookings,
 * three placed above the awning). Belongs entirely to the one shop allowed
 * color, so this doesn't read as a second brand hue on a lacking shop. */
function CheckChip({ cx, cy, size = 14 }: { cx: number; cy: number; size?: number }) {
  const r = size / 2
  const x = cx - r
  const y = cy - r
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} className="fill-success" style={{ opacity: 0.2 }} />
      <circle cx={cx} cy={cy} r={r} fill="none" className="stroke-success" strokeWidth={1} />
      <polyline
        points={`${x + size * 0.24},${y + size * 0.52} ${x + size * 0.42},${y + size * 0.7} ${x + size * 0.78},${y + size * 0.28}`}
        fill="none"
        className="stroke-success"
        strokeWidth={1.3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  )
}

/** 1. Bakery — a CLOSED placard taped above the door. Muted ink only, no glow/buzz. */
function BakerySign({ shop }: { shop: MainStreetShop }) {
  const cx = shop.x + shop.width / 2
  const doorY = MAIN_STREET_BASELINE - 32
  const signW = 27
  const signH = 10
  const signX = cx - signW / 2
  const signY = doorY - 16
  return (
    <g>
      <rect x={signX} y={signY} width={signW} height={signH} rx={1} className="fill-card" strokeWidth={0.75} style={SHOP_INK_MUTED} />
      <text
        x={cx}
        y={signY + signH / 2 + 2.1}
        textAnchor="middle"
        style={{ fill: "var(--ink)", fillOpacity: 0.55, fontFamily: "var(--font-mono)", fontSize: 5.2, letterSpacing: "0.03em" }}
      >
        CLOSED
      </text>
    </g>
  )
}

/** 2. Salon — a waiting customer silhouette (simple head + body) standing at the door. */
function WaitingCustomer({ cx }: { cx: number }) {
  const bodyW = 8
  const bodyH = 16
  const headR = 3.6
  const headCy = MAIN_STREET_BASELINE - bodyH - headR
  return (
    <g>
      <circle cx={cx} cy={headCy} r={headR} fill="none" strokeWidth={1} style={SHOP_INK_MUTED} />
      <rect x={cx - bodyW / 2} y={headCy + headR} width={bodyW} height={bodyH} rx={bodyW / 2} fill="none" strokeWidth={1} style={SHOP_INK_MUTED} />
    </g>
  )
}

/** 3. Plumber — a tiny wall-mounted phone glyph inside a small sign plaque. */
function PhoneGlyph({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x} y={y} width={4} height={4} rx={1} fill="none" strokeWidth={0.75} style={SHOP_INK_MUTED} />
      <rect x={x + 6} y={y + 6} width={4} height={4} rx={1} fill="none" strokeWidth={0.75} style={SHOP_INK_MUTED} />
      <line x1={x + 2} y1={y + 2} x2={x + 8} y2={y + 8} strokeWidth={0.75} style={SHOP_INK_MUTED} />
    </g>
  )
}

function PlumberSign({ shop }: { shop: MainStreetShop }) {
  const cx = shop.x + shop.width / 2
  const doorY = MAIN_STREET_BASELINE - 32
  const signW = 22
  const signH = 16
  const signX = cx - signW / 2
  const signY = doorY - 22
  return (
    <g>
      <rect x={signX} y={signY} width={signW} height={signH} rx={1.5} className="fill-card" strokeWidth={0.75} style={SHOP_INK_MUTED} />
      <PhoneGlyph x={signX + signW / 2 - 5} y={signY + signH / 2 - 5} />
    </g>
  )
}

/** 5. Florist — a dead-feed "ghost card": dashed outline, no content. */
function DashedGhostCard({ shop }: { shop: MainStreetShop }) {
  const cx = shop.x + shop.width / 2
  const w = 26
  const h = 20
  const x = cx - w / 2
  const y = MAIN_STREET_BASELINE - shop.height * 0.58
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={2} fill="none" strokeWidth={1} strokeDasharray="2.5 2.5" style={SHOP_INK_MUTED} />
      <line x1={x + 5} y1={y + h - 5} x2={x + w - 5} y2={y + 5} strokeWidth={0.75} strokeDasharray="1.5 1.5" style={SHOP_INK_MUTED} />
    </g>
  )
}

/** 6. Barber — a blank calendar grid, every cell empty. */
function BlankCalendarGrid({ shop }: { shop: MainStreetShop }) {
  const cx = shop.x + shop.width / 2
  const w = 28
  const h = 22
  const x = cx - w / 2
  const y = MAIN_STREET_BASELINE - shop.height * 0.68
  const cols = 3
  const rows = 2
  const cellW = w / cols
  const cellH = (h - 5) / rows
  const gridLines = []
  for (let c = 1; c < cols; c += 1) {
    gridLines.push(
      <line key={`c${c}`} x1={x + c * cellW} y1={y + 5} x2={x + c * cellW} y2={y + h} strokeWidth={0.75} style={SHOP_INK_MUTED} />
    )
  }
  for (let r = 1; r < rows; r += 1) {
    gridLines.push(
      <line key={`r${r}`} x1={x} y1={y + 5 + r * cellH} x2={x + w} y2={y + 5 + r * cellH} strokeWidth={0.75} style={SHOP_INK_MUTED} />
    )
  }
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={1.5} fill="none" strokeWidth={1} style={SHOP_INK_MUTED} />
      <line x1={x} y1={y + 5} x2={x + w} y2={y + 5} strokeWidth={1} style={SHOP_INK_MUTED} />
      {gridLines}
    </g>
  )
}

/** 7. Hardware — "closed 6 PM" placard + two empty speech-bubble outlines queued at the door. */
function HardwareSign({ shop }: { shop: MainStreetShop }) {
  const cx = shop.x + shop.width / 2
  const doorY = MAIN_STREET_BASELINE - 32
  const signW = 42
  const signH = 11
  const signX = cx - signW / 2
  const signY = doorY - 18
  return (
    <g>
      <rect x={signX} y={signY} width={signW} height={signH} rx={1} className="fill-card" strokeWidth={0.75} style={SHOP_INK_MUTED} />
      <text
        x={cx}
        y={signY + signH / 2 + 2.1}
        textAnchor="middle"
        style={{ fill: "var(--ink)", fillOpacity: 0.55, fontFamily: "var(--font-mono)", fontSize: 5.2, letterSpacing: "0.02em" }}
      >
        CLOSED 6PM
      </text>
    </g>
  )
}

function SpeechBubbleOutline({ x, y, w = 15, h = 10 }: { x: number; y: number; w?: number; h?: number }) {
  const tailSize = 3.5
  const tailX = x + w * 0.22
  const tailY = y + h - tailSize / 2
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={2} fill="none" strokeWidth={0.75} style={SHOP_INK_MUTED} />
      <rect
        x={tailX}
        y={tailY}
        width={tailSize}
        height={tailSize}
        transform={`rotate(45 ${tailX + tailSize / 2} ${tailY + tailSize / 2})`}
        fill="none"
        strokeWidth={0.75}
        style={SHOP_INK_MUTED}
      />
    </g>
  )
}

/** 4. Café — the Lumina shop. Reuses the .sign-buzz neon-flicker (full
 * strength, same as the hero/final-CTA OPEN sign) plus a scalloped awning
 * (same visual technique as LineAwning above, re-derived for this
 * variant's own baseline/coordinate space) and three green ✓ chips. */
function CafeAwning({ shop }: { shop: MainStreetShop }) {
  const x = shop.x + 8
  const width = shop.width - 16
  const roofY = MAIN_STREET_BASELINE - 44
  const roofH = 6
  const teeth = 5
  const toothW = width / teeth
  const points: string[] = [`${x},${roofY + roofH}`]
  for (let i = 0; i < teeth; i += 1) {
    const tx = x + i * toothW
    points.push(`${tx + toothW / 2},${roofY + roofH + 5}`)
    points.push(`${tx + toothW},${roofY + roofH}`)
  }
  return (
    <g style={{ filter: "drop-shadow(0 0 3px var(--amber-glow))" }}>
      <rect
        x={x}
        y={roofY}
        width={width}
        height={roofH}
        strokeWidth={1.2}
        style={{ stroke: "var(--amber-glow)", fill: "color-mix(in oklch, var(--amber-glow) 12%, transparent)" }}
      />
      <polyline points={points.join(" ")} fill="none" strokeWidth={1.2} strokeLinejoin="round" style={{ stroke: "var(--amber-glow)" }} />
    </g>
  )
}

function CafeSign({ shop }: { shop: MainStreetShop }) {
  const cx = shop.x + shop.width / 2
  const signW = 66
  const signH = 15
  const signX = cx - signW / 2
  const signY = MAIN_STREET_BASELINE - shop.height + 14
  return (
    <g className="sign-buzz" style={{ filter: "drop-shadow(0 0 6px var(--amber-glow)) drop-shadow(0 0 14px var(--amber-glow))" }}>
      <rect x={signX} y={signY} width={signW} height={signH} rx={3} style={{ fill: "var(--amber-glow)", opacity: 0.18 }} />
      <rect x={signX} y={signY} width={signW} height={signH} rx={3} fill="none" strokeWidth={1.25} style={{ stroke: "var(--amber-glow)" }} />
      <text
        x={cx}
        y={signY + signH / 2 + 3}
        textAnchor="middle"
        style={{ fill: "var(--amber-glow)", fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.04em", fontWeight: 600 }}
      >
        OPEN 24/7
      </text>
    </g>
  )
}

function CafeChecks({ shop }: { shop: MainStreetShop }) {
  const cx = shop.x + shop.width / 2
  const cy = MAIN_STREET_BASELINE - 44 - 13
  const gap = 20
  return (
    <>
      <CheckChip cx={cx - gap} cy={cy} />
      <CheckChip cx={cx} cy={cy} />
      <CheckChip cx={cx + gap} cy={cy} />
    </>
  )
}

/** SignBubble — the café's permanent, non-dismissible callout ("We use
 * Lumina."). Same visual DNA as WickBubble (src/components/brand/
 * wick-bubble.tsx): rounded card, border + card fill, rotated-square tail —
 * here the tail always points DOWN at the shop, and it's real SVG (rect +
 * text), not an HTML overlay, so it stays part of the illustration rather
 * than a floating chat bubble. No typing effect: it's signage, not
 * dialogue. Enters once via a ScrollReveal-style fade/rise the first time
 * it scrolls into view; static under reduced motion (skips straight to its
 * resting state, mirroring WickBubble's own `initial={false}` pattern). */
function SignBubble({
  x,
  bottomY,
  text = "We use Lumina.",
  subtext,
}: {
  x: number
  /** Where the bubble's bottom edge (and tail) sit — a fixed gap above the
   * shop's roofline, so adding `subtext` grows the bubble upward instead of
   * pushing its tail off the roof. */
  bottomY: number
  text?: string
  /** Second, smaller line — still bright/on-brand (the café's copy is the
   * one thing in the scene allowed to glow), just a lighter weight than the
   * primary line so hierarchy inside the bubble stays clear. */
  subtext?: string
}) {
  const reduceMotion = useReducedMotion()
  const bubbleW = subtext ? 172 : 122
  const bubbleH = subtext ? 48 : 32
  const bubbleX = x - bubbleW / 2
  const bubbleY = bottomY - bubbleH
  const tailSize = 9
  const tailX = x - tailSize / 2
  const tailY = bubbleY + bubbleH - tailSize / 2 - 2

  return (
    <motion.g
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={reduceMotion ? { duration: 0 } : { duration: duration.slow, ease: easing.out }}
    >
      <rect
        x={tailX}
        y={tailY}
        width={tailSize}
        height={tailSize}
        rx={1.5}
        transform={`rotate(45 ${tailX + tailSize / 2} ${tailY + tailSize / 2})`}
        className="fill-card"
        stroke="var(--border)"
        strokeWidth={1}
      />
      <rect
        x={bubbleX}
        y={bubbleY}
        width={bubbleW}
        height={bubbleH}
        rx={9}
        className="fill-card"
        stroke="var(--border)"
        strokeWidth={1}
        style={{ filter: "drop-shadow(0 3px 6px color-mix(in oklch, var(--foreground) 35%, transparent))" }}
      />
      <text
        x={x}
        y={subtext ? bubbleY + 19 : bubbleY + bubbleH / 2 + 4}
        textAnchor="middle"
        style={{ fill: "var(--foreground)", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, letterSpacing: "0.01em" }}
      >
        {text}
      </text>
      {subtext && (
        <text
          x={x}
          y={bubbleY + 36}
          textAnchor="middle"
          style={{ fill: "var(--amber-glow)", fontFamily: "var(--font-sans)", fontSize: 9, fontWeight: 600, letterSpacing: "0.01em" }}
        >
          {subtext}
        </text>
      )}
    </motion.g>
  )
}

function MainStreet({ className }: { className?: string }) {
  const s = MAIN_STREET_SHOPS
  const cafeCx = s.cafe.x + s.cafe.width / 2
  const cafeTop = MAIN_STREET_BASELINE - s.cafe.height

  const salonCx = s.salon.x + s.salon.width / 2 + 17
  const salonHeadCy = MAIN_STREET_BASELINE - 16 - 3.6

  const plumberDoorY = MAIN_STREET_BASELINE - 32
  const plumberSignY = plumberDoorY - 22

  return (
    <div className={cn("relative", className)}>
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${MAIN_STREET_VIEW_WIDTH} ${MAIN_STREET_VIEW_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        className="block h-auto w-full"
      >
        <defs>
          <radialGradient id="main-street-cafe-wash-amber" cx="50%" cy="38%" r="70%">
            <stop offset="0%" style={{ stopColor: "var(--amber-glow)", stopOpacity: 0.24 }} />
            <stop offset="75%" style={{ stopColor: "var(--amber-glow)", stopOpacity: 0 }} />
          </radialGradient>
          <radialGradient id="main-street-cafe-wash-indigo" cx="32%" cy="18%" r="60%">
            <stop offset="0%" style={{ stopColor: "var(--primary)", stopOpacity: 0.14 }} />
            <stop offset="70%" style={{ stopColor: "var(--primary)", stopOpacity: 0 }} />
          </radialGradient>
        </defs>

        {/* Sidewalk / street level */}
        <line
          x1={0}
          y1={MAIN_STREET_BASELINE}
          x2={MAIN_STREET_VIEW_WIDTH}
          y2={MAIN_STREET_BASELINE}
          strokeWidth={1}
          style={{ stroke: "var(--ink)", strokeOpacity: 0.18 }}
        />

        {/* Café amber + hint-of-indigo wash — behind everything, the scene's only color source. */}
        <rect x={s.cafe.x - 30} y={cafeTop - 30} width={s.cafe.width + 60} height={s.cafe.height + 55} fill="url(#main-street-cafe-wash-amber)" />
        <rect x={s.cafe.x - 30} y={cafeTop - 30} width={s.cafe.width + 60} height={s.cafe.height + 55} fill="url(#main-street-cafe-wash-indigo)" />

        {/* 1. Bakery — CLOSED */}
        <g>
          <ShopBuilding shop={s.bakery} />
          <ShopDoor shop={s.bakery} />
          <BakerySign shop={s.bakery} />
          <ShopLabel shop={s.bakery} lines={["Closed since 6"]} />
        </g>

        {/* 2. Salon — waiting customer + missed ✕ */}
        <g>
          <ShopBuilding shop={s.salon} />
          <ShopDoor shop={s.salon} />
          <WaitingCustomer cx={salonCx} />
          <XChip cx={salonCx} cy={salonHeadCy - 11} />
          <ShopLabel shop={s.salon} lines={["On vacation —", "back Monday"]} />
        </g>

        {/* 3. Plumber — phone glyph + missed-call ✕ above the sign */}
        <g>
          <ShopBuilding shop={s.plumber} />
          <ShopDoor shop={s.plumber} />
          <PlumberSign shop={s.plumber} />
          <XChip cx={s.plumber.x + s.plumber.width / 2} cy={plumberSignY - 10} />
          <ShopLabel shop={s.plumber} lines={["Family emergency —", "couldn't pick up"]} />
        </g>

        {/* 4. Café — THE Lumina shop */}
        <g>
          <ShopBuilding shop={s.cafe} />
          <ShopDoor shop={s.cafe} />
          <CafeAwning shop={s.cafe} />
          <CafeSign shop={s.cafe} />
          <CafeChecks shop={s.cafe} />
        </g>
        <SignBubble x={cafeCx} bottomY={cafeTop - 9} subtext="Open 24/7 — always answering." />

        {/* 5. Florist — dead feed */}
        <g>
          <ShopBuilding shop={s.florist} />
          <ShopDoor shop={s.florist} />
          <DashedGhostCard shop={s.florist} />
          <ShopLabel shop={s.florist} lines={["Haven't posted", "in months"]} />
        </g>

        {/* 6. Barber — blank calendar */}
        <g>
          <ShopBuilding shop={s.barber} />
          <ShopDoor shop={s.barber} />
          <BlankCalendarGrid shop={s.barber} />
          <ShopLabel shop={s.barber} lines={["No idea what's", "booked"]} />
        </g>

        {/* 7. Hardware — closed 6PM + two queued, unanswered DMs */}
        <g>
          <ShopBuilding shop={s.hardware} />
          <ShopDoor shop={s.hardware} />
          <HardwareSign shop={s.hardware} />
          <SpeechBubbleOutline x={s.hardware.x + s.hardware.width - 32} y={MAIN_STREET_BASELINE - s.hardware.height * 0.72} />
          <SpeechBubbleOutline x={s.hardware.x + s.hardware.width - 20} y={MAIN_STREET_BASELINE - s.hardware.height * 0.72 + 13} />
          <ShopLabel shop={s.hardware} lines={["Closed 6 PM —", "DMs waiting"]} />
        </g>
      </svg>
      <p className="sr-only">
        Illustration: a row of shops on Main Street, each with a sign explaining what it&apos;s missing — closed
        since six, on vacation, a missed emergency call, months without a post, no idea what&apos;s booked, or
        closed at six with messages waiting. The centre shop, lit warm and glowing with a sign reading &quot;We use
        Lumina&quot; and open 24/7, always answering, has posts, replies, and bookings all handled.
      </p>
    </div>
  )
}
