"use client"

/**
 * Wick — the Lumina firefly mascot.
 *
 * v1 is hand-authored SVG + Framer Motion, built as a genuine state machine
 * (discrete `WickState`s, one-shot vs. looping states, an `onComplete`
 * callback for one-shot states) so a future upgrade to a real Rive `.riv`
 * rig (see docs/design-briefs/brand-redesign-plan.md §4/§9 gate 4) is a
 * drop-in swap behind this SAME component API — `<Wick state size lookAt
 * onComplete />` — nothing that imports `Wick` should need to change.
 *
 * DEPLOYMENT RULES (brand-redesign-plan.md §4 — enforced by convention +
 * a dev-only console warning below, not by hard blocking):
 *   ALLOWED : empty states, onboarding steps, form nudges, success/
 *             celebration toasts, 404, "reminders enabled", first-lead-
 *             captured, landing-page guide.
 *   BANNED  : pricing/billing, settings, dense tables, security surfaces,
 *             error-recovery for real failures — whimsy near money or
 *             trust erodes both.
 */

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { usePathname } from "next/navigation"
import { motion, useAnimationControls, useReducedMotion, type Transition } from "framer-motion"

import { WickBubble } from "@/components/brand/wick-bubble"
import { cn } from "@/lib/utils"
import { easing, springGentle } from "@/lib/motion"

export type WickState = "idle" | "curious" | "thinking" | "celebrating" | "sleeping" | "oops"

/**
 * Continuous flight behavior, layered UNDER the discrete `state` machine
 * above (additive — landing brief §2). "perch" (default) is a no-op: Wick
 * stays put, identical to pre-flight-prop behavior. "patrol" adds a gentle
 * always-on figure-8 position drift while `state === "idle"` (paused
 * automatically for curious/thinking/celebrating/sleeping/oops so it never
 * fights those states' own motion), plus two small "alive" details that run
 * for the whole time Wick is in patrol mode regardless of `state`: an
 * occasional blink and a rare micro-dart hop.
 */
export type WickFlight = "perch" | "patrol"

/** A custom drift waypoint (px, relative to Wick's resting position). */
export type WickPathPoint = { x: number; y: number }

export type WickProps = {
  /** Which state-machine state to render. Defaults to "idle". */
  state?: WickState
  /** Pixel size (square) — the SVG viewBox is fixed at 90x90 and scales. */
  size?: number
  /** Only meaningful in the "curious" state — which way Wick leans/looks. */
  lookAt?: "left" | "right"
  className?: string
  /**
   * Fires once when a one-shot state ("celebrating" or "oops") finishes
   * playing. Callers own the state machine — e.g. flip `state` back to
   * "idle" here. Never fires for looping states.
   */
  onComplete?: () => void
  /** Continuous flight behavior — see `WickFlight`. Defaults to "perch". */
  flight?: WickFlight
  /**
   * Optional custom drift waypoints for "patrol" flight, in place of the
   * built-in gentle figure-8. Looped in order (auto-closed back to the
   * first point). Ignored when `flight` is "perch".
   */
  path?: WickPathPoint[]
  /**
   * Movement-trail mode (additive, landing-page-guide upgrade). "auto"
   * (default) is unchanged for every existing call site: the continuous
   * trail plays only for micro-darts and externally-driven `moving` flight,
   * never for plain "patrol" drift (too slow/continuous to read as motion)
   * and never alongside `celebrating` (its own one-shot burst). "always" is
   * for the landing-page scroll guide specifically — owner direction: "this
   * overrides the earlier restraint for the guide instance only" — so the
   * trail plays for ANY translation, including patrol's own idle drift,
   * because the guide is meant to read as perpetually leaving a faint
   * sparkle wake while he hosts the page.
   */
  trail?: "auto" | "always"
  /**
   * External "I'm translating right now" signal — additive, ORed into the
   * internal `isMoving` derivation (patrol drift / micro-dart / celebrating
   * already flip it on their own). For callers that move Wick themselves via
   * an outer transform (e.g. the landing-page scroll guide flying between
   * waypoints) so wings still flutter/trail during that externally-driven
   * flight. Defaults to false — a no-op for every existing call site.
   */
  moving?: boolean
  /**
   * True when this instance is persistent app CHROME — the Companion dock's
   * Home orb (src/components/companion/dock.tsx, C1) — rather than a
   * page-content whimsy moment. Chrome is mounted on every route by design
   * (Home must be reachable from Settings/Admin too), so it's exempt from
   * the banned-surface dev warning below: that guard exists to catch Wick
   * dropped into a dense settings/billing page as decoration, not a small
   * wordless nav icon that's structurally identical to any other dock glyph.
   * Defaults to false — every existing call site is unaffected.
   */
  chrome?: boolean
}

const ONE_SHOT_STATES: ReadonlySet<WickState> = new Set(["celebrating", "oops"])

const BANNED_PATH_FRAGMENTS = ["/admin", "/settings"]
/**
 * Carve-out from the banned fragments above — `/settings/brain` is the
 * Business Brain setup WIZARD, which DESIGN_SYSTEM.md's "signature moments"
 * and brand-redesign-plan.md's allowed-surface list (§4: "onboarding
 * steps") both explicitly call out as a Wick surface, even though its route
 * happens to nest under the otherwise-banned `/settings` prefix (dense
 * account/billing/channel settings, which stay banned). Prefix-matched so
 * the wizard's own sub-routes (if any) stay covered too.
 */
