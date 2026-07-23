"use client"

/**
 * WickGuide — Wick as a fixed scroll companion that escorts the visitor down
 * the landing page (landing-page-guide upgrade, additive to the Wick system
 * in wick.tsx).
 *
 * Handoff with the hero's own Wick (hero.tsx): two SEPARATE instances that
 * must never be visible at once. The hero owns its Wick for the hero section
 * only; this component watches the hero section itself via
 * IntersectionObserver and only renders once the hero has fully left the
 * viewport (`entry.isIntersecting === false` at `threshold: 0`, i.e. 0%
 * overlap — not just "mostly scrolled past"). Scrolling back up past the
 * hero's boundary hides this guide again and the hero's own Wick takes back
 * over, so there is always at most one Wick on screen.
 *
 * Waypoints: the eight non-hero landing sections, keyed by the `data-scene`
 * attribute each section already renders (confirmed by reading the section
 * files directly — see the mapping table below; note two of these have a
 * different `id` than `data-scene`, e.g. lamps' `id="how-it-works"` /
 * `data-scene="lamps"`, so `data-scene` is used throughout as the one
 * consistent selector):
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
 * currently crossing the middle of the viewport.
 *
 * Desktop-only, structural: the guide (including its observers) simply
 * doesn't run below `lg` — "the page already explains itself" on mobile per
 * the brief. Uses the same `useSyncExternalStore` matchMedia pattern as
 * `src/hooks/use-mobile.ts` so there's no post-hydration layout flash.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { X } from "lucide-react"

import { Wick } from "@/components/brand/wick"
import { duration, easing, springGentle } from "@/lib/motion"

const DISMISS_STORAGE_KEY = "lumina:guide-dismissed"
const REST_DELAY_MS = 900
const DESKTOP_QUERY = "(min-width: 1024px)"

type Waypoint = {
  /** Matches the section's `data-scene` attribute. */
  id: string
  /** Guide bubble copy — verbatim per the design brief. */
  line: string
  /** Subtle per-waypoint anchor offset (px) from the guide's resting position — the "flies to a slightly different spot" beat. Fixed/authored, not random. */
  offsetX: number
  offsetY: number
}

const WAYPOINTS: Waypoint[] = [
  {
    id: "problem",
    line: "This is every evening without help — three customers, no answers.",
    offsetX: 0,
    offsetY: -10,
  },
  {
    id: "lamps",
    line: "Three jobs Lumina handles. That's the whole idea.",
    offsetX: -10,
    offsetY: 22,
  },
  {
    id: "day-strip",
    line: "One full day at your shop — keep scrolling to live it.",
    offsetX: 8,
    offsetY: -18,
  },
  {
    id: "loop-board",
    line: "Every thread is a customer a post brought in. No more guessing.",
    offsetX: -14,
    offsetY: 10,
  },
  {
    id: "shop-picker",
    line: "Tap your kind of shop — the page redresses itself for you.",
    offsetX: 10,
    offsetY: -20,
  },
  {
    id: "pilot-menu",
    line: "Free while we build together. This little form is the whole signup.",
    offsetX: -8,
    offsetY: 18,
  },
  {
    id: "faq",
    line: "The questions every owner asks us first.",
    offsetX: 10,
    offsetY: -8,
  },
  {
    id: "final-cta",
    line: "Ready when you are.",
    offsetX: 0,
    offsetY: 14,
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
function readDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(DISMISS_STORAGE_KEY) === "1"
  } catch {
    return false
  }
}
function writeDismissed() {
  try {
    window.sessionStorage.setItem(DISMISS_STORAGE_KEY, "1")
  } catch {
    // Storage unavailable — the guide just won't remember the dismissal across this session.
  }
}

