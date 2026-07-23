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
}

const ONE_SHOT_STATES: ReadonlySet<WickState> = new Set(["celebrating", "oops"])

const BANNED_PATH_FRAGMENTS = ["/admin", "/settings"]

/** Route/instance-independent module-level cache so we only warn once per pathname per session, not once per re-render. */
const warnedPaths = new Set<string>()

function useBannedSurfaceGuard() {
  const pathname = usePathname()
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return
    if (!pathname) return
    const hit = BANNED_PATH_FRAGMENTS.find((fragment) => pathname.includes(fragment))
    if (hit && !warnedPaths.has(pathname)) {
      warnedPaths.add(pathname)
      console.warn(
        `[Wick] rendered under "${pathname}" (matches "${hit}"). Wick is banned from pricing/billing/settings/dense-table/security surfaces per docs/design-briefs/brand-redesign-plan.md §4. Remove this usage or move it to an allowed surface.`
      )
    }
  }, [pathname])
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
}: WickProps) {
  useBannedSurfaceGuard()
  const reduceMotion = useReducedMotion()
  const filterId = useId()
  const wingBlurId = `wick-wing-blur-${filterId}`
  const glowBlurOuterId = `wick-glow-outer-${filterId}`
  const glowBlurMidId = `wick-glow-mid-${filterId}`
  const bodyGradientId = `wick-body-gradient-${filterId}`

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
          await dartControls.start({ x: 20, y: -6, transition: DART_OUT })
          if (cancelled) return
          await dartControls.start({ x: 0, y: 0, transition: DART_SETTLE })
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
            bodyGradientId={bodyGradientId}
          />
          <g style={{ transform: isSleeping ? "translateY(4px)" : "none" }}>
            <WickWings wingBlurId={wingBlurId} />
            <WickGlow
              glowBlurOuterId={glowBlurOuterId}
              glowBlurMidId={glowBlurMidId}
              opacity={STATIC_GLOW_OPACITY[state]}
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
            bodyGradientId={bodyGradientId}
          />
          {showSparkles && <WickSparkleTrail />}
          <motion.g
            animate={bodyAnimate}
            transition={bodyTransition}
            onAnimationComplete={handleBodyAnimationComplete}
          >
            <WickWings wingBlurId={wingBlurId} />
            <motion.g animate={{ opacity: glow.opacity }} transition={glow.transition}>
              <WickGlow glowBlurOuterId={glowBlurOuterId} glowBlurMidId={glowBlurMidId} opacity={1} />
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
  bodyGradientId,
}: {
  wingBlurId: string
  glowBlurOuterId: string
  glowBlurMidId: string
  bodyGradientId: string
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
      <linearGradient id={bodyGradientId} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--wick-body-light, oklch(0.4 0.05 280))" />
        <stop offset="100%" stopColor="var(--wick-body, oklch(0.28 0.045 280))" />
      </linearGradient>
    </defs>
  )
}

function WickWings({ wingBlurId }: { wingBlurId: string }) {
  return (
    <g style={{ opacity: 1 }}>
      <ellipse
        cx="30"
        cy="28"
        rx="14"
        ry="7"
        transform="rotate(-18 30 28)"
        style={{
          fill: "var(--wick-wing, oklch(0.68 0.17 277))",
          opacity: 0.22,
        }}
        filter={`url(#${wingBlurId})`}
      />
      <ellipse
        cx="38"
        cy="26"
        rx="12"
        ry="6"
        transform="rotate(-6 38 26)"
        style={{
          fill: "var(--wick-wing, oklch(0.68 0.17 277))",
          opacity: 0.32,
        }}
        filter={`url(#${wingBlurId})`}
      />
    </g>
  )
}

function WickGlow({
  glowBlurOuterId,
  glowBlurMidId,
  opacity,
}: {
  glowBlurOuterId: string
  glowBlurMidId: string
  opacity: number
}) {
  return (
    <g style={{ opacity }}>
      <ellipse
        cx="26"
        cy="52"
        rx="15"
        ry="13"
        style={{ fill: "var(--amber-glow, oklch(0.78 0.14 80))", opacity: 0.45 }}
        filter={`url(#${glowBlurOuterId})`}
      />
      <ellipse
        cx="26"
        cy="52"
        rx="9"
        ry="8"
        style={{ fill: "var(--amber-glow, oklch(0.78 0.14 80))", opacity: 0.7 }}
        filter={`url(#${glowBlurMidId})`}
      />
      <ellipse cx="26" cy="52" rx="4.5" ry="4" style={{ fill: "var(--amber-glow, oklch(0.78 0.14 80))" }} />
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

/** Mount once, near the app root (see src/components/providers.tsx). */
export function WickMomentsProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<{ id: number; corner: NonNullable<CelebrationOptions["corner"]> } | null>(
    null
  )
  const nextId = useRef(0)

  function celebrate(options?: CelebrationOptions) {
    nextId.current += 1
    setActive({ id: nextId.current, corner: options?.corner ?? "bottom-right" })
  }

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
          <Wick state="celebrating" size={64} onComplete={() => setActive(null)} />
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