const ALLOWED_PATH_OVERRIDES = ["/settings/brain"]

/** Route/instance-independent module-level cache so we only warn once per pathname per session, not once per re-render. */
const warnedPaths = new Set<string>()

function useBannedSurfaceGuard(chrome: boolean) {
  const pathname = usePathname()
  useEffect(() => {
    if (chrome) return
    if (process.env.NODE_ENV === "production") return
    if (!pathname) return
    if (ALLOWED_PATH_OVERRIDES.some((allowed) => pathname === allowed || pathname.startsWith(`${allowed}/`))) return
    const hit = BANNED_PATH_FRAGMENTS.find((fragment) => pathname.includes(fragment))
    if (hit && !warnedPaths.has(pathname)) {
      warnedPaths.add(pathname)
      console.warn(
        `[Wick] rendered under "${pathname}" (matches "${hit}"). Wick is banned from pricing/billing/settings/dense-table/security surfaces per docs/design-briefs/brand-redesign-plan.md §4. Remove this usage or move it to an allowed surface.`
      )
    }
  }, [pathname, chrome])
}

/** Loop-de-loop flight keyframes for the "celebrating" one-shot: a full circular loop that returns to the origin, sampled at 11 steps. Computed once at module load — no per-render trig cost. */
function buildLoopKeyframes(steps = 10, radius = 15) {
  const x: number[] = []
  const y: number[] = []
  const rotate: number[] = []
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    const angle = t * Math.PI * 2
    x.push(Number((radius * Math.sin(angle)).toFixed(2)))
    y.push(Number((-radius * (1 - Math.cos(angle))).toFixed(2)))
    rotate.push(Number((t * 360).toFixed(1)))
  }
  return { x, y, rotate }
}

const LOOP_KEYFRAMES = buildLoopKeyframes()
const CELEBRATE_DURATION = 1.2
const OOPS_DURATION = 0.6

/** "patrol" flight — gentle default figure-8 drift (±12px x, ±8px y), one full loop ≈ 7s. */
const PATROL_FIGURE8_X = [0, 8, 12, 8, 0, -8, -12, -8, 0]
const PATROL_FIGURE8_Y = [0, -6, 0, 6, 8, 6, 0, -6, 0]
const PATROL_DRIFT_DURATION = 7

/** "patrol" flight — micro-dart hop cadence/shape (rare, quick hop + spring-ish settle). */
const DART_INTERVAL_MS = 11_000
const DART_OUT: Transition = { duration: 0.22, ease: easing.out }
const DART_SETTLE: Transition = { duration: 0.45, ease: easing.spring }

/** "patrol" flight — occasional blink cadence (randomized 4–6s) + squash shape (~120ms total). */
const BLINK_MIN_MS = 4_000
const BLINK_JITTER_MS = 2_000
const BLINK_DOWN: Transition = { duration: 0.06, ease: easing.inOut }
const BLINK_UP: Transition = { duration: 0.06, ease: easing.inOut }

/** Fixed (non-random) sparkle offsets trailing the loop path — deterministic so there's no hydration/SSR mismatch risk if this ever renders during a transition. */
const SPARKLE_OFFSETS: Array<{ dx: number; dy: number; delay: number }> = [
  { dx: -6, dy: 4, delay: 0 },
  { dx: -12, dy: -2, delay: 0.08 },
  { dx: -14, dy: 8, delay: 0.16 },
  { dx: -8, dy: 14, delay: 0.24 },
  { dx: -18, dy: 12, delay: 0.32 },
]

/**
 * Movement-trail motes (additive, landing-page-guide upgrade) — a smaller,
 * quicker cousin of `SPARKLE_OFFSETS` for the "translating right now" trail
 * (micro-darts + externally-driven flight, e.g. the scroll guide). Kept
 * separate from the celebration burst so the two never render at once (see
 * `isTrailActive` below) and so this one can loop continuously instead of
 * playing once. Fixed offsets — same determinism rationale as above.
 */
const TRAIL_OFFSETS: Array<{ dx: number; dy: number; delay: number }> = [
  { dx: -8, dy: 3, delay: 0 },
  { dx: -13, dy: -3, delay: 0.09 },
  { dx: -10, dy: 9, delay: 0.18 },
]
/** Each mote's single fade lives 200–400ms per the brief; 300ms sits in the middle. */
const TRAIL_MOTE_DURATION = 0.3
const TRAIL_MOTE_REPEAT_DELAY = 0.22

/** Wing flutter (moving) vs. idle sway (at rest) — additive, landing-page-guide upgrade. Base resting angles match the original static `transform="rotate(...)"` values so baking them into animated `rotate` keyframes below doesn't shift Wick's silhouette at rest. */
const WING_BASE_ANGLE = { back: -18, front: -6 } as const
const WING_FLUTTER_AMPLITUDE = 14
const WING_FLUTTER_DURATION = 0.09
const WING_IDLE_SWAY_AMPLITUDE = 3
const WING_IDLE_SWAY_DURATION = 1.2

