"use client"

/**
 * WickGuide — Wick as "the boss of the page": a fixed scroll companion who
 * hosts the whole landing-page scroll, additive to the Wick system in
 * wick.tsx. Landing-page-guide upgrade (owner direction — see the build
 * brief for the full spec this file implements).
 *
 * Handoff with the hero's own Wick (hero.tsx): two SEPARATE Wick instances
 * that must never both be visible at once. hero.tsx owns the single
 * IntersectionObserver on its own section and publishes both "is the hero
 * visible" and "where was my Wick, in viewport coordinates" into the
 * `HeroWickHandoff` store in wick.tsx (see that file's doc). This component
 * only ever READS that store via `useSyncExternalStore` — no duplicate
 * observer, no race between two independent IntersectionObservers deciding
 * visibility differently.
 *
 * The "same bug goes below" moment: when the store flips `heroVisible`
 * false, this component mounts and flies in from the hero Wick's last
 * measured center to its own first waypoint anchor along a curved arc,
 * trailing a staggered sparkle burst (`HandoffTrail`). Scrolling back up
 * reverses it — the guide flies back up + fades (AnimatePresence `exit`)
 * while hero.tsx's own handoff layer independently fades its Wick back in.
 *
 * Waypoints: every non-hero landing section, keyed by the `data-scene`
 * attribute each section already renders (confirmed by reading the section
 * files directly — some of these have a different `id` than `data-scene`,
 * e.g. lamps' `id="how-it-works"` / `data-scene="lamps"`, so `data-scene` is
 * used throughout as the one consistent selector). Full coverage — one line
 * for every visible band, no dead zones (owner direction):
 *
 *   data-scene      | rendered by
 *   ----------------|---------------------------------
 *   trust-bar       | trust-bar.tsx
 *   lamps           | lamps.tsx            (id="how-it-works")
 *   day-strip       | day-strip.tsx        (per-SCENE lines — see below)
 *   loop-board      | loop-board.tsx
 *   shop-picker     | shop-picker.tsx      (id="pick-your-shop")
 *   night-ticker    | night-ticker.tsx
 *   conversion-zone | conversion-zone.tsx  (id="pilot-menu" — nav/hero anchor)
 *
 * day-strip is special-cased: instead of one static line for the whole
 * section, the guide reads day-strip.tsx's own active-scene store (same
 * module-level pub/sub pattern as `HeroWickHandoff`, published from
 * whichever of the pinned desktop stage / stacked fallback is mounted) and
 * shows that SCENE's line, re-arming the "already shown" gate on scene
 * change (not just on entering/leaving the day-strip section as a whole).
 *
 * Hover hints: any element anywhere on the page can carry a
 * `data-wick-hint="short line"` attribute. When the pointer rests ≥300ms
 * over such an element, the bubble swaps to that hint immediately (instant
 * fade/slide, no typing) — a desktop-only manual override that always beats
 * the automatic scene bubble and never gates it; leaving the element
 * restores whatever section/scene line was showing after ~600ms. Generic +
 * self-contained — see `useWickHoverHints` below. Future sections just add
 * the attribute, nothing else to wire up.
 *
 * Sync correctness: the dwell timer never trusts a captured closure for
 * WHICH element or WHAT text to show — it always re-reads
 * `hoverElRef.current` at the moment it actually fires, so a
 * wrong-element/stale hint is structurally impossible rather than merely
 * unlikely. Entering a new hinted element always cancels any in-flight
 * dwell AND any pending restore immediately (`clearDwell`/`clearRestore` in
 * `handlePointerOver`), which is also what keeps a direct A→B hover swap
 * from ever flashing the underlying section line in between.
 * `handlePointerOut` no-ops on child-to-child moves (`relatedTarget` still
 * inside the same hinted element) so nested interactive children don't
 * spuriously restart the dwell/restore cycle. In non-production builds
 * only, the currently-active hint text is mirrored onto
 * `document.body[data-wick-hint-source]` for test harnesses to assert
 * against without needing to read component internals.
 *
 * Active-scene tracking — the READING BAND engine (owner-approved Option A,
 * research: docs-site scrollspy + newsroom scrollytelling patterns; see the
 * wave transcript's reference report):
 *
 *   1. BAND — an invisible horizontal band across the middle of the
 *      viewport (center ± READING_BAND_HALF) stands in for "where the
 *      visitor is looking". A rAF-throttled scroll sampler measures how
 *      many pixels of that band each watched section covers.
 *   2. TIE-BREAK — whichever section covers the MOST band pixels is the
 *      candidate. Deterministic: when two sections are each half-visible,
 *      exactly one owns the band; "Wick describes the top section while
 *      you read the bottom one" is structurally impossible.
 *   3. DWELL + VELOCITY — the candidate only COMMITS (Wick flies + speaks)
 *      after holding the band for WICK_DWELL_MS AND once scroll speed has
 *      dropped under WICK_COMMIT_MAX_VELOCITY. Fly-through scrolling stays
 *      quiet; settling anywhere commits within ~half a second, bounded.
 *      The winner is re-measured at the commit instant, so a stale
 *      candidate can never land late.
 *
 * The bubble is tied to the COMMITTED scene, not to scroll events: it
 * appears on commit and stays up until the scene changes or the visitor
 * dismisses it — never yanked away mid-read by a stray scroll tick (the
 * old scroll-hide + 350ms rest-timer model, which momentum scrolling and
 * slow readers both defeated, is gone). The sampler keeps running
 * regardless of hero visibility, so the correct scene is already known the
 * instant the guide needs to mount. Wick's continuous flight/position and
 * the discrete "what he says" decision are deliberately separate systems —
 * the flight can be cosmetic and springy while the speech stays stable.
 *
 * Placement: each waypoint carries its own authored anchor (`topVh`/
 * `rightVw`, viewport-relative percentages), chosen by reading that
 * section's actual layout so Wick+bubble sit in genuinely empty space —
 * see the per-waypoint comments below. Anchors are resolved to pixels from
 * live `window.innerWidth/innerHeight` (recomputed on resize) rather than
 * left as CSS percentages, because the guide's fixed wrapper is translated
 * via a single `x`/`y` motion pair shared with the hero-handoff arc and the
 * inter-waypoint travel spring — one coordinate system for all three.
 *
 * Desktop-only, structural: the guide (including its observers) simply
 * doesn't run below `lg` — "the page already explains itself" on mobile per
 * the brief. Uses the same `useSyncExternalStore` matchMedia pattern as
 * `src/hooks/use-mobile.ts` so there's no post-hydration layout flash.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { AnimatePresence, motion, useAnimationControls, useReducedMotion, type Transition } from "framer-motion"

import {
  getHeroWickHandoffSnapshot,
  getHeroWickHandoffServerSnapshot,
  subscribeHeroWickHandoff,
  Wick,
} from "@/components/brand/wick"
import { WickBubble } from "@/components/brand/wick-bubble"
import {
  getDayStripActiveSceneServerSnapshot,
  getDayStripActiveSceneSnapshot,
  subscribeDayStripActiveScene,
} from "@/components/marketing/day-strip"
import { easing, springGentle } from "@/lib/motion"

// v2 suffix: earlier builds wrote these flags too eagerly (and had a
// session-wide dismiss kill-switch) — stale values in an open tab's
// sessionStorage silently suppressed every bubble. Versioning the keys
// invalidates any such stale state without asking users to clear storage.
const INTRO_SEEN_STORAGE_KEY = "lumina:guide-intro-seen:v2"
const DESKTOP_QUERY = "(min-width: 1024px)"

/** Reading-band half-height as a viewport fraction — the band spans
 *  viewport center ± this (0.2 → the middle 40%). Wide enough that short
 *  sections can own it outright, narrow enough that a section peeking in
 *  from an edge never steals focus from the one mid-screen. */
