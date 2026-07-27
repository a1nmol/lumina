"use client"

// DayStrip — "One day on Main Street", told as a clickable day TIMELINE
// (owner-approved Direction 1; research: NN/g scroll-jacking consensus +
// the tabbed/stepped showcase pattern current SaaS landing pages use).
//
// The previous implementation pinned a 400vh scroll stage and scrubbed
// five scenes with the wheel — cinematic, but scroll-hijacking: confusing
// and laggy for exactly the non-technical local-business audience this
// page serves. This version keeps everything that worked (the five
// crafted scene cards below are UNCHANGED, the time-of-day arc, the amber
// energy) and swaps the delivery mechanism:
//
//   - A literal horizontal timeline: five stops, 7:00 AM → 6:45 AM next
//     morning. Click any stop; the panel below swaps. Scroll is NEVER
//     touched — the section is normal page flow at every breakpoint.
//   - Gentle auto-advance (AUTO_ADVANCE_S per stop) with a visible fill
//     crawling along the track toward the next stop. It pauses while the
//     pointer/focus rests anywhere inside the widget, while the tab is
//     hidden, or while the section is out of view; it stops permanently
//     the moment the visitor clicks any stop (user takes control — WCAG
//     2.2.2 pause/stop/hide, plus an explicit pause/play button). Under
//     prefers-reduced-motion there is no autoplay at all.
//   - Each stop now carries a concrete OUTCOME line under its scene card
//     ("A $45 cake order taken while you slept.") — the content-depth fix
//     from the same research pass: artifact + outcome per step, not just
//     a timestamp and a title.
//   - Proper tabs semantics: role=tablist/tab/tabpanel, roving tabindex,
//     arrow-key navigation. The scene micro-motion (chalk write-on,
//     ticket slide, receipt print) replays on each activation via
//     ScenePlayer, which animates the same `localT` MotionValue the cards
//     were originally scroll-driven by — instant end-state under
//     reduced motion.
//
// The module-level active-scene store below is unchanged: it now publishes
// the SELECTED STOP (instead of the scrubbed scroll scene) so
// wick-guide.tsx keeps its per-scene commentary with zero changes on its
// side.

import { useEffect, useRef, useState } from "react"
import {
  AnimatePresence,
  animate,
  motion,
  useInView,
  useMotionValue,
  useTransform,
  type MotionValue,
} from "framer-motion"
import {
  CalendarDays,
  Check,
  DoorOpen,
  MessageCircleWarning,
  Pause,
  Play,
  RotateCcw,
  Scissors,
  Sparkles,
  Star,
  Sun,
  ThumbsUp,
} from "lucide-react"

import { TimeStamp } from "@/components/brand/time-stamp"
import { useReducedMotionSafe } from "@/hooks/use-reduced-motion-safe"
import { cn } from "@/lib/utils"

import { ScrollReveal } from "./scroll-reveal"

/** The five stops of the day, in on-page order. `chapter` is the short
 *  label under each timeline stop; `outcome` is the concrete result line
 *  shown under the scene card (artifact + outcome per step). */
const SCENES = [
  {
    key: "7am",
    stamp: "7:00 AM",
    title: "Your morning post, already written.",
    chapter: "Morning post",
    outcome: "Zero minutes at the keyboard — approved with one tap.",
  },
  {
    key: "12pm",
    stamp: "12:00 PM",
    title: "Your week, on the rail.",
    chapter: "Weekly queue",
    outcome: "Seven posts planned in one coffee break.",
  },
  {
    key: "6pm",
    stamp: "6:00 PM",
    title: "Ding — a customer at the digital door.",
    chapter: "Front door",
    outcome: "Two answered instantly; the tricky one flagged to you.",
  },
  {
    key: "11pm",
    stamp: "11:00 PM",
    title: "While Main Street sleeps, yours is answering.",
    chapter: "After hours",
    outcome: "A $45 cake order taken while you slept.",
  },
  {
    key: "645am",
    stamp: "6:45 AM",
    title: "The morning receipt.",
    chapter: "Morning receipt",
    outcome: "Overnight: 2 leads, 1 booking, 1 five-star review.",
  },
] as const