/** Tail-glow brightness noise (additive) — a low-amplitude, irregularly-timed wander layered UNDER the existing per-state pulse (`glowSpecFor`) so the glow reads bio-luminescent rather than a clean blinking LED. Multiplicative with the per-state opacity group it nests inside, so it wanders ±~8% around whatever that state's current base is — deliberately uneven `times` (not evenly spaced) so the cycle doesn't read as a metronome. */
const GLOW_NOISE_OPACITY = [1, 0.93, 1, 1.06, 0.97, 1.04, 1]
const GLOW_NOISE_TIMES = [0, 0.17, 0.31, 0.52, 0.68, 0.86, 1]
const GLOW_NOISE_DURATION = 4.2

type GlowSpec = { opacity: number[] | number; transition?: Transition }

function glowSpecFor(state: WickState): GlowSpec {
  switch (state) {
    case "idle":
      return { opacity: [0.55, 0.95, 0.55], transition: { duration: 2.6, repeat: Infinity, ease: easing.inOut } }
    case "curious":
      return { opacity: [0.6, 1, 0.6], transition: { duration: 1.8, repeat: Infinity, ease: easing.inOut } }
    case "thinking":
      // Heartbeat: quick double-pulse, then a longer rest.
      return {
        opacity: [0.5, 1, 0.65, 1, 0.5],
        transition: { duration: 1.1, repeat: Infinity, ease: easing.inOut, times: [0, 0.18, 0.32, 0.5, 1] },
      }
    case "sleeping":
      return { opacity: [0.15, 0.32, 0.15], transition: { duration: 3.4, repeat: Infinity, ease: easing.inOut } }
    case "celebrating":
      return { opacity: [0.9, 1, 0.85, 1], transition: { duration: CELEBRATE_DURATION, ease: easing.inOut } }
    case "oops":
      return {
        opacity: [0.85, 0.15, 0.85, 0.15, 0.85],
        transition: { duration: OOPS_DURATION, ease: easing.inOut },
      }
    default:
      return { opacity: 0.7 }
  }
}

/** Static (reduced-motion) opacity per state — a single resting value, no loops. */
const STATIC_GLOW_OPACITY: Record<WickState, number> = {
  idle: 0.75,
  curious: 0.85,
  thinking: 0.9,
  celebrating: 1,
  sleeping: 0.25,
  oops: 0.6,
}

/**
 * Wick, rendered as a small rounded firefly: dusk-indigo body, one big
 * friendly eye, two translucent indigo wings, and a layered amber tail-glow.
 * Always decorative — always `aria-hidden`.
 */
