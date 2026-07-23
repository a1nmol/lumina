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
 * Waypoints: the eight non-hero landing sections, keyed by the `data-scene`
 * attribute each section already renders (confirmed by reading the section
 * files directly — two of these have a different `id` than `data-scene`,
 * e.g. lamps' `id="how-it-works"` / `data-scene="lamps"`, so `data-scene` is
 * used throughout as the one consistent selector):
 *
 *   data-scene    | rendered by
 *   --------------|---------------------------------
 *   problem       | problem.tsx
 *   lamps         | lamps.tsx            (id="how-it-works")
 *   day-strip     | day-strip.tsx
 *   loop-board    | loop-board.tsx
 *   shop-picker   | shop-picker.tsx      (id="pick-your-shop")
 *   pilot-menu    | pilot-menu.tsx
 *   faq           | faq-signs.tsx
 *   final-cta     | final-cta.tsx
 *
 * Active-waypoint tracking mirrors day-strip.tsx's `DayStripStackedStory`
 * pattern: an IntersectionObserver with a thin center band
 * (`rootMargin: "-45% 0px -45% 0px"`) picks whichever watched section is
 * currently crossing the middle of the viewport. This observer keeps
 * running regardless of hero visibility, so the correct waypoint is already
 * known the instant the guide needs to mount.
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
import { X } from "lucide-react"

import {
  getHeroWickHandoffSnapshot,
  getHeroWickHandoffServerSnapshot,
  subscribeHeroWickHandoff,
  Wick,
} from "@/components/brand/wick"
import { duration, easing, springGentle, wordRevealMs } from "@/lib/motion"
import { cn } from "@/lib/utils"

const DISMISS_STORAGE_KEY = "lumina:guide-dismissed"
const INTRO_SEEN_STORAGE_KEY = "lumina:guide-intro-seen"
const DESKTOP_QUERY = "(min-width: 1024px)"

/** ~350ms of stillness after the last scroll event before a bubble pops — a
 *  "he noticed you stopped", not a rest-timer feel. */
const STOP_DELAY_MS = 350
/** Typing-dots phase before text starts appearing — "he's about to talk". */
const TYPING_DOTS_MS = 350

const WICK_SIZE = 56
/** Max bank angle while translating (deg), spring-settles to 0 on arrival. */
const BANK_MAX = 14
/** Lateral bow amplitude for the arc-flight curve (px). */
const BOW_AMPLITUDE = 24
const TRAVEL_DURATION = 0.6
const ENTRANCE_DURATION = 0.9
const EXIT_DURATION = 0.55
/** Bubble flips to Wick's other side once its anchor sits this close to the right viewport edge. */
const EDGE_FLIP_THRESHOLD_PX = 240

const INTRO_LINE =
  "Hey — I'm Wick. I keep the lights on around here. Scroll on, stop anywhere — I'll tell you what you're looking at."

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