const READING_BAND_HALF = 0.2
/** How long a candidate scene must continuously own the reading band before
 *  Wick commits to it (flies + speaks). Rejects fly-through scrolling
 *  without ever feeling laggy — well inside the 300–800ms dwell range the
 *  read-tracking literature uses for "actually looking at this". */
const WICK_DWELL_MS = 400
/** Max scroll speed (px/ms) at which a commit is allowed — a settling
 *  trackpad flick under this reads as "arriving", above it as "passing
 *  through". ~500px/s. */
const WICK_COMMIT_MAX_VELOCITY = 0.5
/** Re-check cadence while waiting for velocity to drop below the commit
 *  threshold after the dwell has already been served. */
const VELOCITY_RECHECK_MS = 120
/** No scroll events for this long → velocity is treated as zero (momentum
 *  scrolling emits events until it truly stops, so silence means stopped). */
const VELOCITY_IDLE_MS = 160
/** Minimum time the INTRO bubble stays up, immune to scroll-hide, once it
 *  has actually appeared — see the root-cause note on `handleScroll` below. */
const INTRO_MIN_DISPLAY_MS = 4000
/** How long the intro must have been on screen before it's marked "seen" in
 *  `sessionStorage` — short of this, a killed intro re-arms next appearance
 *  instead of being permanently suppressed. */
const INTRO_SEEN_WRITE_MS = 1500
/** Hover-hint dwell before the bubble swaps to a `data-wick-hint` line —
 *  pure hover-intent; hovering is an instant manual override with no
 *  stillness precondition (the reading-band engine owns automatic timing). */
const HOVER_HINT_DWELL_MS = 300
/** How long after the pointer leaves a hinted element before the bubble
 *  restores the section/scene line. */
const HOVER_HINT_RESTORE_MS = 600

const WICK_SIZE = 84
/** Bubble width cap for the guide instance — scaled up alongside `WICK_SIZE`
 *  (owner direction: "he must NEVER shrink" — the bubble grows with him). */
const GUIDE_BUBBLE_MAX_WIDTH = 230
/** Max bank angle while translating (deg), spring-settles to 0 on arrival. */
const BANK_MAX = 14
/** Lateral bow amplitude for ordinary inter-waypoint travel (px). */
const BOW_AMPLITUDE = 24
/** Lateral + vertical bow amplitude for the hero→guide HANDOFF flight only —
 *  bigger and more theatrical (owner direction): a pronounced swoop, not a
 *  gentle inter-waypoint hop. */
const HANDOFF_BOW_AMPLITUDE_X = 60
const HANDOFF_BOW_AMPLITUDE_Y = 42
/** Handoff-only mid-flight scale bump — "he's flying down with me". */
const HANDOFF_SCALE_PEAK = 1.16
const TRAVEL_DURATION = 0.6
const ENTRANCE_DURATION = 0.9
const EXIT_DURATION = 0.55
/** Bubble flips to Wick's other side once its anchor sits this close to the
 *  right viewport edge — bumped alongside the bigger bubble width. */
const EDGE_FLIP_THRESHOLD_PX = 260

const INTRO_LINE =
  "Hey — I'm Wick. I keep the lights on around here. Scroll on, stop anywhere — I'll tell you what you're looking at."

/** Per-scene commentary for the day-strip waypoint (owner direction #5) —
 *  keyed by day-strip.tsx's `SCENES[].key`, read live from the module-level
 *  store it publishes to. Falls back to a generic line if the store hasn't
 *  resolved a scene yet (edge case: the guide's own center-band observer
 *  can, in principle, mark day-strip active a frame before day-strip's own
 *  tracking has run). */
const DAY_STRIP_SCENE_LINES: Record<string, string> = {
  "7am": "Morning post? Already drafted. Owner just taps approve.",
  "12pm": "The week hangs on a rail — drag a ticket, done.",
  "6pm": "Shop's closing, questions keep coming. I answer at the door.",
  "11pm": "Everyone's asleep. I'm still taking cake orders.",
  "645am": "And the morning receipt — everything I caught overnight.",
}
const DAY_STRIP_FALLBACK_LINE = "One full day at your shop — tap any time on the timeline."