export function Wick({
  state = "idle",
  size = 90,
  lookAt = "right",
  className,
  onComplete,
  flight = "perch",
  path,
  trail = "auto",
  moving: movingProp = false,
  chrome = false,
}: WickProps) {
  useBannedSurfaceGuard(chrome)
  const reduceMotion = useReducedMotion()
  const filterId = useId()
  const wingBlurId = `wick-wing-blur-${filterId}`
  const glowBlurOuterId = `wick-glow-outer-${filterId}`
  const glowBlurMidId = `wick-glow-mid-${filterId}`
  const glowUnderId = `wick-glow-under-${filterId}`
  const bodyGradientId = `wick-body-gradient-${filterId}`
  const underGradientId = `wick-under-gradient-${filterId}`

  const isSleeping = state === "sleeping"
  const isCelebrating = state === "celebrating"
  const showSparkles = isCelebrating && !reduceMotion

  const pupilX = state === "curious" ? (lookAt === "left" ? 59.5 : 66.5) : 63

  const glow = glowSpecFor(state)

  // "patrol" flight — see WickFlight doc. Timers (blink/dart) run for the
  // whole time Wick is in patrol mode; the position drift itself only runs
  // while `state === "idle"` so it never fights curious/thinking/
  // celebrating/sleeping/oops's own motion.
  const patrolTimersActive = flight === "patrol" && !reduceMotion
  const driftActive = patrolTimersActive && state === "idle"
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  const drift = useMemo(() => {
    if (path && path.length > 1) {
      const closed = [...path, path[0]]
      return {
        x: closed.map((p) => p.x),
        y: closed.map((p) => p.y),
        duration: Math.max(4, path.length * 1.4),
      }
    }
    return { x: PATROL_FIGURE8_X, y: PATROL_FIGURE8_Y, duration: PATROL_DRIFT_DURATION }
  }, [path])

  // Tracks whether the micro-dart hop is actually in flight right now (not
  // just "the timer fired") — feeds `isMoving`/`isTrailActive` below so wing
  // flutter + the movement trail only run for the ~0.67s the hop itself
  // takes, not the whole 11s interval between hops.
  const [isDarting, setIsDarting] = useState(false)
  const dartControls = useAnimationControls()
  useEffect(() => {
    if (!patrolTimersActive) return
    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout>
    const scheduleDart = () => {
      timeoutId = setTimeout(async () => {
        if (cancelled) return
        // Only actually hop while resting/idle — skip (but keep the clock
        // running) if Wick is mid curious/thinking/celebrating/etc., or if
        // the tab is backgrounded (cost discipline: no animation work the
        // user can't see; the chain re-arms so he resumes on return).
        if (stateRef.current === "idle" && !document.hidden) {
          setIsDarting(true)
          await dartControls.start({ x: 20, y: -6, transition: DART_OUT })
          if (cancelled) return
          await dartControls.start({ x: 0, y: 0, transition: DART_SETTLE })
          if (!cancelled) setIsDarting(false)
        }
        if (!cancelled) scheduleDart()
      }, DART_INTERVAL_MS)
    }
    scheduleDart()
    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [patrolTimersActive, dartControls])

  // "isMoving" — additive, landing-page-guide upgrade. True whenever Wick is
  // actually translating: patrol drift, a micro-dart hop, the celebrating
  // loop-flight, or an externally-driven flight (the scroll guide's
  // waypoint-to-waypoint spring). Drives wing flutter (vs. idle sway).
  const isMoving = driftActive || isDarting || isCelebrating || movingProp
  // "isTrailActive" — a narrower subset of the above for the movement-trail
  // motes: deliberately EXCLUDES plain patrol drift (too slow/continuous —
  // a constant sparkle trail on every idle firefly would read as noise, not
  // motion) and celebrating (which already gets its own dedicated
  // `WickSparkleTrail` burst, so the two never double up). `trail="always"`
  // (the landing-page guide only) opts back INTO patrol drift too — see the
  // prop doc above.
  const isTrailActive = trail === "always" ? isMoving && !isCelebrating : (isDarting || movingProp) && !isCelebrating

  const blinkControls = useAnimationControls()
  useEffect(() => {
    if (!patrolTimersActive) return
    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout>
    const scheduleBlink = () => {
      timeoutId = setTimeout(async () => {
        if (cancelled) return
        // Skip the blink while backgrounded (see dart timer note) but keep
        // the chain alive so blinking resumes when the tab returns.
        if (!document.hidden) {
          await blinkControls.start({ scaleY: 0.15, transition: BLINK_DOWN })
          if (cancelled) return
          await blinkControls.start({ scaleY: 1, transition: BLINK_UP })
        }
        if (!cancelled) scheduleBlink()
      }, BLINK_MIN_MS + Math.random() * BLINK_JITTER_MS)
    }
    scheduleBlink()
    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [patrolTimersActive, blinkControls])

  // Body motion targets (position/rotation) per looping state.
  const bodyAnimate = useMemo(() => {
    switch (state) {
      case "idle":
        return { y: [0, -3, 0], x: 0, rotate: 0 }
      case "curious":
        return { y: [0, -2, 0], x: 0, rotate: lookAt === "left" ? -10 : 10 }
      case "thinking":
        return { y: [0, -1, 0], x: 0, rotate: 0 }
      case "sleeping":
        return { y: 4, x: 0, rotate: 0 }
      case "celebrating":
        return { x: LOOP_KEYFRAMES.x, y: LOOP_KEYFRAMES.y, rotate: LOOP_KEYFRAMES.rotate }
      case "oops":
        return { x: 0, y: 0, rotate: [0, -6, 6, -4, 4, 0] }
      default:
        return { y: 0, x: 0, rotate: 0 }
    }
  }, [state, lookAt])

  const bodyTransition = useMemo((): Transition => {
    switch (state) {
      case "idle":
        return { y: { duration: 3, repeat: Infinity, ease: easing.inOut }, rotate: springGentle, x: springGentle }
      case "curious":
        return {
          y: { duration: 1.4, repeat: Infinity, ease: easing.inOut },
          rotate: springGentle,
          x: springGentle,
        }
      case "thinking":
        return { y: { duration: 2, repeat: Infinity, ease: easing.inOut }, rotate: springGentle, x: springGentle }
      case "sleeping":
        return { y: springGentle, x: springGentle, rotate: springGentle }
      case "celebrating":
        return { duration: CELEBRATE_DURATION, ease: easing.inOut }
      case "oops":
        return { duration: OOPS_DURATION, ease: easing.inOut }
      default:
        return springGentle
    }
  }, [state])

  const prevOneShot = useRef<WickState | null>(null)
  function handleBodyAnimationComplete() {
    if (ONE_SHOT_STATES.has(state) && prevOneShot.current !== state) {
      // Guards StrictMode / re-render double-fires of onAnimationComplete for the same one-shot.
      prevOneShot.current = state
      onComplete?.()
    }
  }
  useEffect(() => {
    if (!ONE_SHOT_STATES.has(state)) prevOneShot.current = null
  }, [state])

  const px = `${size}px`

  if (reduceMotion) {
    return (
      <span
        aria-hidden="true"
        className={cn("inline-block", className)}
        style={{ width: px, height: px }}
      >
        <svg
          viewBox="0 0 90 90"
          width={size}
          height={size}
          style={{ overflow: "visible" }}
        >
          <WickDefs
            wingBlurId={wingBlurId}
            glowBlurOuterId={glowBlurOuterId}
            glowBlurMidId={glowBlurMidId}
            glowUnderId={glowUnderId}
            bodyGradientId={bodyGradientId}
            underGradientId={underGradientId}
          />
          <g style={{ transform: isSleeping ? "translateY(4px)" : "none" }}>
            <WickWings wingBlurId={wingBlurId} animated={false} />
            <WickGlow
              glowBlurOuterId={glowBlurOuterId}
              glowBlurMidId={glowBlurMidId}
              glowUnderId={glowUnderId}
              underGradientId={underGradientId}
              opacity={STATIC_GLOW_OPACITY[state]}
              animated={false}
            />
            <WickBody bodyGradientId={bodyGradientId} />
            <WickEye closed={isSleeping} pupilX={pupilX} animated={false} />
          </g>
        </svg>
      </span>
    )
  }

  return (
    // Outer layer: "patrol" flight's continuous figure-8 (or custom `path`)
    // drift — a plain CSS transform on its own compositing layer, so it
    // never collides with the state machine's own y/x/rotate below.
    <motion.span
      aria-hidden="true"
      className={cn("inline-block", className)}
      style={{ width: px, height: px }}
      animate={driftActive ? { x: drift.x, y: drift.y } : { x: 0, y: 0 }}
      transition={driftActive ? { duration: drift.duration, repeat: Infinity, ease: easing.inOut } : springGentle}
    >
      {/* Middle layer: the rare micro-dart hop, imperatively triggered — see
          the dartControls effect above. Independent transform layer so it
          composes with the drift above instead of fighting over the same
          motion value. */}
      <motion.span className="inline-block" style={{ width: px, height: px }} initial={{ x: 0, y: 0 }} animate={dartControls}>
        <svg viewBox="0 0 90 90" width={size} height={size} style={{ overflow: "visible" }}>
          <WickDefs
            wingBlurId={wingBlurId}
            glowBlurOuterId={glowBlurOuterId}
            glowBlurMidId={glowBlurMidId}
            glowUnderId={glowUnderId}
            bodyGradientId={bodyGradientId}
            underGradientId={underGradientId}
          />
          {showSparkles && <WickSparkleTrail />}
          {isTrailActive && !showSparkles && <WickMotionTrail />}
          <motion.g
            animate={bodyAnimate}
            transition={bodyTransition}
            onAnimationComplete={handleBodyAnimationComplete}
          >
            <WickWings wingBlurId={wingBlurId} moving={isMoving} />
            <motion.g animate={{ opacity: glow.opacity }} transition={glow.transition}>
              <WickGlow
                glowBlurOuterId={glowBlurOuterId}
                glowBlurMidId={glowBlurMidId}
                glowUnderId={glowUnderId}
                underGradientId={underGradientId}
                opacity={1}
              />
            </motion.g>
            <WickBody bodyGradientId={bodyGradientId} />
            {/* Occasional blink, imperatively triggered — see the
                blinkControls effect above. */}
            <motion.g initial={{ scaleY: 1 }} animate={blinkControls} style={{ transformOrigin: "63px 39px" }}>
              <WickEye closed={isSleeping} pupilX={pupilX} />
            </motion.g>
          </motion.g>
        </svg>
      </motion.span>
    </motion.span>
  )
}

function WickDefs({
  wingBlurId,
  glowBlurOuterId,
  glowBlurMidId,
  glowUnderId,
  bodyGradientId,
  underGradientId,
}: {
  wingBlurId: string
  glowBlurOuterId: string
  glowBlurMidId: string
  glowUnderId: string
  bodyGradientId: string
  underGradientId: string
}) {
  return (
    <defs>
      <filter id={wingBlurId} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="0.6" />
      </filter>
      <filter id={glowBlurOuterId} x="-150%" y="-150%" width="400%" height="400%">
        <feGaussianBlur stdDeviation="3.2" />
      </filter>
      <filter id={glowBlurMidId} x="-150%" y="-150%" width="400%" height="400%">
        <feGaussianBlur stdDeviation="1.5" />
      </filter>
      {/* Soft blur for the ambient under-glow (natural-light upgrade) — wide and shallow so it reads as a diffuse cast, not a hard-edged ellipse. */}
      <filter id={glowUnderId} x="-100%" y="-200%" width="300%" height="500%">
        <feGaussianBlur stdDeviation="4" />
      </filter>
      <linearGradient id={bodyGradientId} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--wick-body-light, oklch(0.4 0.05 280))" />
        <stop offset="100%" stopColor="var(--wick-body, oklch(0.28 0.045 280))" />
      </linearGradient>
      {/* Under-glow radial cast (natural-light upgrade) — a faint warm falloff, like real light landing on the air/surface beneath him. */}
      <radialGradient id={underGradientId} cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="var(--amber-glow, oklch(0.78 0.14 80))" stopOpacity="0.9" />
        <stop offset="100%" stopColor="var(--amber-glow, oklch(0.78 0.14 80))" stopOpacity="0" />
      </radialGradient>
    </defs>
  )
}

function WickWings({
  wingBlurId,
  moving = false,
  animated = true,
}: {
  wingBlurId: string
  /** Rapid flutter while translating vs. a slow settle-sway at rest — see `WING_*` constants. Ignored when `animated` is false. */
  moving?: boolean
  /** false under reduced-motion: wings render at their fixed resting angle, no flutter/sway. */
  animated?: boolean
}) {
  if (!animated) {
    return (
      <g style={{ opacity: 1 }}>
        <ellipse
          cx="30"
          cy="28"
          rx="14"
          ry="7"
          transform={`rotate(${WING_BASE_ANGLE.back} 30 28)`}
          style={{ fill: "var(--wick-wing, oklch(0.68 0.17 277))", opacity: 0.22 }}
          filter={`url(#${wingBlurId})`}
        />
        <ellipse
          cx="38"
          cy="26"
          rx="12"
          ry="6"
          transform={`rotate(${WING_BASE_ANGLE.front} 38 26)`}
          style={{ fill: "var(--wick-wing, oklch(0.68 0.17 277))", opacity: 0.32 }}
          filter={`url(#${wingBlurId})`}
        />
      </g>
    )
  }
  // Base angle is baked into the animated `rotate` keyframes (rather than
  // left on the SVG `transform` attribute) because a CSS `transform` from
  // Framer Motion's inline style would otherwise silently win over the
  // presentation attribute and reset the resting tilt to 0.
  const backRotate = moving
    ? [
        WING_BASE_ANGLE.back - WING_FLUTTER_AMPLITUDE,
        WING_BASE_ANGLE.back + WING_FLUTTER_AMPLITUDE,
        WING_BASE_ANGLE.back - WING_FLUTTER_AMPLITUDE,
      ]
    : [
        WING_BASE_ANGLE.back - WING_IDLE_SWAY_AMPLITUDE,
        WING_BASE_ANGLE.back + WING_IDLE_SWAY_AMPLITUDE,
        WING_BASE_ANGLE.back - WING_IDLE_SWAY_AMPLITUDE,
      ]
  const frontRotate = moving
    ? [
        WING_BASE_ANGLE.front + WING_FLUTTER_AMPLITUDE,
        WING_BASE_ANGLE.front - WING_FLUTTER_AMPLITUDE,
        WING_BASE_ANGLE.front + WING_FLUTTER_AMPLITUDE,
      ]
    : [
        WING_BASE_ANGLE.front + WING_IDLE_SWAY_AMPLITUDE,
        WING_BASE_ANGLE.front - WING_IDLE_SWAY_AMPLITUDE,
        WING_BASE_ANGLE.front + WING_IDLE_SWAY_AMPLITUDE,
      ]
  const flutterOpacity = moving ? [0.22, 0.32, 0.22] : [0.22, 0.26, 0.22]
  const flutterOpacityFront = moving ? [0.32, 0.42, 0.32] : [0.32, 0.36, 0.32]
  const transition = moving
    ? { duration: WING_FLUTTER_DURATION, repeat: Infinity, ease: easing.inOut }
    : { duration: WING_IDLE_SWAY_DURATION, repeat: Infinity, ease: easing.inOut }
  return (
    <g>
      <motion.ellipse
        cx="30"
        cy="28"
        rx="14"
        ry="7"
        style={{ fill: "var(--wick-wing, oklch(0.68 0.17 277))", transformOrigin: "30px 28px" }}
        filter={`url(#${wingBlurId})`}
        animate={{ rotate: backRotate, opacity: flutterOpacity }}
        transition={transition}
      />
      <motion.ellipse
        cx="38"
        cy="26"
        rx="12"
        ry="6"
        style={{ fill: "var(--wick-wing, oklch(0.68 0.17 277))", transformOrigin: "38px 26px" }}
        filter={`url(#${wingBlurId})`}
        animate={{ rotate: frontRotate, opacity: flutterOpacityFront }}
        transition={transition}
      />
    </g>
  )
}

function WickGlow({
  glowBlurOuterId,
  glowBlurMidId,
  glowUnderId,
  underGradientId,
  opacity,
  animated = true,
}: {
  glowBlurOuterId: string
  glowBlurMidId: string
  glowUnderId: string
  underGradientId: string
  opacity: number
  /** false under reduced-motion: layers render at a fixed brightness, no noise wander. */
  animated?: boolean
}) {
  const layers = (
    <>
      {/* Outer bloom — faint amber-orange, the coolest/farthest-falling edge of the light. */}
      <ellipse
        cx="26"
        cy="52"
        rx="15"
        ry="13"
        style={{ fill: "var(--wick-glow-outer, oklch(0.72 0.15 55))", opacity: 0.4 }}
        filter={`url(#${glowBlurOuterId})`}
      />
      {/* Mid bloom — amber, the "signature" tail-glow color used elsewhere in the brand. */}
      <ellipse
        cx="26"
        cy="52"
        rx="9"
        ry="8"
        style={{ fill: "var(--amber-glow, oklch(0.78 0.14 80))", opacity: 0.7 }}
        filter={`url(#${glowBlurMidId})`}
      />
      {/* Core — near-white warm, the hottest point of the light. */}
      <ellipse
        cx="26"
        cy="52"
        rx="4.5"
        ry="4"
        style={{ fill: "var(--wick-glow-core, oklch(0.97 0.025 85))", opacity: 0.92 }}
      />
    </>
  )
  return (
    <g style={{ opacity }}>
      {/* Faint warm under-cast (natural-light upgrade) — as if his light were falling on the air/surface beneath him. Fixed brightness (not tied to the noise wander below): it's ambient, not part of the tail-glow's own pulse. */}
      <ellipse cx="26" cy="76" rx="22" ry="6" style={{ fill: `url(#${underGradientId})`, opacity: 0.07 }} filter={`url(#${glowUnderId})`} />
      {animated ? (
        <motion.g
          animate={{ opacity: GLOW_NOISE_OPACITY }}
          transition={{ duration: GLOW_NOISE_DURATION, repeat: Infinity, ease: easing.inOut, times: GLOW_NOISE_TIMES }}
        >
          {layers}
        </motion.g>
      ) : (
        layers
      )}
    </g>
  )
}

function WickBody({ bodyGradientId }: { bodyGradientId: string }) {
  return (
    <>
      {/* Main plump body */}
      <ellipse cx="44" cy="47" rx="19" ry="16" style={{ fill: `url(#${bodyGradientId})` }} />
      {/* Head bump, front (right) */}
      <circle cx="61" cy="42" r="11.5" style={{ fill: `url(#${bodyGradientId})` }} />
      {/* Soft top gloss highlight */}
      <ellipse
        cx="52"
        cy="34"
        rx="10"
        ry="5"
        style={{ fill: "var(--wick-body-light, oklch(0.46 0.05 280))", opacity: 0.35 }}
      />
    </>
  )
}

function WickEye({
  closed,
  pupilX,
  animated = true,
}: {
  closed: boolean
  pupilX: number
  /** false under reduced-motion: the pupil snaps to position instead of springing. */
  animated?: boolean
}) {
  if (closed) {
    return (
      <path
        d="M 57.5 40 Q 63 45.5 68.5 40"
        style={{ fill: "none", stroke: "var(--wick-eye-pupil, oklch(0.2 0.02 280))" }}
        strokeWidth={2.4}
        strokeLinecap="round"
      />
    )
  }
  return (
    <g>
      <circle cx="63" cy="39" r="8" style={{ fill: "var(--wick-eye-white, oklch(0.98 0.005 90))" }} />
      {animated ? (
        <motion.circle
          cy="39"
          r="4.1"
          animate={{ cx: pupilX }}
          transition={springGentle}
          style={{ fill: "var(--wick-eye-pupil, oklch(0.2 0.02 280))" }}
        />
      ) : (
        <circle cx={pupilX} cy="39" r="4.1" style={{ fill: "var(--wick-eye-pupil, oklch(0.2 0.02 280))" }} />
      )}
      <circle cx="65.4" cy="36.6" r="1.5" style={{ fill: "var(--wick-eye-white, oklch(0.98 0.005 90))", opacity: 0.9 }} />
    </g>
  )
}

function WickSparkleTrail() {
  return (
    <g>
      {SPARKLE_OFFSETS.map((sparkle, index) => (
        <motion.circle
          key={index}
          cx={26 + sparkle.dx}
          cy={52 + sparkle.dy}
          r={1.6}
          style={{ fill: "var(--amber-glow, oklch(0.78 0.14 80))" }}
          initial={{ opacity: 0.9, scale: 1 }}
          animate={{ opacity: 0, scale: 0.3 }}
          transition={{ duration: 0.7, delay: sparkle.delay, ease: easing.out }}
        />
      ))}
    </g>
  )
}

/**
 * Movement trail (additive, landing-page-guide upgrade) — reuses
 * `WickSparkleTrail`'s visual language (small fading amber circles trailing
 * the tail) but loops continuously via `repeatDelay` instead of playing
 * once, for the duration `isTrailActive` stays true (a micro-dart hop or an
 * externally-driven flight). Never rendered alongside `WickSparkleTrail` —
 * see `isTrailActive`'s exclusion of the celebrating state at its call site.
 */
function WickMotionTrail() {
  return (
    <g>
      {TRAIL_OFFSETS.map((mote, index) => (
        <motion.circle
          key={index}
          cx={26 + mote.dx}
          cy={52 + mote.dy}
          r={1.1}
          style={{ fill: "var(--amber-glow, oklch(0.78 0.14 80))" }}
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: [0, 0.85, 0], scale: [0.4, 1, 0.3] }}
          transition={{
            duration: TRAIL_MOTE_DURATION,
            repeat: Infinity,
            repeatDelay: TRAIL_MOTE_REPEAT_DELAY,
            delay: mote.delay,
            ease: easing.out,
          }}
        />
      ))}
    </g>
  )
}