const WAYPOINTS: Waypoint[] = [
  {
    id: "problem",
    line: "This is every evening without help — three customers, no answers.",
    // The counter-phone card sits mid-viewport, right-justified inside its
    // container but well short of the actual viewport edge at desktop
    // widths. Anchored high, clear of the card.
    anchor: { topVh: 20, rightVw: 6 },
    offsetX: 0,
    offsetY: -8,
  },
  {
    id: "lamps",
    line: "Three jobs Lumina handles. That's the whole idea.",
    // Three lamp columns fill the width edge-to-edge under the heading —
    // the empty band is right beside the centered headline, up top.
    anchor: { topVh: 16, rightVw: 7 },
    offsetX: -8,
    offsetY: 18,
  },
  {
    id: "day-strip",
    line: "One full day at your shop — keep scrolling to live it.",
    // The pinned stage is edge-to-edge (no side margin) with the chapter
    // rail on the LEFT and centered content in the middle — the only clear
    // spot is the top-right corner of the stage, above the sky band.
    anchor: { topVh: 13, rightVw: 8 },
    offsetX: 6,
    offsetY: -14,
  },
  {
    id: "loop-board",
    line: "Every thread is a customer a post brought in. No more guessing.",
    // Corkboard card is centered (max-w-3xl); heading sits above it —
    // anchored beside the heading, clear of the card and its string art.
    anchor: { topVh: 24, rightVw: 6 },
    offsetX: -10,
    offsetY: 8,
  },
  {
    id: "shop-picker",
    line: "Tap your kind of shop — the page redresses itself for you.",
    // Narrow centered content (pill tabs + demo card) — lots of margin.
    anchor: { topVh: 30, rightVw: 9 },
    offsetX: 8,
    offsetY: -16,
  },
  {
    id: "pilot-menu",
    line: "Free while we build together. This little form is the whole signup.",
    // Chalkboard card is centered and narrow (max-w-md) — very wide margins.
    anchor: { topVh: 26, rightVw: 11 },
    offsetX: -6,
    offsetY: 14,
  },
  {
    id: "faq",
    line: "The questions every owner asks us first.",
    anchor: { topVh: 20, rightVw: 9 },
    offsetX: 8,
    offsetY: -6,
  },
  {
    id: "final-cta",
    line: "Ready when you are.",
    // Near the button, per the plan — final-cta already renders its own
    // small inline Wick directly above the button in the centered column;
    // this anchor sits beside it (same vertical band, off to the side) so
    // the two never overlap.
    anchor: { topVh: 55, rightVw: 7 },
    offsetX: 0,
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
  const [dismissed, setDismissed] = useState(false)
  const [tabHidden, setTabHidden] = useState(false)

  const activeIdRef = useRef<string | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(readSessionFlag(DISMISS_STORAGE_KEY))
  }, [])

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

  // Active waypoint — center-band observer, same shape as
  // DayStripStackedStory in day-strip.tsx. Runs independently of hero
  // visibility so the correct waypoint is already resolved the instant
  // heroGone flips (no flash of the wrong section on handoff).
  useEffect(() => {
    if (!isDesktop) return
    const nodes = WAYPOINTS.map((w) => document.querySelector(`[data-scene="${w.id}"]`)).filter(
      (node): node is Element => node !== null
    )
    if (nodes.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        const intersecting = entries.filter((entry) => entry.isIntersecting)
        if (intersecting.length === 0) return
        const topMost = intersecting.reduce((a, b) => (a.boundingClientRect.top < b.boundingClientRect.top ? a : b))
        const id = topMost.target.getAttribute("data-scene")
        if (id && id !== activeIdRef.current) {
          activeIdRef.current = id
          setActiveId(id)
        }
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
    )
    nodes.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [isDesktop])

  const dismiss = useCallback(() => {
    setDismissed(true)
    writeSessionFlag(DISMISS_STORAGE_KEY)
  }, [])

  const waypoint = useMemo(() => WAYPOINTS.find((w) => w.id === activeId) ?? WAYPOINTS[0], [activeId])
  const shouldRender = isDesktop && !handoff.heroVisible && !!activeId

  return (
    <AnimatePresence>
      {shouldRender && (
        <GuideBody
          key="wick-guide"
          reduceMotion={!!reduceMotion}
          tabHidden={tabHidden}
          dismissed={dismissed}
          onDismiss={dismiss}
          waypoint={waypoint}
          viewport={viewport}
          heroCenter={handoff.center}
        />
      )}
    </AnimatePresence>
  )
}

type BubbleState = { kind: "intro" | "waypoint"; text: string; key: string }

