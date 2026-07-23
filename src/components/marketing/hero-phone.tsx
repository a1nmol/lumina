"use client"

// Hero phone mockup — animated 5-step loop (brand-redesign-plan.md §5.2,
// landing-copy.md §1 phone loop). Bezel styling adapted from
// src/components/studio/phone-frame.tsx (lean marketing variant — no
// generate/idle states).
//
// Timeline (single interval-driven phase machine, ~6.9s per cycle):
//   ① call        0 –  500ms  missed-call banner slides in, bright
//   ② callDim   500 – 1000ms  banner dims
//   ③ greeting 1000 – 1700ms  Lumina bubble springs in + types in
//   ④ customer 1700 – 2400ms  customer bubble slides in
//   ⑤ reply    2400 – 3300ms  AI reply bubble types in + "AI answered" chip
//   ⑥ calendar 3300 – 4000ms  calendar chip springs in, one-shot amber glow
//   ⑦ hold     4000 – 6500ms  full scene holds (the "4s five-step loop")
//   ⑧ reset    6500 – 6900ms  soft crossfade out, then loop
// Pauses (freezes on current frame) when the tab is hidden or the phone is
// off-screen; reduced-motion renders the static final composition only.

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { CalendarCheck2, PhoneMissed, Sparkles } from "lucide-react"

import { duration, easing, springGentle, wordRevealMs } from "@/lib/motion"
import { cn } from "@/lib/utils"

import { Wordmark } from "./wordmark"

const GREETING_TEXT = "Sorry we missed you! How can we help?"
const REPLY_TEXT =
  "We do! Custom cakes are $45 with 48h notice — want me to book a Saturday pickup?"

/** Cumulative timeline, ms. holdMs = time spent in this phase before advancing. */
const TIMELINE = [
  { phase: "call" as const, holdMs: 500 },
  { phase: "callDim" as const, holdMs: 500 },
  { phase: "greeting" as const, holdMs: 700 },
  { phase: "customer" as const, holdMs: 700 },
  { phase: "reply" as const, holdMs: 900 },
  { phase: "calendar" as const, holdMs: 700 },
  { phase: "hold" as const, holdMs: 2500 },
  { phase: "reset" as const, holdMs: 400 },
]

export type HeroPhonePhase = (typeof TIMELINE)[number]["phase"]

/** Springier bubble-entrance feel called for by the daylight hero brief —
 * a touch looser than the shared `springGentle` token (260/30). Kept local
 * (not hoisted into src/lib/motion.ts, out of this pass's scope) since it's
 * a one-off tuned specifically for these chat bubbles. */
const bubbleSpring = { type: "spring", stiffness: 300, damping: 24 } as const

/** Word-by-word reveal, reusing the Composer's per-word cadence token. */
function TypedBubbleText({ text, className }: { text: string; className?: string }) {
  const words = text.split(" ")
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (words.length === 0) return
    const id = setInterval(() => {
      setCount((c) => {
        if (c >= words.length) {
          clearInterval(id)
          return c
        }
        return c + 1
      })
    }, wordRevealMs)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  return <span className={className}>{words.slice(0, count).join(" ")}</span>
}

interface HeroPhoneProps {
  /** Fires whenever the timeline advances to a new phase — lets the hero
   * choreograph Wick against the loop (curious at the customer message,
   * thinking during the reply, one celebrating loop when the calendar chip
   * lands). Never fires under reduced motion (the static scene has no
   * phases to report). */
  onPhaseChange?: (phase: HeroPhonePhase) => void
}

