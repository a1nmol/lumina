"use client"

// NightTicker — "Tonight, while you sleep" — the signature moment right
// before the final CTA. A simulated overnight activity feed: four
// notification rows land one at a time (~9s total), then the card rests on
// the finished state. Plays ONCE per visit; a manual replay is always
// available.
//
// Design register: this is a NIGHT beat (paired thematically with
// day-strip.tsx's 11PM IndigoHoursCard, which established the pattern) —
// same `.dusk-section` treatment (locks the card to the dark palette
// regardless of the visitor's light/dark preference) + light header bar.
//
// Craft notes (why it's built this way):
//   - IRREGULAR stagger (1.1s / 1.6s / 0.9s / 1.4s gaps before each entry)
//     rather than even spacing — research consensus on "notification feed"
//     micro-interactions (Linear/Notion-style toasts) is that perfectly even
//     timing reads as mechanical/canned, while uneven gaps read as "actually
//     happening". Values are authored, not randomized, so the beat is
//     reproducible and reviewable.
//   - Each entry has a two-phase reveal — a brief "typing" state (pulsing
//     dots, 500ms) before the resolved row fades/slides in — borrowed from
//     chat-UI conventions, reinforcing "something is composing this in real
//     time" rather than a message just appearing.
//   - Play-once-then-rest: this is a scroll-triggered demo, not a looping
//     animation — a looping notification feed next to a CTA would be a
//     distraction, not a delight. It re-arms only if the visitor scrolls
//     completely away and back after a cooldown, so returning readers still
//     get to see it.
//   - Explicit pause control (WCAG 2.2.2 pause/stop/hide — any auto-updating
//     content that starts automatically and lasts >5s needs a way to pause
//     it). The icon-button doubles as pause/resume/replay depending on
//     state, matching the pattern DayTimeline (day-strip.tsx) already
//     established for the same requirement.
//   - The animated feed is decorative narration, not primary content: it's
//     `aria-hidden`, paired with a single `sr-only` paragraph that states
//     the whole outcome in one sentence for screen reader / reduced-motion
//     users who don't watch it play out.

import { useEffect, useRef, useState } from "react"
import { motion, useInView } from "framer-motion"
import {
  CalendarClock,
  MessageCircle,
  MoonStar,
  Pause,
  PhoneMissed,
  Play,
  RotateCcw,
  Send,
  type LucideIcon,
} from "lucide-react"

import { TimeStamp } from "@/components/brand/time-stamp"
import { useReducedMotionSafe } from "@/hooks/use-reduced-motion-safe"
import { cn } from "@/lib/utils"

import { ScrollReveal } from "./scroll-reveal"

type Entry = {
  time: string
  icon: LucideIcon
  text: string
}

const ENTRIES: Entry[] = [
  { time: "7:02 PM", icon: Send, text: "Tomorrow's morning special — drafted and queued." },
  { time: "9:12 PM", icon: MessageCircle, text: "Sarah asked about Saturday hours — answered in 6 seconds." },
  { time: "10:47 PM", icon: PhoneMissed, text: "Missed call from (555) 812-4076 — texted back, booking offered." },
  { time: "11:58 PM", icon: CalendarClock, text: "New booking: Sat 10:00 AM. Owner asleep the whole time." },
]

/** Irregular gap (ms) before each entry's typing phase begins — deliberately
 *  uneven; see the file-top note on why even spacing reads as canned. */
const GAPS_MS = [1100, 1600, 900, 1400]
/** How long the pulsing-dots "typing" state holds before the row resolves. */
const TYPING_MS = 500

type Phase = "hidden" | "typing" | "shown"
type PlayState = "idle" | "playing" | "paused" | "done"

type Step = { entry: number; phase: "typing" | "shown"; waitMs: number }

/** Flattened timeline: for each entry, a "start typing" step (waits the
 *  irregular gap) then a "resolve" step (waits the fixed typing duration). */
const STEPS: Step[] = ENTRIES.flatMap((_, index) => [
  { entry: index, phase: "typing" as const, waitMs: GAPS_MS[index] },
  { entry: index, phase: "shown" as const, waitMs: TYPING_MS },
])

/** Minimum time since finishing before a scroll-away → scroll-back re-entry
 *  is allowed to auto-replay the sequence. */
const REPLAY_COOLDOWN_MS = 6000

const SR_SUMMARY =
  "A simulated night: Lumina drafts and queues tomorrow's post, answers a customer's hours question in seconds, texts back a missed call, and takes a Saturday booking — all while the owner sleeps."

export function NightTicker() {
  return (
    <section id="night-ticker" data-scene="night-ticker" className="bg-background py-20 sm:py-28">
      <div className="mx-auto max-w-xl px-4 sm:px-6">
        <ScrollReveal className="text-center">
          <TimeStamp label="TONIGHT" tone="flame" />
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            While you sleep, it keeps working.
          </h2>
        </ScrollReveal>
        <ScrollReveal delay={0.05} className="mt-10">
          <NightFeedCard />
        </ScrollReveal>
      </div>
    </section>
  )
}

function NightFeedCard() {
  const reduceMotion = useReducedMotionSafe()
  const cardRef = useRef<HTMLDivElement>(null)
  const inView = useInView(cardRef, { amount: 0.5 })

  if (reduceMotion) {
    return (
      <div ref={cardRef} className="dusk-section overflow-hidden rounded-2xl border border-border bg-background shadow-overlay">
        <CardHeader />
        <div aria-hidden="true" className="flex flex-col gap-2.5 p-4">
          {ENTRIES.map((entry) => (
            <EntryRow key={entry.time} entry={entry} animateIn={false} />
          ))}
        </div>
        <p className="sr-only">{SR_SUMMARY}</p>
      </div>
    )
  }

  return <AnimatedNightFeedCard cardRef={cardRef} inView={inView} />
}