function GuideBody({
  reduceMotion,
  tabHidden,
  dismissed,
  onDismiss,
  waypoint,
  viewport,
  heroCenter,
}: {
  reduceMotion: boolean
  tabHidden: boolean
  dismissed: boolean
  onDismiss: () => void
  waypoint: Waypoint
  viewport: { w: number; h: number }
  heroCenter: { x: number; y: number } | null
}) {
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

  const initial = reduceMotion
    ? { x: target.x, y: target.y, opacity: 0 }
    : localHeroStart
      ? { x: localHeroStart.x, y: localHeroStart.y, opacity: 0, scale: 0.7 }
      : { x: target.x, y: target.y, opacity: 0, scale: 0.85 }

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
        bowControls.start({ x: [0, bowSign * BOW_AMPLITUDE, 0] }, { duration: dur, ease: easing.out }),
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
  // waypoint; leaving and returning to it is a new visit). "Already shown
  // for this visit" is tracked as the id it was last shown for
  // (`shownWaypointId`), not a boolean ref, so the write can live inside
  // the scroll-timeout callback below rather than a bare effect body.
  const [bubble, setBubble] = useState<BubbleState | null>(null)
  const [shownWaypointId, setShownWaypointId] = useState<string | null>(null)
  const restTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clears a stale waypoint bubble and resets "already shown" the instant
  // the active waypoint itself changes — the same render-time-adjustment
  // pattern as `prevTarget` above (no external system involved, so no
  // effect needed: this is purely local state responding to a prop
  // change).
  const [trackedWaypointId, setTrackedWaypointId] = useState(waypoint.id)
  if (trackedWaypointId !== waypoint.id) {
    setTrackedWaypointId(waypoint.id)
    setShownWaypointId(null)
    if (bubble?.kind === "waypoint") setBubble(null)
  }

  useEffect(() => {
    if (dismissed) return
    if (readSessionFlag(INTRO_SEEN_STORAGE_KEY)) return
    // One-time read of an external system (sessionStorage) right at mount,
    // to decide whether to greet immediately — the intro has no scroll-stop
    // gate, so this can't be deferred into a scroll-driven callback the way
    // the waypoint bubble below is.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBubble({ kind: "intro", text: INTRO_LINE, key: "intro" })
    // Fires once per GuideBody mount only, gated by the session flag above
    // — deliberately not re-run if `dismissed` flips later in the same mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (dismissed) return
    function handleScroll() {
      setBubble((current) => {
        if (current?.kind === "intro") writeSessionFlag(INTRO_SEEN_STORAGE_KEY)
        return null
      })
      if (restTimerRef.current) clearTimeout(restTimerRef.current)
      restTimerRef.current = setTimeout(() => {
        if (shownWaypointId === waypoint.id) return
        setShownWaypointId(waypoint.id)
        setBubble({ kind: "waypoint", text: waypoint.line, key: waypoint.id })
      }, STOP_DELAY_MS)
    }
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", handleScroll)
      if (restTimerRef.current) clearTimeout(restTimerRef.current)
    }
  }, [dismissed, waypoint, shownWaypointId])

  const showBubble = bubble !== null && !dismissed && !tabHidden

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
        animate={{ x: target.x, y: target.y, opacity: 1, scale: 1 }}
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
          {showBubble && bubble && (
            <GuideBubble key={bubble.key} text={bubble.text} onDismiss={onDismiss} reduceMotion={reduceMotion} side={bubbleSide} />
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

/** Seven staggered amber motes trailing Wick during the hero-handoff arc
 *  only — richer than wick.tsx's own continuous movement trail, a one-shot
 *  burst for the "same bug goes below" moment specifically. */
const HANDOFF_TRAIL_MOTES: Array<{ dx: number; dy: number; delay: number }> = [
  { dx: -10, dy: 4, delay: 0 },
  { dx: -16, dy: -4, delay: 0.06 },
  { dx: -14, dy: 10, delay: 0.12 },
  { dx: -20, dy: 2, delay: 0.18 },
  { dx: -8, dy: 14, delay: 0.24 },
  { dx: -18, dy: 16, delay: 0.3 },
  { dx: -6, dy: -10, delay: 0.36 },
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

function GuideBubble({
  text,
  onDismiss,
  reduceMotion,
  side,
}: {
  text: string
  onDismiss: () => void
  reduceMotion: boolean
  side: "left" | "right"
}) {
  const words = useMemo(() => text.split(" "), [text])
  // Initial state already IS "dots"/0 — no reset-on-change effect needed:
  // the parent mounts a fresh `GuideBubble` (via `key={bubble.key}`) for
  // every distinct bubble, so this component's whole lifetime is exactly
  // one bubble's, and these are the correct starting values for it.
  const [phase, setPhase] = useState<"dots" | "typing">(reduceMotion ? "typing" : "dots")
  const [revealed, setRevealed] = useState(reduceMotion ? words.length : 0)

  useEffect(() => {
    if (reduceMotion) return
    const t = setTimeout(() => setPhase("typing"), TYPING_DOTS_MS)
    return () => clearTimeout(t)
  }, [reduceMotion])

  useEffect(() => {
    if (reduceMotion || phase !== "typing") return
    if (revealed >= words.length) return
    const t = setTimeout(() => setRevealed((n) => n + 1), wordRevealMs)
    return () => clearTimeout(t)
  }, [phase, revealed, words.length, reduceMotion])

  const isLeft = side === "left"

  return (
    <motion.div
      role="note"
      aria-live="off"
      initial={reduceMotion ? false : { opacity: 0, x: isLeft ? 8 : -8, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={
        reduceMotion
          ? { opacity: 0 }
          : { opacity: 0, scale: 0.96, transition: { duration: duration.fast, ease: easing.out } }
      }
      transition={reduceMotion ? { duration: 0 } : springGentle}
      className={cn(
        "pointer-events-auto absolute top-1/2 w-[200px] max-w-[200px] -translate-y-1/2 rounded-xl border border-border bg-card px-3 py-2.5 text-xs leading-snug text-card-foreground shadow-raised",
        isLeft ? "right-full mr-3" : "left-full ml-3"
      )}
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss guide"
        className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-soft transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <X className="size-3" aria-hidden="true" />
      </button>
      {reduceMotion || phase === "typing" ? (
        <span>{reduceMotion ? text : words.slice(0, revealed).join(" ")}</span>
      ) : (
        <TypingDots />
      )}
      {/* Tiny tail pointing at Wick. */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-1/2 size-3 -translate-y-1/2 rotate-45 rounded-[2px] border-border bg-card",
          isLeft ? "-right-1.5 border-t border-r" : "-left-1.5 border-b border-l"
        )}
      />
    </motion.div>
  )
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <motion.span
          key={index}
          className="size-1.5 rounded-full bg-muted-foreground"
          animate={{ y: [0, -3, 0] }}
          transition={{ duration: 0.5, repeat: Infinity, delay: index * 0.12, ease: easing.inOut }}
        />
      ))}
    </span>
  )
}