export function HeroPhone({ onPhaseChange }: HeroPhoneProps = {}) {
  const reduceMotion = useReducedMotion()
  const containerRef = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const [cycleKey, setCycleKey] = useState(0)
  const [isActive, setIsActive] = useState(false)

  // Pause when the tab is hidden or the phone scrolls off-screen.
  useEffect(() => {
    if (reduceMotion) return
    const node = containerRef.current
    if (!node) return

    const updateActive = () => {
      setIsActive(!document.hidden && node.dataset.inView === "true")
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        node.dataset.inView = entry.isIntersecting ? "true" : "false"
        updateActive()
      },
      { threshold: 0.2 },
    )
    observer.observe(node)

    document.addEventListener("visibilitychange", updateActive)
    return () => {
      observer.disconnect()
      document.removeEventListener("visibilitychange", updateActive)
    }
  }, [reduceMotion])

  // Timeline advance — arms one timer per phase; pausing (isActive=false)
  // simply stops arming new timers, freezing the current frame.
  useEffect(() => {
    if (reduceMotion || !isActive) return
    const id = setTimeout(() => {
      setIndex((i) => {
        if (i === TIMELINE.length - 1) {
          setCycleKey((c) => c + 1)
          return 0
        }
        return i + 1
      })
    }, TIMELINE[index].holdMs)
    return () => clearTimeout(id)
  }, [index, isActive, reduceMotion])

  // Report the current phase to the hero for its Wick choreography.
  useEffect(() => {
    if (reduceMotion) return
    onPhaseChange?.(TIMELINE[index].phase)
  }, [index, reduceMotion, onPhaseChange])

  if (reduceMotion) {
    return (
      <div className="mx-auto w-full max-w-[340px]" data-scene="hero-phone">
        <PhoneShell>
          <StaticFinalScene />
        </PhoneShell>
        <SrNarration />
      </div>
    )
  }

  const phase = TIMELINE[index].phase
  const step = (name: (typeof TIMELINE)[number]["phase"]) =>
    TIMELINE.findIndex((s) => s.phase === name) <= index
  // The missed-call banner is a system notification, not part of the chat
  // transcript below it — it clears out once the reply phase begins rather
  // than accumulating with the other bubbles (see PhoneShell's fixed-height
  // header/content split + the readability-audit build report for why this
  // matters: without an explicit exit, four bubbles + the banner overflowed
  // the old shared flex column and collided with the header above it).
  const bannerVisible = index < TIMELINE.findIndex((s) => s.phase === "reply")

  return (
    <div ref={containerRef} className="relative mx-auto w-full max-w-[340px]" data-scene="hero-phone">
      {/* Soft concentric ripple as the missed-call banner lands — two rings,
          amber at 20%, expanding + fading out over 900ms. Sits behind the
          phone shell (z-0), replays every loop via the cycleKey remount.
          Mounted through "callDim" too (500ms + 500ms) so ring B's 1050ms
          run finishes before unmount instead of popping off mid-animation. */}
      {(phase === "call" || phase === "callDim") && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center">
          <motion.span
            key={`ripple-a-${cycleKey}`}
            initial={{ opacity: 0.35, scale: 0.6 }}
            animate={{ opacity: 0, scale: 1.5 }}
            transition={{ duration: 0.9, ease: easing.out }}
            className="absolute size-44 rounded-full border-2 border-amber-glow/20"
          />
          <motion.span
            key={`ripple-b-${cycleKey}`}
            initial={{ opacity: 0.3, scale: 0.6 }}
            animate={{ opacity: 0, scale: 1.75 }}
            transition={{ duration: 0.9, ease: easing.out, delay: 0.15 }}
            className="absolute size-56 rounded-full border-2 border-amber-glow/20"
          />
        </div>
      )}
      {/* Subtle idle float on the shell itself — independent transform layer
          so it composes cleanly with the hero's one-time spring entrance
          wrapping this whole component. */}
      <motion.div
        className="relative z-10"
        animate={{ y: [0, -3, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: easing.inOut }}
      >
      <PhoneShell>
        <motion.div
          className="flex h-full flex-col justify-end gap-2 px-3 pb-4"
          animate={{ opacity: phase === "reset" ? 0 : 1 }}
          transition={{
            duration: phase === "reset" ? 0.4 : duration.base,
            ease: easing.inOut,
          }}
        >
          {/* ① Missed-call banner — exits (slides up + fades) once the reply
              phase begins instead of piling up with the rest of the
              transcript; see `bannerVisible` above. */}
          <AnimatePresence>
            {bannerVisible && (
              <motion.div
                key={`call-${cycleKey}`}
                initial={{ opacity: 0, y: -10 }}
                animate={{
                  opacity: step("callDim") ? 0.55 : 1,
                  y: 0,
                  scale: step("callDim") ? 0.97 : 1,
                }}
                exit={{ opacity: 0, y: -16, transition: { duration: duration.base, ease: easing.inOut } }}
                transition={springGentle}
                /* Two-line card: icon lives in its own ringed avatar chip
                   (matches the header's avatar treatment below) so the row
                   reads as a system notification, not a chat bubble. Both
                   text lines stay ink (--foreground), not --destructive —
                   confirmed via a linear-alpha-composited OKLCH contrast
                   check (not a perceptual OKLCH mix): 14.57:1 light /
                   11.58:1 dark against destructive/10-over-card. A
                   muted-foreground subtitle was tried first and rejected —
                   it only clears ~7.5:1 light but drops to 3.84–4.51:1 in
                   the dark register (muted-foreground is tuned for plain
                   --card, not a tinted chip), so both lines share one
                   AA-safe color and get their hierarchy from weight/size
                   instead (see the readability-audit build report pattern
                   this file already established for the single-line
                   version). */
                className="flex items-center gap-2.5 self-stretch rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2.5"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-destructive/15 ring-1 ring-destructive/25">
                  <PhoneMissed aria-hidden="true" className="size-3.5 text-destructive" />
                </span>
                <div className="min-w-0 leading-tight">
                  <p className="text-[11px] font-semibold text-foreground">Missed call</p>
                  <p className="text-[10px] text-foreground">(555) 812-4076</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ② Lumina greeting */}
          {step("greeting") && (
            <div className="flex flex-col items-end gap-1">
              <motion.div
                key={`greeting-${cycleKey}`}
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={bubbleSpring}
                className="max-w-[85%] rounded-2xl rounded-br-md bg-primary/15 px-3.5 py-2.5 text-[13px] text-foreground"
              >
                <TypedBubbleText text={GREETING_TEXT} />
              </motion.div>
            </div>
          )}

          {/* ③ Customer */}
          {step("customer") && (
            <motion.div
              key={`customer-${cycleKey}`}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={bubbleSpring}
              className="flex justify-start"
            >
              <div className="max-w-[80%] rounded-2xl rounded-bl-md bg-muted px-3.5 py-2.5 text-[13px] text-foreground">
                Do you do birthday cakes for Saturday?
              </div>
            </motion.div>
          )}

          {/* ④ Lumina reply */}
          {step("reply") && (
            <div className="flex flex-col items-end gap-1">
              <motion.div
                key={`reply-${cycleKey}`}
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={bubbleSpring}
                className="max-w-[85%] rounded-2xl rounded-br-md bg-primary/15 px-3.5 py-2.5 text-[13px] text-foreground"
              >
                <TypedBubbleText text={REPLY_TEXT} />
              </motion.div>
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: duration.base, ease: easing.out, delay: 0.35 }}
                className="inline-flex items-center gap-1 pr-1 text-[10px] font-medium text-primary"
              >
                <Sparkles aria-hidden="true" className="size-2.5" />
                AI answered
              </motion.span>
            </div>
          )}

          {/* ⑤ Calendar chip — a mini event card (icon-in-ring avatar +
              title + confirmation line), the same two-line language as the
              missed-call banner above, so the loop reads as one system:
              "we caught the miss, then we resolved it." Ink text on both
              lines for the same AA reasons as the banner (14.57:1 light /
              9.87:1 dark against success/10-over-card; --success text
              itself only clears ~4.55:1 light / drops to 3.83:1–4.74:1
              dark). The trailing "✓" is dropped (emoji sweep):
              CalendarCheck2 already carries the "confirmed" meaning. */}
          {step("calendar") && (
            <div className="relative pt-1">
              <motion.div
                aria-hidden="true"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.6, 0] }}
                transition={{ duration: 0.7, times: [0, 0.4, 1], ease: easing.out }}
                className="absolute inset-0 top-1 rounded-xl bg-amber-glow/50 blur-md"
              />
              <motion.div
                key={`calendar-${cycleKey}`}
                initial={{ opacity: 0, y: 6, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={bubbleSpring}
                className="relative flex items-center gap-2.5 self-stretch rounded-xl border border-success/30 bg-success/10 px-3 py-2.5"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-success/15 ring-1 ring-success/30">
                  <CalendarCheck2 aria-hidden="true" className="size-3.5 text-success" />
                </span>
                <div className="min-w-0 leading-tight">
                  <p className="text-[11px] font-semibold text-foreground">Cake pickup — Sat 10:00 AM</p>
                  <p className="text-[10px] text-foreground">Added to calendar</p>
                </div>
              </motion.div>
            </div>
          )}
        </motion.div>
      </PhoneShell>
      </motion.div>
      <SrNarration />
    </div>
  )
}

function PhoneShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className="relative flex h-[430px] flex-col overflow-hidden rounded-[2.5rem] bg-card shadow-raised"
      /* Bezel — token-based (color-mix against --foreground) instead of a
         raw border-white/10, same technique problem.tsx's CounterPhone
         frame already uses: a light frame in light mode, a dark frame in
         dark mode, always device-chrome-appropriate rather than a fixed
         white hairline that would nearly vanish on a light card. The inset
         ring adds a faint "glass" edge just inside the bezel. */
      style={{
        border: "7px solid color-mix(in oklch, var(--foreground) 14%, transparent)",
        boxShadow: "var(--shadow-raised), inset 0 0 0 1px color-mix(in oklch, var(--foreground) 6%, transparent)",
      }}
    >
      {/* Faint status bar — realism detail (design brief: "9:41 PM").
          Decorative flavor text, not live data, sitting to the left of the
          notch the way a real status-bar clock does. Full-strength
          --muted-foreground (not an opacity dip) per this file's own
          established pattern: 8.14:1 light / 6.58:1 dark against --card,
          comfortably AA even though it reads visually "faint" next to the
          bolder header text beneath it. */}
      <span className="absolute top-3.5 left-5 z-20 font-mono text-[10px] font-medium tracking-wide text-muted-foreground">
        9:41 PM
      </span>

      {/* Notch */}
      <div
        className="absolute top-3 left-1/2 z-20 h-5 w-24 -translate-x-1/2 rounded-full bg-background/90"
        style={{ boxShadow: "inset 0 0 0 1px color-mix(in oklch, var(--foreground) 10%, transparent)" }}
      />

      {/* Header — its own reserved row (shrink-0), never sharing space with
          the message stack below. This is the actual fix for the
          missed-call-banner/header collision: previously the header and a
          fixed-height, bottom-pinned message column were separate flex
          children of the same container, so once the column's content grew
          past its own height it rendered outside its box, up into the
          header (see the readability-audit build report). */}
      <div className="flex shrink-0 items-center gap-2 px-3 pt-9 pb-2">
        <span className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Sparkles aria-hidden="true" className="size-3.5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 leading-none">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Wordmark className="text-xs" />
            <span aria-hidden="true" className="text-muted-foreground">
              ·
            </span>
            <span>Front desk</span>
          </span>
          <span className="truncate text-[10px] text-muted-foreground">answering for Sunrise Bakery</span>
        </div>
        <LiveDot />
      </div>

      {/* Message stack — flex-1 (bounded by the shell's own fixed height, so
          it can never grow into the header) + overflow-hidden, with a soft
          top mask so any bubble pushed toward/above the visible edge fades
          out like a real chat scrolling, instead of hard-clipping or
          spilling over. */}
      <div
        className="relative min-h-0 flex-1 overflow-hidden"
        style={{
          maskImage: "linear-gradient(to bottom, transparent, black 28px)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent, black 28px)",
        }}
      >
        {children}
      </div>
    </div>
  )
}