export function WickGuide() {
  const isDesktop = useSyncExternalStore(subscribeDesktop, getDesktopSnapshot, getDesktopServerSnapshot)
  const reduceMotion = useReducedMotion()

  const [heroGone, setHeroGone] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [isFlying, setIsFlying] = useState(false)
  const [bubbleVisible, setBubbleVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [tabHidden, setTabHidden] = useState(false)

  const activeIdRef = useRef<string | null>(null)
  const dismissedRef = useRef(false)
  const restTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Reads a one-time value from sessionStorage on mount — same pattern
    // (and same lint escape hatch) as notifications-provider.tsx's read of
    // its own session-scoped storage key.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(readDismissed())
  }, [])
  useEffect(() => {
    dismissedRef.current = dismissed
  }, [dismissed])

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

  // Hero handoff — the guide only exists once the hero's own Wick has fully
  // left the viewport. See the module doc above for why this is a strict
  // 0%-overlap check, not "mostly scrolled past".
  useEffect(() => {
    if (!isDesktop) return
    const hero = document.querySelector('[data-scene="hero"]')
    if (!hero) return
    const observer = new IntersectionObserver(([entry]) => setHeroGone(!entry.isIntersecting), { threshold: 0 })
    observer.observe(hero)
    return () => observer.disconnect()
  }, [isDesktop])

  // Active waypoint — center-band observer, same shape as
  // DayStripStackedStory in day-strip.tsx.
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
          setIsFlying(true)
          setBubbleVisible(false)
        }
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
    )
    nodes.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [isDesktop])

  // Rest detection — a bubble appears once the visitor has settled on a
  // section for ≥900ms; scrolling again fades it immediately. One scroll
  // listener drives both halves of that behavior.
  useEffect(() => {
    if (!isDesktop || dismissed) return
    function handleScroll() {
      setBubbleVisible(false)
      if (restTimerRef.current) clearTimeout(restTimerRef.current)
      restTimerRef.current = setTimeout(() => {
        if (activeIdRef.current && !dismissedRef.current) setBubbleVisible(true)
      }, REST_DELAY_MS)
    }
    window.addEventListener("scroll", handleScroll, { passive: true })
    handleScroll()
    return () => {
      window.removeEventListener("scroll", handleScroll)
      if (restTimerRef.current) clearTimeout(restTimerRef.current)
    }
  }, [isDesktop, dismissed])

  const dismiss = useCallback(() => {
    setBubbleVisible(false)
    setDismissed(true)
    writeDismissed()
  }, [])

  if (!isDesktop || !heroGone || !activeId) return null

  const waypoint = WAYPOINTS.find((w) => w.id === activeId) ?? WAYPOINTS[0]
  const showBubble = bubbleVisible && !dismissed && !tabHidden

  return (
    <div
      // Non-interactive by default — only the bubble's dismiss button opts
      // back into pointer events (see its own `pointer-events-auto` below).
      // Wick itself is already `aria-hidden` internally (wick.tsx); the
      // bubble text below is real, readable content and is deliberately NOT
      // nested under any `aria-hidden` ancestor.
      className="pointer-events-none fixed top-[35%] right-6 z-40 hidden -translate-y-1/2 lg:block xl:right-10"
    >
      <motion.div
        className="relative"
        animate={{ x: waypoint.offsetX, y: waypoint.offsetY }}
        transition={reduceMotion ? { duration: 0 } : springGentle}
        onAnimationComplete={() => setIsFlying(false)}
      >
        <Wick state="idle" flight="patrol" size={56} moving={isFlying && !tabHidden} />
        <AnimatePresence>
          {showBubble && <GuideBubble key={waypoint.id} text={waypoint.line} onDismiss={dismiss} reduceMotion={!!reduceMotion} />}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

function GuideBubble({
  text,
  onDismiss,
  reduceMotion,
}: {
  text: string
  onDismiss: () => void
  reduceMotion: boolean
}) {
  return (
    <motion.div
      role="note"
      aria-live="off"
      initial={reduceMotion ? false : { opacity: 0, x: 8, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 8, scale: 0.96 }}
      transition={reduceMotion ? { duration: 0 } : { duration: duration.base, ease: easing.out }}
      className="pointer-events-auto absolute top-1/2 right-full mr-3 w-[200px] max-w-[200px] -translate-y-1/2 rounded-xl border border-border bg-card px-3 py-2.5 text-xs leading-snug text-card-foreground shadow-raised"
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss guide"
        className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-soft transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <X className="size-3" aria-hidden="true" />
      </button>
      {text}
      {/* Tiny tail pointing at Wick, who sits to the bubble's right. */}
      <span
        aria-hidden="true"
        className="absolute top-1/2 -right-1.5 size-3 -translate-y-1/2 rotate-45 rounded-[2px] border-t border-r border-border bg-card"
      />
    </motion.div>
  )
}