type Anchor = { topVh: number; rightVw: number }

type Waypoint = {
  /** Matches the section's `data-scene` attribute. */
  id: string
  /** Guide bubble copy — verbatim per the design brief. */
  line: string
  /** Viewport-relative resting anchor, authored per-section (see comments). */
  anchor: Anchor
  /** Small personality jitter (px) layered on top of the anchor once arrived. */
  offsetX: number
  offsetY: number
}

// `rightVw`/offsets below are nudged outward from the original (56px Wick)
// authoring pass to keep clear of text/cards now that WICK_SIZE is 84 — the
// footprint grew by 28px (half-size +14px each direction), so every anchor
// that was sitting close to the edge (rightVw 6-7) got +2vw of breathing
// room. Page order matches app/(marketing)/page.tsx exactly, so this list
// doubles as the reading order.
const WAYPOINTS: Waypoint[] = [
  {
    id: "trust-bar",
    line: "Bakers, barbers, pipes and pours — if it's on Main Street, this is built for them.",
    // Short section, centered content (label + chip row), lots of vertical
    // and horizontal margin at desktop widths.
    anchor: { topVh: 16, rightVw: 9 },
    offsetX: 4,
    offsetY: -4,
  },
  {
    id: "lamps",
    line: "Three jobs Lumina handles. That's the whole idea.",
    // Three lamp columns fill the width edge-to-edge under the heading —
    // the empty band is right beside the centered headline, up top.
    anchor: { topVh: 16, rightVw: 9 },
    offsetX: -8,
    offsetY: 18,
  },
  {
    id: "day-strip",
    // Fallback only — the actual bubble text is resolved per-ACTIVE-SCENE
    // from DAY_STRIP_SCENE_LINES (see `resolveWaypointLine`), never this
    // static line, while day-strip.tsx's scene store has a value.
    line: DAY_STRIP_FALLBACK_LINE,
    // The pinned stage is edge-to-edge (no side margin) with the chapter
    // rail on the LEFT and centered content in the middle — the only clear
    // spot is the top-right corner of the stage, above the sky band.
    anchor: { topVh: 13, rightVw: 9 },
    offsetX: 6,
    offsetY: -14,
  },
  {
    id: "loop-board",
    line: "Every thread is a customer a post brought in. No more guessing.",
    // Corkboard card is centered (max-w-3xl); heading sits above it —
    // anchored beside the heading, clear of the card and its string art.
    anchor: { topVh: 24, rightVw: 8 },
    offsetX: -10,
    offsetY: 8,
  },
  {
    id: "shop-picker",
    line: "Tap your kind of shop — the page redresses itself for you.",
    // Narrow centered content (pill tabs + demo card) — lots of margin.
    anchor: { topVh: 30, rightVw: 10 },
    offsetX: 8,
    offsetY: -16,
  },
  {
    id: "night-ticker",
    line: "That's one night's work. Now imagine a month.",
    // Centered narrow card (max-w-md) — wide empty margins both sides.
    anchor: { topVh: 24, rightVw: 11 },
    offsetX: 4,
    offsetY: -8,
  },
  {
    id: "conversion-zone",
    line: "Free while we build together. This little form is the whole signup.",
    // One merged closing zone: chalkboard + form centered (max-w-2xl),
    // mini-FAQ grid below, street finale at the bottom — anchor beside the
    // heading/card band where the margins are widest.
    anchor: { topVh: 22, rightVw: 11 },
    offsetX: -6,
    offsetY: 10,
  },
]

function subscribeDesktop(callback: () => void) {
  const mql = window.matchMedia(DESKTOP_QUERY)
  mql.addEventListener("change", callback)
  return () => mql.removeEventListener("change", callback)
}
function getDesktopSnapshot() {
  return window.matchMedia(DESKTOP_QUERY).matches
}
function getDesktopServerSnapshot() {
  return false
}

/** Reads `sessionStorage`, tolerating privacy-mode/storage-disabled browsers. */
function readSessionFlag(key: string): boolean {
  try {
    return window.sessionStorage.getItem(key) === "1"
  } catch {
    return false
  }
}
function writeSessionFlag(key: string) {
  try {
    window.sessionStorage.setItem(key, "1")
  } catch {
    // Storage unavailable — the guide just won't remember this across the session.
  }
}