type SceneKey = (typeof SCENES)[number]["key"]

/** Seconds each stop holds before auto-advancing (research: 6-8s reads as
 *  "alive but calm"; anything faster feels rushed for reading a card). */
const AUTO_ADVANCE_S = 7

// ---------------------------------------------------------------------------
// Day-strip active-scene bridge — a tiny module-level pub/sub, same pattern
// as wick.tsx's `HeroWickHandoff`, so wick-guide.tsx can show PER-SCENE
// commentary. The timeline publishes its selected stop here; Wick's
// reading-band engine decides WHEN day-strip commentary shows at all.
// ---------------------------------------------------------------------------

let dayStripActiveScene: string | null = null
const dayStripActiveSceneListeners = new Set<() => void>()

function setDayStripActiveScene(next: string | null) {
  if (dayStripActiveScene === next) return
  dayStripActiveScene = next
  dayStripActiveSceneListeners.forEach((listener) => listener())
}

/** wick-guide.tsx subscribes via `useSyncExternalStore`. */
export function subscribeDayStripActiveScene(listener: () => void) {
  dayStripActiveSceneListeners.add(listener)
  return () => dayStripActiveSceneListeners.delete(listener)
}

export function getDayStripActiveSceneSnapshot() {
  return dayStripActiveScene
}

/** Stable reference — required so `useSyncExternalStore` doesn't warn on the server. */
export function getDayStripActiveSceneServerSnapshot() {
  return null
}

export function DayStrip() {
  return (
    <section id="day-strip" data-scene="day-strip" className="bg-background py-20 sm:py-28 lg:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="mb-3 text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            One day on Main Street.
          </h2>
        </ScrollReveal>
        <ScrollReveal delay={0.05} className="mb-12 text-center">
          <p className="mx-auto max-w-md text-base text-muted-foreground">
            Five moments from a shop that runs on Lumina. Tap a time of day — or just watch it unfold.
          </p>
        </ScrollReveal>
        <DayTimeline />
      </div>
    </section>
  )
}