// ---------------------------------------------------------------------------
// WickMoments — an optional provider + hook for firing one-shot celebration
// Wicks that fly across a viewport corner (e.g. "first lead captured",
// "reminders enabled"). Fully optional: `useWickCelebration()` no-ops
// gracefully if no provider is mounted, so callers never need a defensive
// check.
// ---------------------------------------------------------------------------

type CelebrationOptions = {
  /** Which viewport corner Wick celebrates in. Defaults to "bottom-right". */
  corner?: "top-right" | "top-left" | "bottom-right" | "bottom-left"
  /** Optional short in-voice line, shown in a WickBubble beside him for the
   *  duration of the celebration (e.g. "Queued. The street will see it."). */
  message?: string
}

type WickMomentsContextValue = {
  celebrate: (options?: CelebrationOptions) => void
}

const WickMomentsContext = createContext<WickMomentsContextValue | null>(null)

const CORNER_CLASSNAMES: Record<NonNullable<CelebrationOptions["corner"]>, string> = {
  "top-right": "top-16 right-6",
  "top-left": "top-16 left-6",
  "bottom-right": "bottom-6 right-6",
  "bottom-left": "bottom-6 left-6",
}

/** Bubble opens toward whichever side has room — away from the viewport edge the corner is anchored to. */
const CORNER_BUBBLE_SIDE: Record<NonNullable<CelebrationOptions["corner"]>, "left" | "right"> = {
  "top-right": "left",
  "bottom-right": "left",
  "top-left": "right",
  "bottom-left": "right",
}