function AnimatedNightFeedCard({
  cardRef,
  inView,
}: {
  cardRef: React.RefObject<HTMLDivElement | null>
  inView: boolean
}) {
  const [phases, setPhases] = useState<Phase[]>(() => ENTRIES.map(() => "hidden"))
  const [playState, setPlayState] = useState<PlayState>("idle")

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingStepRef = useRef(0)
  const doneAtRef = useRef<number | null>(null)
  const awayRef = useRef(false)

  // Plain (non-memoized) functions rather than useCallback: `runStep`
  // recurses through its own reference from inside a setTimeout callback, so
  // memoizing it would either need a self-referential dependency (unsound)
  // or a ref indirection for no real benefit — nothing here is passed down
  // as a prop, so identity stability doesn't matter, only closure
  // correctness (each call always reads the latest refs/setters).
  function clearTimer() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  function runStep(index: number) {
    pendingStepRef.current = index
    if (index >= STEPS.length) {
      setPlayState("done")
      doneAtRef.current = Date.now()
      return
    }
    const step = STEPS[index]
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      setPhases((prev) => {
        const next = [...prev]
        next[step.entry] = step.phase
        return next
      })
      runStep(index + 1)
    }, step.waitMs)
  }

  function start() {
    clearTimer()
    setPhases(ENTRIES.map(() => "hidden"))
    setPlayState("playing")
    runStep(0)
  }

  function pause() {
    clearTimer()
    setPlayState("paused")
  }

  function resume() {
    setPlayState("playing")
    runStep(pendingStepRef.current)
  }

  function replay() {
    start()
  }

  // Kick off the one-shot play the first time the card is >=50% in view;
  // arm a replay if the visitor scrolls fully away after finishing and
  // returns after the cooldown window.
  useEffect(() => {
    // Synchronizing with an external input (scroll position via
    // useInView) — kicking off/resuming the timer chain here (rather than
    // deferring to a later interaction) is the whole point of "plays once
    // when scrolled into view", matching the same pattern day-strip.tsx's
    // active-scene tracking already uses for scroll-driven state.
    if (inView) {
      if (playState === "idle") {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        start()
      } else if (playState === "done" && awayRef.current) {
        const finishedAt = doneAtRef.current ?? 0
        if (Date.now() - finishedAt >= REPLAY_COOLDOWN_MS) {
          awayRef.current = false
          start()
        }
      }
    } else if (playState === "done") {
      awayRef.current = true
    }
    // start/pause/etc. are plain functions re-created each render; only
    // re-running this effect on inView/playState changes is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView])

  // Clears any in-flight timer on unmount only — a plain ref read/clear, so
  // an empty dependency array is correct without needing `clearTimer`'s
  // (unstable, re-created-per-render) identity as a dependency.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [])

  function handleControlClick() {
    if (playState === "done") {
      replay()
    } else if (playState === "paused") {
      resume()
    } else {
      pause()
    }
  }

  return (
    <div
      ref={cardRef}
      className="dusk-section overflow-hidden rounded-2xl border border-border bg-background shadow-overlay"
    >
      <CardHeader>
        <button
          type="button"
          onClick={handleControlClick}
          aria-label={
            playState === "done" ? "Replay the night" : playState === "paused" ? "Play the night" : "Pause the night"
          }
          className={cn(
            "flex size-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-soft transition-colors",
            "hover:border-flame/50 hover:text-flame focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          )}
        >
          {playState === "done" ? (
            <RotateCcw aria-hidden="true" className="size-3.5" />
          ) : playState === "paused" ? (
            <Play aria-hidden="true" className="size-3.5" />
          ) : (
            <Pause aria-hidden="true" className="size-3.5" />
          )}
        </button>
      </CardHeader>
      <div aria-hidden="true" className="flex flex-col gap-2.5 p-4">
        {ENTRIES.map((entry, index) => {
          const phase = phases[index]
          if (phase === "hidden") return null
          if (phase === "typing") return <TypingRow key={entry.time} entry={entry} />
          return <EntryRow key={entry.time} entry={entry} animateIn />
        })}
      </div>
      <p className="sr-only">{SR_SUMMARY}</p>
    </div>
  )
}

function CardHeader({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-b border-border bg-card px-4 py-3">
      <span className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-primary">
        <MoonStar aria-hidden="true" className="size-3.5" />
      </span>
      <span className="text-sm font-medium text-foreground">One night with Lumina</span>
      <div className="ml-auto">{children}</div>
    </div>
  )
}

function EntryRow({ entry, animateIn }: { entry: Entry; animateIn: boolean }) {
  const Icon = entry.icon
  const content = (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card/80 px-3.5 py-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-glow/15 text-flame">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <div className="min-w-0">
        <span className="block font-mono text-[11px] tracking-wide text-muted-foreground">{entry.time}</span>
        <p className="text-sm text-foreground">{entry.text}</p>
      </div>
    </div>
  )

  if (!animateIn) return content

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      {content}
    </motion.div>
  )
}

const TYPING_DOTS = [0, 1, 2]

function TypingRow({ entry }: { entry: Entry }) {
  const Icon = entry.icon
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card/80 px-3.5 py-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-glow/15 text-flame">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <div className="flex items-center gap-1">
        {TYPING_DOTS.map((dot) => (
          <motion.span
            key={dot}
            className="size-1 rounded-full bg-muted-foreground/60"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut", delay: dot * 0.15 }}
          />
        ))}
      </div>
    </div>
  )
}