function DayTimeline() {
  const reduceMotion = useReducedMotionSafe()
  const rootRef = useRef<HTMLDivElement>(null)
  const inView = useInView(rootRef, { amount: 0.35 })
  const [activeIndex, setActiveIndex] = useState(0)
  const [userTookControl, setUserTookControl] = useState(false)
  const [paused, setPaused] = useState(false)
  const [pointerResting, setPointerResting] = useState(false)
  const [tabHidden, setTabHidden] = useState(false)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    function onVisibility() {
      setTabHidden(document.hidden)
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => document.removeEventListener("visibilitychange", onVisibility)
  }, [])

  // Publish the selected stop for Wick's per-scene commentary.
  useEffect(() => {
    setDayStripActiveScene(SCENES[activeIndex].key)
  }, [activeIndex])
  useEffect(() => () => setDayStripActiveScene(null), [])

  const last = SCENES.length - 1
  const atEnd = activeIndex === last
  // Auto-advance runs only while every condition holds; a manual stop
  // click kills it for good (the visitor took the wheel).
  const autoPlaying =
    !reduceMotion && !userTookControl && !paused && !pointerResting && !tabHidden && inView && !atEnd

  function select(index: number, viaUser: boolean) {
    setActiveIndex(index)
    if (viaUser) setUserTookControl(true)
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    let next: number | null = null
    if (event.key === "ArrowRight") next = Math.min(last, activeIndex + 1)
    else if (event.key === "ArrowLeft") next = Math.max(0, activeIndex - 1)
    else if (event.key === "Home") next = 0
    else if (event.key === "End") next = last
    if (next === null) return
    event.preventDefault()
    select(next, true)
    tabRefs.current[next]?.focus()
  }

  function handlePlayPause() {
    if (atEnd || userTookControl) {
      // Replay/resume: hand the wheel back to the tour.
      if (atEnd) setActiveIndex(0)
      setUserTookControl(false)
      setPaused(false)
      return
    }
    setPaused((prev) => !prev)
  }

  const active = SCENES[activeIndex]
  const showResume = atEnd || userTookControl

  return (
    <div
      ref={rootRef}
      onPointerEnter={() => setPointerResting(true)}
      onPointerLeave={() => setPointerResting(false)}
      onFocusCapture={() => setPointerResting(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPointerResting(false)
      }}
    >
      {/* ---- the timeline track ---- */}
      <div
        role="tablist"
        aria-label="One day with Lumina — five moments"
        onKeyDown={handleKeyDown}
        className="relative mx-auto max-w-2xl"
      >
        {/* Track line: runs from the center of the first grid column to the
            center of the last (grid-cols-5 → 10% inset each side). The soft
            dawn→night gradient IS the time-of-day storyteller now — the
            same --sky-* tokens the old pinned stage's sky band used. */}
        <div aria-hidden="true" className="absolute top-[9px] right-[10%] left-[10%] h-0.5 rounded-full bg-border">
          <div
            className="absolute inset-0 rounded-full opacity-70"
            style={{
              backgroundImage:
                "linear-gradient(90deg, var(--sky-dawn), var(--sky-noon), var(--sky-dusk), var(--sky-night))",
            }}
          />
          {/* Completed portion — solid flame up to the active stop. */}
          <div
            className="absolute top-0 bottom-0 left-0 rounded-full bg-flame transition-[width] duration-300 ease-out"
            style={{ width: `${(activeIndex / last) * 100}%` }}
          />
          {/* Live auto-advance fill — crawls across the next segment while
              the tour is running; keyed per stop so it restarts cleanly. */}
          {autoPlaying && (
            <motion.div
              key={activeIndex}
              className="absolute top-0 bottom-0 origin-left rounded-full bg-flame/60"
              style={{ left: `${(activeIndex / last) * 100}%`, width: `${100 / last}%` }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: AUTO_ADVANCE_S, ease: "linear" }}
              onAnimationComplete={() => select(Math.min(last, activeIndex + 1), false)}
            />
          )}
        </div>

        <div className="relative grid grid-cols-5">
          {SCENES.map((scene, index) => {
            const isActive = index === activeIndex
            const isDone = index < activeIndex
            return (
              <button
                key={scene.key}
                ref={(node) => {
                  tabRefs.current[index] = node
                }}
                type="button"
                role="tab"
                id={`day-tab-${scene.key}`}
                aria-controls={`day-panel-${scene.key}`}
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                onClick={() => select(index, true)}
                className="group flex flex-col items-center gap-1.5 rounded-lg pb-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full border bg-background transition-all duration-300",
                    isDone && "border-flame bg-flame text-flame-foreground",
                    isActive && "border-flame ring-4 ring-amber-glow/35 shadow-[0_0_12px_var(--amber-glow)]",
                    !isDone && !isActive && "border-border group-hover:border-flame/50"
                  )}
                >
                  {isDone ? (
                    <Check aria-hidden="true" className="size-3" />
                  ) : (
                    <span
                      className={cn(
                        "size-1.5 rounded-full transition-colors duration-300",
                        isActive ? "bg-flame" : "bg-border group-hover:bg-flame/50"
                      )}
                    />
                  )}
                </span>
                <span
                  className={cn(
                    "font-mono text-[10px] tracking-[0.14em] uppercase transition-colors sm:text-[11px]",
                    isActive ? "text-flame" : "text-muted-foreground"
                  )}
                >
                  {scene.stamp}
                </span>
                <span
                  className={cn(
                    "hidden text-xs font-medium transition-colors sm:block",
                    isActive ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {scene.chapter}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ---- the active moment ---- */}
      <div className="relative mx-auto mt-10 max-w-xl">
        {!reduceMotion && (
          <button
            type="button"
            onClick={handlePlayPause}
            aria-label={showResume ? "Replay the day" : paused ? "Play the day" : "Pause the day"}
            className={cn(
              "absolute -top-1 right-0 z-10 flex size-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-soft transition-colors",
              "hover:border-flame/50 hover:text-flame focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            )}
          >
            {showResume ? (
              <RotateCcw aria-hidden="true" className="size-3.5" />
            ) : paused ? (
              <Play aria-hidden="true" className="size-3.5" />
            ) : (
              <Pause aria-hidden="true" className="size-3.5" />
            )}
          </button>
        )}

        <div
          role="tabpanel"
          id={`day-panel-${active.key}`}
          aria-labelledby={`day-tab-${active.key}`}
          className="min-h-[29rem] sm:min-h-[27rem]"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={active.key}
              initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -10 }}
              transition={{ duration: reduceMotion ? 0 : 0.3, ease: "easeOut" }}
            >
              <SceneHeading stamp={active.stamp} title={active.title} animated={false} />
              <div className="mt-2">
                <ScenePlayer sceneKey={active.key} />
              </div>
              <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-amber-glow/40 bg-amber-glow/10 px-3.5 py-1.5 text-sm text-foreground">
                <Check aria-hidden="true" className="size-3.5 shrink-0 text-flame" />
                {active.outcome}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

/** Replays a scene's micro-motion (chalk write-on, ticket slide, receipt
 *  print…) each time its stop is activated, by animating the same `localT`
 *  MotionValue the cards were originally scroll-driven by. Instant
 *  end-state under reduced motion. */
function ScenePlayer({ sceneKey }: { sceneKey: SceneKey }) {
  const reduceMotion = useReducedMotionSafe()
  const localT = useMotionValue(0)

  useEffect(() => {
    if (reduceMotion) {
      localT.set(1)
      return
    }
    localT.set(0)
    const controls = animate(localT, 1, { duration: 1.4, ease: "easeOut", delay: 0.12 })
    return () => controls.stop()
  }, [sceneKey, reduceMotion, localT])

  return <ScenePanelContent sceneKey={sceneKey} localT={localT} />
}

function ScenePanelContent({ sceneKey, localT }: { sceneKey: SceneKey; localT: MotionValue<number> }) {
  switch (sceneKey) {
    case "7am":
      return <ChalkboardCard localT={localT} />
    case "12pm":
      return <TicketRailCard localT={localT} />
    case "6pm":
      return <ShopBellCard localT={localT} />
    case "11pm":
      return <IndigoHoursCard localT={localT} />
    case "645am":
      return <MorningReceiptCard localT={localT} />
    default:
      return null
  }
}

function SceneHeading({ stamp, title, animated = true }: { stamp: string; title: string; animated?: boolean }) {
  const content = (
    <>
      {/* flame, not the default amber — every SceneHeading renders on the
          light paper register (even the 11PM scene: this heading sits
          above, not inside, that scene's .dusk-section card), and
          amber-glow is tuned for dark/dusk backgrounds only. */}
      <TimeStamp label={stamp} tone="flame" />
      <h3 className="mt-1.5 text-xl font-semibold text-foreground sm:text-2xl">{title}</h3>
    </>
  )

  if (!animated) {
    return <div className="mb-4">{content}</div>
  }

  return <ScrollReveal className="mb-4">{content}</ScrollReveal>
}
/* ------------------------------------------------------------------ */
/* Scene cards — the five crafted moments, unchanged from the pinned    */
/* era; each takes a `localT` 0→1 MotionValue for its micro-motion.     */
/* ------------------------------------------------------------------ */

function ChalkboardCard({ localT }: { localT: MotionValue<number> }) {
  const reveal = useTransform(localT, [0, 0.55], [0, 100], { clamp: true })
  const clipPath = useTransform(reveal, (v) => `inset(0 ${100 - v}% 0 0)`)
  return (
    <div className="rounded-2xl border-[10px] border-chalkboard-border bg-chalkboard p-6 shadow-raised sm:p-8">
      <motion.p
        style={{ clipPath }}
        className="-rotate-1 font-serif text-lg leading-relaxed text-chalkboard-foreground italic [text-shadow:0_0_1px_var(--chalkboard-foreground)] sm:text-xl"
      >
        Fresh sourdough out at 7. The first loaf&rsquo;s crackle is for the early birds.
      </motion.p>
      <div className="mt-5 flex items-center gap-3 border-t border-dashed border-chalkboard-foreground/20 pt-4">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-chalkboard-foreground/10 px-3 py-1 text-xs font-medium text-chalkboard-foreground">
          <ThumbsUp aria-hidden="true" className="size-3.5" />
          Approved
        </span>
        <span className="font-mono text-xs tracking-wide text-chalkboard-foreground/70 uppercase">
          Queued for 8:00 AM
        </span>
      </div>
    </div>
  )
}
const TICKETS = [
  { label: "Mon", detail: "Weekly special post" },
  { label: "Wed", detail: "Cinnamon roll photo" },
  { label: "Fri", detail: "Weekend hours reminder" },
] as const

/** One ticket-slot's travel distance: card width (9.5rem = 152px) + gap-4 (16px). */
const TICKET_SLOT_PX = 168

function TicketRailCard({ localT }: { localT: MotionValue<number> }) {
  const slideX = useTransform(localT, [0.25, 0.6], [-TICKET_SLOT_PX, 0], { clamp: true })
  return (
    <div className="relative rounded-2xl border border-border bg-card p-6 shadow-raised sm:p-8">
      <div aria-hidden="true" className="absolute top-12 right-6 left-6 h-0.5 rounded-full bg-border" />
      <div className="relative flex flex-wrap justify-between gap-4 pt-2">
        {TICKETS.map((ticket, index) => (
          <motion.div
            key={ticket.label}
            style={index === 2 ? { x: slideX } : undefined}
            className={cn(
              "flex w-[9.5rem] flex-col gap-1 rounded-lg border border-border bg-background px-3 py-2.5 shadow-soft",
              index === 2 && "border-primary/40 ring-1 ring-primary/20"
            )}
          >
            <span className="text-[11px] font-semibold tracking-wide text-primary uppercase">{ticket.label}</span>
            <span className="text-xs text-muted-foreground">{ticket.detail}</span>
          </motion.div>
        ))}
      </div>
      <p className="mt-6 text-sm text-muted-foreground">Drag Thursday&rsquo;s special to Friday. Done.</p>
    </div>
  )
}
const BUBBLES = [
  { text: "Are you open Sunday?", state: "answered" as const },
  { text: "Do you take walk-ins?", state: "answered" as const },
  { text: "Needs you — allergy question", state: "flagged" as const },
]

function ShopBellCard({ localT }: { localT: MotionValue<number> }) {
  const pulseScale = useTransform(localT, [0.42, 0.5, 0.58], [1, 1.07, 1], { clamp: true })
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-raised sm:p-8">
      <div className="mb-4 flex items-center gap-2 border-b border-dashed border-border pb-4">
        <span className="flex size-8 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
          <DoorOpen aria-hidden="true" className="size-4" />
        </span>
        <span className="text-xs font-medium text-muted-foreground">Front door · digital</span>
      </div>
      <div className="flex flex-col gap-2.5">
        {BUBBLES.map((bubble) => (
          <motion.div
            key={bubble.text}
            style={bubble.state === "flagged" ? { scale: pulseScale } : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm",
              bubble.state === "flagged"
                ? "border-warning/40 bg-warning/10 text-warning-foreground"
                : "border-border bg-muted/60 text-foreground"
            )}
          >
            {bubble.state === "flagged" ? (
              <MessageCircleWarning aria-hidden="true" className="size-4 shrink-0 text-warning" />
            ) : (
              <Check aria-hidden="true" className="size-4 shrink-0 text-success" />
            )}
            <span className="flex-1">{bubble.text}</span>
            <span
              className={cn(
                "shrink-0 text-[11px] font-medium",
                bubble.state === "flagged" ? "text-warning" : "text-success"
              )}
            >
              {bubble.state === "flagged" ? "Needs you" : "Answered"}
            </span>
          </motion.div>
        ))}
      </div>
      <p className="mt-5 text-sm text-muted-foreground">It never guesses. It flags you.</p>
    </div>
  )
}
function IndigoHoursCard({ localT }: { localT: MotionValue<number> }) {
  const customerOpacity = useTransform(localT, [0, 0.25], [0, 1], { clamp: true })
  const customerY = useTransform(localT, [0, 0.25], [8, 0], { clamp: true })
  const replyReveal = useTransform(localT, [0.35, 0.75], [0, 100], { clamp: true })
  const replyClip = useTransform(replyReveal, (v) => `inset(0 ${100 - v}% 0 0)`)

  return (
    <div className="dusk-section overflow-hidden rounded-2xl border border-border bg-background shadow-overlay">
      <div className="flex items-center gap-2 border-b border-border bg-card px-4 py-3">
        <span className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Sparkles aria-hidden="true" className="size-3.5" />
        </span>
        <span className="text-sm font-medium text-foreground">9:04 PM · Instagram DM</span>
      </div>
      <div className="flex flex-col gap-2.5 p-4">
        <motion.div style={{ opacity: customerOpacity, y: customerY }} className="flex justify-start">
          <div className="max-w-[80%] rounded-2xl rounded-bl-md bg-muted px-3.5 py-2.5 text-sm text-foreground">
            Hi! Do you do birthday cakes for Saturday?
          </div>
        </motion.div>
        <motion.div style={{ clipPath: replyClip }} className="flex flex-col items-end gap-1">
          <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary/15 px-3.5 py-2.5 text-sm text-foreground">
            We do! Custom cakes are $45 with 48h notice — want me to book a Saturday pickup?
          </div>
          <span className="inline-flex items-center gap-1 pr-1 text-[11px] font-medium text-primary">
            <Sparkles aria-hidden="true" className="size-3" />
            AI answered
          </span>
        </motion.div>
      </div>
    </div>
  )
}
function MorningReceiptCard({ localT }: { localT: MotionValue<number> }) {
  const printReveal = useTransform(localT, [0, 0.65], [0, 100], { clamp: true })
  const printClip = useTransform(printReveal, (v) => `inset(0 0 ${100 - v}% 0)`)
  const tearOpacity = useTransform(localT, [0.62, 0.8], [0, 1], { clamp: true })

  return (
    <div className="relative mx-auto max-w-xs">
      <motion.div
        style={{ clipPath: printClip }}
        className="rounded-t-sm border border-b-0 border-border bg-card px-5 pt-5 pb-5 font-mono text-xs shadow-raised"
      >
        <p className="flex items-center justify-center gap-1.5 text-center text-sm font-semibold text-foreground">
          GOOD MORNING
          <Sun aria-hidden="true" className="size-3.5 text-amber-glow" />
        </p>
        <div
          aria-hidden="true"
          className="my-3 h-px w-full bg-[repeating-linear-gradient(90deg,var(--border)_0_4px,transparent_4px_8px)]"
        />
        <p className="text-center tracking-wide text-muted-foreground uppercase">While you slept</p>
        <ul className="mt-3 flex flex-col gap-1.5 text-foreground">
          <li className="flex items-center justify-between gap-2">
            <span>2 new leads</span>
            <Sparkles aria-hidden="true" className="size-3 text-amber-glow" />
          </li>
          <li className="flex items-center justify-between gap-2">
            <span>1 booking (Sat 10:00 AM)</span>
            <CalendarDays aria-hidden="true" className="size-3 text-primary" />
          </li>
          <li className="flex items-center justify-between gap-2">
            <span>1 five-star review</span>
            <Star aria-hidden="true" className="size-3 fill-amber-glow text-amber-glow" />
          </li>
        </ul>
        <div
          aria-hidden="true"
          className="my-3 h-px w-full bg-[repeating-linear-gradient(90deg,var(--border)_0_4px,transparent_4px_8px)]"
        />
        <p className="flex items-center justify-center gap-1.5 text-center text-muted-foreground">
          <Scissors aria-hidden="true" className="size-3" />
          Have a great bake.
        </p>
      </motion.div>
      {/* Tear-off bottom edge — classic two-gradient torn-paper trick: the
          card color fills a zigzag, the page background shows through the
          cut triangles beneath it. Fades in once "printing" finishes. */}
      <motion.div
        aria-hidden="true"
        style={{
          opacity: tearOpacity,
          backgroundImage:
            "linear-gradient(-45deg, transparent 8px, var(--card) 8px), linear-gradient(45deg, transparent 8px, var(--card) 8px)",
          backgroundSize: "16px 16px",
          backgroundPosition: "0 0",
          backgroundRepeat: "repeat-x",
        }}
        className="h-2.5 w-full"
      />
    </div>
  )
}