/** Celebrating is a one-shot animated state (see `ONE_SHOT_STATES`/`onComplete` above) — under `prefers-reduced-motion` Wick renders statically and never fires `onAnimationComplete`, so nothing would ever clear `active`. This is the fallback: auto-dismiss after a fixed beat long enough to read a short message. */
const REDUCED_MOTION_CELEBRATION_MS = 2200

/** Mount once, near the app root (see src/components/providers.tsx). */
export function WickMomentsProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<{
    id: number
    corner: NonNullable<CelebrationOptions["corner"]>
    message?: string
  } | null>(null)
  const nextId = useRef(0)
  const reduceMotion = useReducedMotion()

  function celebrate(options?: CelebrationOptions) {
    nextId.current += 1
    setActive({ id: nextId.current, corner: options?.corner ?? "bottom-right", message: options?.message })
  }

  useEffect(() => {
    if (!active || !reduceMotion) return
    const timer = setTimeout(() => setActive(null), REDUCED_MOTION_CELEBRATION_MS)
    return () => clearTimeout(timer)
  }, [active, reduceMotion])

  const value = useMemo<WickMomentsContextValue>(() => ({ celebrate }), [])

  return (
    <WickMomentsContext.Provider value={value}>
      {children}
      {active && (
        <div
          key={active.id}
          aria-hidden="true"
          className={cn("pointer-events-none fixed z-50", CORNER_CLASSNAMES[active.corner])}
        >
          <div className="relative">
            <Wick state="celebrating" size={64} onComplete={() => setActive(null)} />
            {active.message && (
              <WickBubble
                text={active.message}
                side={CORNER_BUBBLE_SIDE[active.corner]}
                reduceMotion={!!reduceMotion}
                instant
                maxWidthPx={200}
              />
            )}
          </div>
        </div>
      )}
    </WickMomentsContext.Provider>
  )
}