/** Live viewport size, only tracked while the guide can actually render (desktop). */
function useViewportSize(active: boolean) {
  const [size, setSize] = useState({ w: 1440, h: 900 })
  useEffect(() => {
    if (!active) return
    function update() {
      setSize({ w: window.innerWidth, h: window.innerHeight })
    }
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [active])
  return size
}

/** A waypoint's authored anchor, resolved to a translate-from-top-right-corner
 *  pixel pair for the guide's `fixed top-0 right-0` wrapper (see the wrapper
 *  below) — the single coordinate space shared by waypoint travel AND the
 *  hero-handoff arc. */
function anchorToTarget(anchor: Anchor, offsetX: number, offsetY: number, viewport: { w: number; h: number }) {
  const half = WICK_SIZE / 2
  return {
    x: -((viewport.w * anchor.rightVw) / 100) + half + offsetX,
    y: (viewport.h * anchor.topVh) / 100 - half + offsetY,
  }
}

/** Hero Wick's last measured viewport-space center, resolved into the SAME
 *  translate-from-top-right-corner space as `anchorToTarget` — this is what
 *  lets the guide's `initial`/`exit` line up with wherever the hero Wick
 *  actually was, with no DOM measurement of the guide's own (still-
 *  animating) position required. */
function centerToLocal(center: { x: number; y: number }, viewport: { w: number; h: number }) {
  const half = WICK_SIZE / 2
  return { x: center.x - (viewport.w - half), y: center.y - half }
}

export function WickGuide() {
  const isDesktop = useSyncExternalStore(subscribeDesktop, getDesktopSnapshot, getDesktopServerSnapshot)
  const reduceMotion = useReducedMotion()
  const viewport = useViewportSize(isDesktop)
  const handoff = useSyncExternalStore(
    subscribeHeroWickHandoff,
    getHeroWickHandoffSnapshot,
    getHeroWickHandoffServerSnapshot
  )

  const [activeId, setActiveId] = useState<string | null>(null)
  const [tabHidden, setTabHidden] = useState(false)

  const activeIdRef = useRef<string | null>(null)

  // Pause everything while the tab is backgrounded — same cost/perf
  // discipline as wick.tsx's own dart/blink timers.
  useEffect(() => {
    if (!isDesktop) return
    function handleVisibility() {
      setTabHidden(document.hidden)
    }
    document.addEventListener("visibilitychange", handleVisibility)
    return () => document.removeEventListener("visibilitychange", handleVisibility)
  }, [isDesktop])

  // Active scene — the READING BAND engine (see the file doc's numbered
  // walkthrough): band-coverage winner → dwell → velocity gate → commit.
  // Runs independently of hero visibility so the correct scene is already
  // resolved the instant heroGone flips (no flash of the wrong section on
  // handoff). One rAF-throttled sampler reads 11 client rects per scroll
  // frame (layout reads only, no writes — no thrash) and doubles as the
  // velocity tracker, so band + tie-break + velocity all come from the same
  // consistent snapshot instead of two systems racing.
  useEffect(() => {
    if (!isDesktop) return
    const nodes = WAYPOINTS.map((w) => document.querySelector(`[data-scene="${w.id}"]`)).filter(
      (node): node is Element => node !== null
    )
    if (nodes.length === 0) return

    let rafId = 0
    let commitTimer: ReturnType<typeof setTimeout> | null = null
    let lastY = window.scrollY
    let lastSampleAt = performance.now()
    let velocity = 0 // px/ms, signed
    let candidate: string | null = null
    let candidateSince = 0

    /** Band-coverage winner: the section covering the most pixels of the
     *  center band right now, or null if none touches it. */
    function measureWinner(): string | null {
      const vh = window.innerHeight
      const bandTop = vh * (0.5 - READING_BAND_HALF)
      const bandBottom = vh * (0.5 + READING_BAND_HALF)
      let best: string | null = null
      let bestPx = 0
      for (const node of nodes) {
        const rect = node.getBoundingClientRect()
        const coveredPx = Math.min(rect.bottom, bandBottom) - Math.max(rect.top, bandTop)
        if (coveredPx > bestPx) {
          bestPx = coveredPx
          best = node.getAttribute("data-scene")
        }
      }
      return best
    }

    function scheduleCommit(delayMs: number) {
      if (commitTimer) clearTimeout(commitTimer)
      commitTimer = setTimeout(tryCommit, delayMs)
    }

    function tryCommit() {
      commitTimer = null
      const now = performance.now()
      // Momentum scrolling emits events until it truly stops — event
      // silence past VELOCITY_IDLE_MS means the page is at rest.
      if (now - lastSampleAt > VELOCITY_IDLE_MS) velocity = 0
      if (!candidate || candidate === activeIdRef.current) return
      const held = now - candidateSince
      if (held < WICK_DWELL_MS) {
        scheduleCommit(WICK_DWELL_MS - held)
        return
      }
      if (Math.abs(velocity) > WICK_COMMIT_MAX_VELOCITY) {
        scheduleCommit(VELOCITY_RECHECK_MS)
        return
      }
      // Re-measure at the commit instant — a commit can only ever land for
      // whatever genuinely owns the band right now, never a stale winner.
      const winner = measureWinner()
      if (winner !== candidate) {
        candidate = winner
        candidateSince = now
        if (winner) scheduleCommit(WICK_DWELL_MS)
        return
      }
      activeIdRef.current = candidate
      setActiveId(candidate)
    }

    function sample() {
      rafId = 0
      const now = performance.now()
      const y = window.scrollY
      const dt = now - lastSampleAt
      if (dt > 0) velocity = (y - lastY) / dt
      lastY = y
      lastSampleAt = now
      const winner = measureWinner()
      if (winner !== candidate) {
        candidate = winner
        candidateSince = now
      }
      if (candidate && candidate !== activeIdRef.current) {
        scheduleCommit(Math.max(WICK_DWELL_MS - (now - candidateSince), 16))
      }
    }

    function requestSample() {
      if (!rafId) rafId = requestAnimationFrame(sample)
    }

    sample() // resolve the initial scene without waiting for a scroll
    window.addEventListener("scroll", requestSample, { passive: true })
    window.addEventListener("resize", requestSample)
    return () => {
      window.removeEventListener("scroll", requestSample)
      window.removeEventListener("resize", requestSample)
      if (rafId) cancelAnimationFrame(rafId)
      if (commitTimer) clearTimeout(commitTimer)
    }
  }, [isDesktop])

  const waypoint = useMemo(() => WAYPOINTS.find((w) => w.id === activeId) ?? WAYPOINTS[0], [activeId])
  const shouldRender = isDesktop && !handoff.heroVisible && !!activeId

  return (
    <AnimatePresence>
      {shouldRender && (
        <GuideBody
          key="wick-guide"
          reduceMotion={!!reduceMotion}
          tabHidden={tabHidden}
          waypoint={waypoint}
          viewport={viewport}
          heroCenter={handoff.center}
        />
      )}
    </AnimatePresence>
  )
}

type BubbleState = { kind: "intro" | "waypoint" | "hint"; text: string; key: string }

/** Resolves a waypoint's bubble text — the day-strip waypoint reads the
 *  live active-scene store instead of its own static `line` (see
 *  DAY_STRIP_SCENE_LINES doc above). Every other waypoint just uses its
 *  authored `line` unchanged. */
function resolveWaypointLine(waypoint: Waypoint, dayStripScene: string | null): string {
  if (waypoint.id !== "day-strip") return waypoint.line
  if (!dayStripScene) return DAY_STRIP_FALLBACK_LINE
  return DAY_STRIP_SCENE_LINES[dayStripScene] ?? DAY_STRIP_FALLBACK_LINE
}

/** "content key" for a waypoint visit — normally just the waypoint id, but
 *  for day-strip it's `day-strip:<scene>` so a scene change re-arms the
 *  "already shown this visit" gate (owner direction #5: "re-arms on scene
 *  change, not just section change"). */
function waypointContentKey(waypoint: Waypoint, dayStripScene: string | null): string {
  if (waypoint.id !== "day-strip") return waypoint.id
  return `day-strip:${dayStripScene ?? "unknown"}`
}

function GuideBody({
  reduceMotion,
  tabHidden,
  waypoint,
  viewport,
  heroCenter,
}: {
  reduceMotion: boolean
  tabHidden: boolean
  waypoint: Waypoint
  viewport: { w: number; h: number }
  heroCenter: { x: number; y: number } | null
}) {
  const dayStripScene = useSyncExternalStore(
    subscribeDayStripActiveScene,
    getDayStripActiveSceneSnapshot,
    getDayStripActiveSceneServerSnapshot
  )
  const waypointLine = resolveWaypointLine(waypoint, dayStripScene)
  const contentKey = waypointContentKey(waypoint, dayStripScene)

  const target = useMemo(
    () => anchorToTarget(waypoint.anchor, waypoint.offsetX, waypoint.offsetY, viewport),
    [waypoint, viewport]
  )

  // "Was there a previous target" — tracked as STATE via React's documented
  // "adjust state during render" pattern (compare against a tracked-
  // previous snapshot, conditionally `setState` in the render body itself:
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  // rather than a ref, specifically so `isEntrance` is safe to READ during
  // render (it feeds `positionTransition` below) — reading a ref's
  // `.current` during render is unsound, since a ref write between renders
  // wouldn't be reflected until React re-renders for some other reason.
  const [prevTarget, setPrevTarget] = useState<{ x: number; y: number } | null>(null)
  const [trackedTarget, setTrackedTarget] = useState(target)
  if (trackedTarget.x !== target.x || trackedTarget.y !== target.y) {
    setPrevTarget(trackedTarget)
    setTrackedTarget(target)
  }
  const isEntrance = prevTarget === null

  const localHeroStart = useMemo(
    () => (heroCenter ? centerToLocal(heroCenter, viewport) : null),
    [heroCenter, viewport]
  )

  // The hero→guide HANDOFF flight specifically — the very first flight of
  // this mount, AND one that actually starts from a measured hero position
  // (not a cold-start fallback). Gets the bigger, more theatrical swoop +
  // mid-flight scale bump (owner direction #4) that ordinary inter-waypoint
  // travel doesn't.
  const isHandoffFlight = isEntrance && !!localHeroStart

  const initial = reduceMotion
    ? { x: target.x, y: target.y, opacity: 0 }
    : localHeroStart
      ? { x: localHeroStart.x, y: localHeroStart.y, opacity: 0, scale: 0.7 }
      : { x: target.x, y: target.y, opacity: 0, scale: 0.85 }

  const positionAnimate =
    isHandoffFlight && !reduceMotion
      ? { x: target.x, y: target.y, opacity: 1, scale: [0.7, HANDOFF_SCALE_PEAK, 1] }
      : { x: target.x, y: target.y, opacity: 1, scale: 1 }

  const exitTarget = localHeroStart ?? target
  const exitProps = reduceMotion
    ? { opacity: 0, transition: { duration: 0 } }
    : {
        x: exitTarget.x,
        y: exitTarget.y,
        opacity: 0,
        scale: 0.6,
        transition: { duration: EXIT_DURATION, ease: easing.out },
      }

  const positionTransition: Transition = reduceMotion
    ? { duration: 0 }
    : { duration: isEntrance ? ENTRANCE_DURATION : TRAVEL_DURATION, ease: easing.spring }

  // Arc flight: bank (rotate toward travel direction, spring back to 0) +
  // a transient lateral bow, both re-triggered every time the target
  // changes (including the very first, the hero-handoff arrival).
  const bankControls = useAnimationControls()
  const bowControls = useAnimationControls()
  const [isFlying, setIsFlying] = useState(true)
  const [showHandoffTrail, setShowHandoffTrail] = useState(!reduceMotion && !!localHeroStart)

  useEffect(() => {
    if (reduceMotion || tabHidden) return
    const from = prevTarget ?? localHeroStart ?? target
    const dx = target.x - from.x
    const dur = prevTarget === null ? ENTRANCE_DURATION : TRAVEL_DURATION
    const bankSign = dx > 1 ? 1 : dx < -1 ? -1 : 0
    const bowSign = bankSign >= 0 ? -1 : 1
    const isHandoff = prevTarget === null && !!localHeroStart
    // Synchronizing the imperative animation-controls system with the new
    // target — `isFlying` mirrors that in-progress state back into React so
    // Wick's `moving` prop (wing flutter) tracks it. This is the "update an
    // external system" half of an effect's job, not derived render state,
    // so it stays here rather than folding into the `prevTarget`
    // render-time adjustment above.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsFlying(true)
    let cancelled = false
    void (async () => {
      await Promise.all([
        bankControls.start({ rotate: bankSign * BANK_MAX }, { duration: dur * 0.4, ease: easing.out }),
        // Ordinary inter-waypoint travel: a gentle lateral-only bow. The
        // hero→guide handoff flight: a bigger, pronounced swoop — down AND
        // lateral — a real "he's flying down with me" moment (owner
        // direction #4), not a mirrored copy of every later hop.
        bowControls.start(
          isHandoff
            ? { x: [0, bowSign * HANDOFF_BOW_AMPLITUDE_X, 0], y: [0, HANDOFF_BOW_AMPLITUDE_Y, 0] }
            : { x: [0, bowSign * BOW_AMPLITUDE, 0] },
          { duration: dur, ease: easing.out }
        ),
      ])
      if (cancelled) return
      await bankControls.start({ rotate: 0 }, springGentle)
      if (!cancelled) setIsFlying(false)
    })()
    return () => {
      cancelled = true
    }
    // Deliberately keyed on the resolved target position only — bank/bow are
    // a one-shot flourish per arrival, not something that should re-fire
    // just because `tabHidden`/`reduceMotion` flip mid-flight (the top-of-
    // effect guard already handles those) or because `bankControls`/
    // `bowControls` are re-created (framer keeps them referentially stable).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.x, target.y])

  useEffect(() => {
    if (!showHandoffTrail) return
    const t = setTimeout(() => setShowHandoffTrail(false), ENTRANCE_DURATION * 1000)
    return () => clearTimeout(t)
    // Runs exactly once per mount — GuideBody remounts fresh each handoff.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Bubble content — intro (once per session, no scroll-stop needed) or a
  // per-waypoint scroll-stop bubble (at most once per "visit" to a
  // waypoint/scene; leaving and returning is a new visit). "Already shown
  // for this visit" is tracked as the content key it was last shown for
  // (`shownContentKey`), not a boolean ref, so the write can live inside
  // the scroll-timeout callback below rather than a bare effect body.
  const [bubble, setBubble] = useState<BubbleState | null>(null)
  const [shownContentKey, setShownContentKey] = useState<string | null>(null)

  // A live ref mirror of `bubble` — needed so the scroll handler (a plain
  // DOM listener, registered once per effect run) can read the CURRENT
  // bubble synchronously to decide intro-protection, without stale-closure
  // risk or re-registering the listener on every bubble change.
  const bubbleRef = useRef<BubbleState | null>(null)
  useEffect(() => {
    bubbleRef.current = bubble
  }, [bubble])

  // When the intro actually appeared — under the reading-band model nothing
  // hides bubbles on scroll anymore, so the intro's only remaining
  // protection concern is a committed SCENE trying to replace it too early:
  // the scene-bubble effect below defers its swap until the greeting has
  // been on screen for `INTRO_MIN_DISPLAY_MS` (or the visitor dismissed it).
  const introShownAtRef = useRef<number | null>(null)

  // Clears a stale waypoint bubble and resets "already shown" the instant
  // the active content (waypoint, or day-strip SCENE) changes — the same
  // render-time-adjustment pattern as `prevTarget` above (no external system
  // involved, so no effect needed: this is purely local state responding to
  // a prop change).
  const [trackedContentKey, setTrackedContentKey] = useState(contentKey)
  if (trackedContentKey !== contentKey) {
    setTrackedContentKey(contentKey)
    setShownContentKey(null)
    if (bubble?.kind === "waypoint") setBubble(null)
  }

  // The X on a bubble hides THAT bubble only — it never silences the whole
  // tour (owner direction: bubbles must always be available; the previous
  // session-wide dismiss flag suppressed every future bubble in the tab and
  // was the root cause of "he moves but never talks").
  const handleDismiss = useCallback(() => {
    if (bubbleRef.current?.kind === "intro") writeSessionFlag(INTRO_SEEN_STORAGE_KEY)
    setBubble(null)
  }, [])

  useEffect(() => {
    if (readSessionFlag(INTRO_SEEN_STORAGE_KEY)) return
    // One-time read of an external system (sessionStorage) right at mount,
    // to decide whether to greet immediately — the intro has no scroll-stop
    // gate, so this can't be deferred into a scroll-driven callback the way
    // the waypoint bubble below is.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBubble({ kind: "intro", text: INTRO_LINE, key: "intro" })
    introShownAtRef.current = Date.now()
    // The intro owns the first stop: mark the mount-time scene as already
    // shown so the scene-bubble effect below doesn't queue a swap that
    // yanks the greeting the moment its protection window closes. The next
    // COMMITTED scene change swaps naturally.
    setShownContentKey(contentKey)
    // Only marks the intro "seen" in sessionStorage once it's actually been
    // ON SCREEN for INTRO_SEEN_WRITE_MS — if this GuideBody instance
    // unmounts before then (visitor scrolled back up into the hero, killing
    // the guide entirely), the cleanup below cancels the write, so the
    // intro re-arms and gets a genuine chance to show next time the guide
    // appears, instead of being permanently (and wrongly) marked seen.
    const seenTimer = setTimeout(() => writeSessionFlag(INTRO_SEEN_STORAGE_KEY), INTRO_SEEN_WRITE_MS)
    return () => clearTimeout(seenTimer)
    // Fires once per GuideBody mount only, gated by the session flag above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Scene bubble — appears the instant a scene COMMITS and stays up until
  // the scene changes or the visitor dismisses it. No scroll listener here
  // at all: the reading-band engine upstream already served the dwell +
  // velocity gate (a second wait here would read as lag), and nothing
  // hides the bubble on scroll anymore — the old scroll-hide model is what
  // made bubbles vanish mid-read for slow scrollers. If the intro is still
  // inside its protected window, the swap defers until that window closes
  // instead of being dropped.
  useEffect(() => {
    if (shownContentKey === contentKey) return
    let timer: ReturnType<typeof setTimeout> | null = null
    function show() {
      timer = null
      const state = bubbleRef.current
      if (state?.kind === "intro") {
        const shownAt = introShownAtRef.current
        const remaining = shownAt === null ? 0 : INTRO_MIN_DISPLAY_MS - (Date.now() - shownAt)
        if (remaining > 0) {
          timer = setTimeout(show, remaining)
          return
        }
      }
      setShownContentKey(contentKey)
      setBubble({ kind: "waypoint", text: waypointLine, key: contentKey })
    }
    show()
    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [contentKey, waypointLine, shownContentKey])

  // Hover hints (owner direction #6) — highest-priority content: while
  // active, it overrides whatever intro/waypoint bubble would otherwise
  // show, without discarding that underlying bubble state (leaving the
  // hinted element just lets it show back through).
  const hoverHint = useWickHoverHints(!tabHidden)

  const displayKey = hoverHint !== null ? `hint:${hoverHint}` : bubble?.key ?? null
  const displayText = hoverHint !== null ? hoverHint : (bubble?.text ?? "")
  const showBubble = displayKey !== null && !tabHidden

  // Skips the typing-dots + per-word reveal for hover-hint swaps (always)
  // and for any re-display of a message already fully shown once this mount
  // (e.g. the section line reappearing after a hover excursion) — see
  // WickBubble's `instant` doc. Tracked as STATE (not a ref read during
  // render), same render-time-adjustment pattern as `trackedContentKey`
  // above: a key not yet in the set is "not seen" for THIS render, and gets
  // added via a conditional `setState` in the render body itself.
  const [seenBubbleKeys, setSeenBubbleKeys] = useState<ReadonlySet<string>>(() => new Set())
  const alreadySeenDisplayKey = displayKey !== null && seenBubbleKeys.has(displayKey)
  if (displayKey !== null && !seenBubbleKeys.has(displayKey)) {
    setSeenBubbleKeys((prev) => {
      const next = new Set(prev)
      next.add(displayKey)
      return next
    })
  }
  const instantBubble = hoverHint !== null || alreadySeenDisplayKey

  // Bubble side — flips off Wick's default (opens toward content, i.e.
  // "left") only if the anchor sits close enough to the right viewport edge
  // that opening further right would run the bubble off-screen.
  const rightPx = (viewport.w * waypoint.anchor.rightVw) / 100
  const bubbleSide: "left" | "right" = rightPx < EDGE_FLIP_THRESHOLD_PX ? "left" : "right"

  return (
    <div
      // Static host: `fixed top-0 right-0`, sized to exactly the Wick box.
      // Every waypoint/hero-handoff position is expressed as a translate
      // FROM this one corner (see anchorToTarget/centerToLocal) — a single
      // shared coordinate space for arrival, inter-waypoint travel, and
      // departure.
      className="pointer-events-none fixed top-0 right-0 z-40 hidden lg:block"
      style={{ width: WICK_SIZE, height: WICK_SIZE }}
    >
      <motion.div
        className="relative"
        initial={initial}
        animate={positionAnimate}
        exit={exitProps}
        transition={positionTransition}
      >
        <motion.div animate={bankControls} style={{ transformOrigin: "50% 62%" }}>
          <motion.div animate={bowControls}>
            <div
              className="transition-[filter] duration-base ease-out"
              style={{ filter: showBubble ? "brightness(1.15)" : "brightness(1)" }}
            >
              <Wick
                state={showBubble ? "curious" : "idle"}
                lookAt="left"
                flight="patrol"
                trail="always"
                moving={isFlying && !tabHidden}
                size={WICK_SIZE}
              />
            </div>
            {showHandoffTrail && <HandoffTrail size={WICK_SIZE} />}
          </motion.div>
        </motion.div>

        <AnimatePresence>
          {showBubble && displayKey && (
            <WickBubble
              key={displayKey}
              text={displayText}
              // Hidden while a hover hint is showing — dismissing the whole
              // guide from what's meant to be a light, transient swap would
              // be surprising; the X reappears once the hint clears.
              onDismiss={hoverHint !== null ? undefined : handleDismiss}
              reduceMotion={reduceMotion}
              side={bubbleSide}
              maxWidthPx={GUIDE_BUBBLE_MAX_WIDTH}
              instant={instantBubble}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

/**
 * Hover-hint mechanism (owner direction #6) — generic and self-contained:
 * any element anywhere on the page can carry `data-wick-hint="short line"`.
 * When the pointer rests over such an element for `HOVER_HINT_DWELL_MS`,
 * this returns that element's hint text; leaving clears it again after
 * `HOVER_HINT_RESTORE_MS`, so a quick pass-through doesn't cause a
 * swap-then-immediately-revert flash.
 *
 * Hover is a pure MANUAL OVERRIDE (reading-band redesign): it fires on
 * hover intent alone, with no stillness precondition — the old
 * scroll-stillness gate (and its retry chain) existed to reconcile hover
 * with the scroll-stop bubble model, and that model is gone. Pointing at
 * something answers immediately; the automatic scene bubble never depends
 * on the pointer at all, so touch devices lose nothing.
 *
 * Event-delegated (two listeners on `document`, not one per hinted element)
 * so future sections opt in just by adding the attribute — nothing to wire
 * up here. Pointer-only (never focus-driven), so it can never steal
 * keyboard focus from the element the visitor is actually interacting with.
 *
 * Sync-correctness invariants:
 *  - `commitHint` NEVER trusts the `target` it closed over for anything
 *    but identity comparison — the hint text itself is always re-read from
 *    `hoverElRef.current.getAttribute(...)` at the instant it fires, so a
 *    commit can only ever show the hint for whatever element is genuinely
 *    still being hovered right now, never a stale one.
 *  - `handlePointerOver` cancels BOTH the in-flight dwell (`clearDwell`)
 *    and any pending restore (`clearRestore`) the instant a *different*
 *    hinted element is entered — this is what makes an A→B direct hover
 *    swap update straight from A's hint to B's without ever flashing the
 *    underlying section/scene line in between.
 *  - `handlePointerOut` no-ops when `relatedTarget` is still inside the
 *    element being left (a child-to-child move within the same hinted
 *    element) — mousing over nested interactive children never restarts the
 *    dwell/restore cycle.
 */
function useWickHoverHints(active: boolean): string | null {
  const [hoverHint, setHoverHint] = useState<string | null>(null)
  const hoverElRef = useRef<Element | null>(null)

  useEffect(() => {
    if (!active) {
      // Synchronizing with an external input (dismissed/tabHidden going
      // true) — clears any stale hint rather than leaving it to show back
      // through if `active` later flips true again.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHoverHint(null)
      hoverElRef.current = null
      return
    }
    let dwellTimer: ReturnType<typeof setTimeout> | null = null
    let restoreTimer: ReturnType<typeof setTimeout> | null = null

    function clearDwell() {
      if (dwellTimer) {
        clearTimeout(dwellTimer)
        dwellTimer = null
      }
    }
    function clearRestore() {
      if (restoreTimer) {
        clearTimeout(restoreTimer)
        restoreTimer = null
      }
    }

    function commitHint(target: Element) {
      // The element being dwelt on has changed (or been left) since this
      // dwell started — a fresh pointerover/pointerout already owns the
      // timer slot (or cleared it), so this stale link is a no-op.
      if (hoverElRef.current !== target) return
      // Re-derived from the ref, never the closed-over `target`/a captured
      // hint string — this is the element genuinely under the pointer right
      // now, at the exact instant of commit.
      const hint = hoverElRef.current?.getAttribute("data-wick-hint")
      if (hint) setHoverHint(hint)
    }

    function handlePointerOver(event: PointerEvent) {
      const target = (event.target as Element | null)?.closest?.("[data-wick-hint]")
      if (!target || target === hoverElRef.current) return
      // New hinted target: any in-flight dwell for the previous target, and
      // any pending restore-to-section-line, are both canceled immediately —
      // this is what prevents a stale hint from landing late and what keeps
      // a direct A→B swap from ever flashing the underlying section line in
      // between.
      clearDwell()
      clearRestore()
      hoverElRef.current = target
      dwellTimer = setTimeout(() => commitHint(target), HOVER_HINT_DWELL_MS)
    }

    function handlePointerOut(event: PointerEvent) {
      const target = (event.target as Element | null)?.closest?.("[data-wick-hint]")
      if (!target || target !== hoverElRef.current) return
      const related = event.relatedTarget as Element | null
      // Child-to-child move within the same hinted element (e.g. a nested
      // interactive child) — not a real "leave", so no-op rather than
      // restarting the dwell/restore cycle.
      if (related && target.contains(related)) return
      clearDwell()
      hoverElRef.current = null
      restoreTimer = setTimeout(() => setHoverHint(null), HOVER_HINT_RESTORE_MS)
    }

    document.addEventListener("pointerover", handlePointerOver)
    document.addEventListener("pointerout", handlePointerOut)
    return () => {
      document.removeEventListener("pointerover", handlePointerOver)
      document.removeEventListener("pointerout", handlePointerOut)
      clearDwell()
      clearRestore()
    }
  }, [active])

  // Dev-only: mirror the currently-active hint text onto the DOM so test
  // harnesses (and manual QA) can assert "the hint currently shown matches
  // the element actually being hovered" without reaching into component
  // internals — exactly the class of bug this pass fixes. Stripped in
  // production builds; never affects behavior, only observability.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return
    if (typeof document === "undefined") return
    if (hoverHint) {
      document.body.setAttribute("data-wick-hint-source", hoverHint)
    } else {
      document.body.removeAttribute("data-wick-hint-source")
    }
    return () => {
      if (process.env.NODE_ENV !== "production") document.body.removeAttribute("data-wick-hint-source")
    }
  }, [hoverHint])

  return hoverHint
}

/** Eleven staggered amber motes trailing Wick during the hero-handoff arc
 *  only — richer than wick.tsx's own continuous movement trail, a one-shot
 *  burst for the "same bug goes below" moment specifically. Bumped from
 *  seven to eleven (owner direction #4: "9-12 sparkle motes along the
 *  path") to read as a longer, more theatrical wake given the bigger swoop
 *  (`HANDOFF_BOW_AMPLITUDE_X/Y`) it now trails behind. */
const HANDOFF_TRAIL_MOTES: Array<{ dx: number; dy: number; delay: number }> = [
  { dx: -10, dy: 4, delay: 0 },
  { dx: -16, dy: -4, delay: 0.04 },
  { dx: -14, dy: 10, delay: 0.08 },
  { dx: -22, dy: 6, delay: 0.13 },
  { dx: -20, dy: 2, delay: 0.18 },
  { dx: -26, dy: 14, delay: 0.22 },
  { dx: -8, dy: 14, delay: 0.26 },
  { dx: -18, dy: 16, delay: 0.3 },
  { dx: -24, dy: -8, delay: 0.34 },
  { dx: -6, dy: -10, delay: 0.38 },
  { dx: -12, dy: 20, delay: 0.42 },
]

function HandoffTrail({ size }: { size: number }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ width: size, height: size }}>
      {HANDOFF_TRAIL_MOTES.map((mote, index) => (
        <motion.span
          key={index}
          className="absolute rounded-full"
          style={{
            left: size / 2 + mote.dx - 2,
            top: size / 2 + mote.dy - 2,
            width: 4,
            height: 4,
            backgroundColor: "var(--amber-glow)",
          }}
          initial={{ opacity: 0.95, scale: 1 }}
          animate={{ opacity: 0, scale: 0.2 }}
          transition={{ duration: 0.55, delay: mote.delay, ease: easing.out }}
        />
      ))}
    </div>
  )
}

// Bubble rendering itself now lives in wick-bubble.tsx's shared `WickBubble`
// — used here AND by hero.tsx's scroll teaser, so the two "Wick talks"
// moments share one implementation. See the doc comment at the top of this
// file and `WickBubble`'s own doc for the split of responsibilities.