/** Pulsing "we're live" indicator in the header — a solid dot plus a soft
 * expanding ring (Tailwind's built-in `animate-ping`), which the global
 * `prefers-reduced-motion` override in globals.css already neutralizes
 * (forces every animation's duration to ~0 / iteration-count to 1), so no
 * separate reduced-motion branch is needed here. --success at full
 * strength against --card clears the 3:1 non-text-graphic bar with room to
 * spare (4.95:1 light / 8.12:1 dark). */
function LiveDot() {
  return (
    <span aria-hidden="true" className="relative flex size-2 shrink-0 items-center justify-center">
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
      <span className="relative inline-flex size-1.5 rounded-full bg-success" />
    </span>
  )
}

/** Reduced-motion + non-JS fallback: the finished scene, no animation. The
 * missed-call banner is omitted here — by the "finished" state it has
 * already cleared out (see `bannerVisible` in the animated version above),
 * so the static scene shows the same settled transcript rather than
 * recreating the collision the animated fix removes. */
function StaticFinalScene() {
  return (
    <div className={cn("flex h-full flex-col justify-end gap-2 px-3 pb-4")}>
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary/15 px-3.5 py-2.5 text-[13px] text-foreground">
          {GREETING_TEXT}
        </div>
      </div>

      <div className="flex justify-start">
        <div className="max-w-[80%] rounded-2xl rounded-bl-md bg-muted px-3.5 py-2.5 text-[13px] text-foreground">
          Do you do birthday cakes for Saturday?
        </div>
      </div>

      <div className="flex flex-col items-end gap-1">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary/15 px-3.5 py-2.5 text-[13px] text-foreground">
          {REPLY_TEXT}
        </div>
        <span className="inline-flex items-center gap-1 pr-1 text-[10px] font-medium text-primary">
          <Sparkles aria-hidden="true" className="size-2.5" />
          AI answered
        </span>
      </div>

      <div className="pt-1">
        <div className="flex items-center gap-2.5 rounded-xl border border-success/30 bg-success/10 px-3 py-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-success/15 ring-1 ring-success/30">
            <CalendarCheck2 aria-hidden="true" className="size-3.5 text-success" />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="text-[11px] font-semibold text-foreground">Cake pickup — Sat 10:00 AM</p>
            <p className="text-[10px] text-foreground">Added to calendar</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function SrNarration() {
  return (
    <p className="sr-only">
      A phone mockup shows a missed call from (555) 812-4076. Lumina automatically replies,
      &ldquo;Sorry we missed you! How can we help?&rdquo; The customer asks, &ldquo;Do you do
      birthday cakes for Saturday?&rdquo; Lumina answers, &ldquo;We do! Custom cakes are $45 with
      48h notice — want me to book a Saturday pickup?&rdquo; and books it: Saturday 10:00 AM, cake
      pickup, confirmed.
    </p>
  )
}