/** Fires a one-shot celebrating Wick in a viewport corner. Safe to call with no provider mounted (no-op). */
export function useWickCelebration() {
  const ctx = useContext(WickMomentsContext)
  return {
    celebrate: (options?: CelebrationOptions) => ctx?.celebrate(options),
  }
}

// ---------------------------------------------------------------------------
// Hero ↔ landing-page-guide handoff bridge (additive, landing-page-guide
// upgrade) — a tiny module-level pub/sub so hero.tsx (which owns and
// measures its own Wick) and wick-guide.tsx (the fixed scroll companion)
// can hand off "the same bug" between them with zero component-tree
// coupling. hero.tsx calls `setHeroWickHandoff` from the one
// IntersectionObserver it already needs on its own section, every time hero
// visibility flips; wick-guide.tsx reads the latest snapshot via
// `useSyncExternalStore` to know when to fly in/out and where the hero
// Wick's on-screen center last was. Kept here (not in wick-guide.tsx)
// because it's genuinely shared, not guide-owned.
// ---------------------------------------------------------------------------

export type HeroWickHandoff = {
  /** True while the hero's own Wick is the one that should be on screen. */
  heroVisible: boolean
  /** Hero Wick's last measured viewport-space center — null until hero.tsx
   *  has measured at least once (first observer callback). */
  center: { x: number; y: number } | null
}

const HERO_WICK_HANDOFF_SERVER_SNAPSHOT: HeroWickHandoff = { heroVisible: true, center: null }

let heroWickHandoffState: HeroWickHandoff = { heroVisible: true, center: null }
const heroWickHandoffListeners = new Set<() => void>()

/** hero.tsx calls this from its own IntersectionObserver callback. */
export function setHeroWickHandoff(next: Partial<HeroWickHandoff>) {
  heroWickHandoffState = { ...heroWickHandoffState, ...next }
  heroWickHandoffListeners.forEach((listener) => listener())
}

/** wick-guide.tsx subscribes via `useSyncExternalStore`. */
export function subscribeHeroWickHandoff(listener: () => void) {
  heroWickHandoffListeners.add(listener)
  return () => heroWickHandoffListeners.delete(listener)
}

export function getHeroWickHandoffSnapshot() {
  return heroWickHandoffState
}

/** Stable reference — required so `useSyncExternalStore` doesn't warn on the server. */
export function getHeroWickHandoffServerSnapshot() {
  return HERO_WICK_HANDOFF_SERVER_SNAPSHOT
}
