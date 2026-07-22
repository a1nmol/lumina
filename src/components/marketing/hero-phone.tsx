"use client"

// Hero phone mockup — animated 5-step loop (brand-redesign-plan.md §5.2,
// landing-copy.md §1 phone loop). Bezel styling adapted from
// src/components/studio/phone-frame.tsx (lean marketing variant — no
// generate/idle states).
//
// Timeline (single interval-driven phase machine, ~6.9s per cycle):
//   ① call        0 –  500ms  missed-call banner slides in, bright
//   ② callDim   500 – 1000ms  banner dims
//   ③ greeting 1000 – 1700ms  LocalOS bubble springs in + types in
//   ④ customer 1700 – 2400ms  customer bubble slides in
//   ⑤ reply    2400 – 3300ms  AI reply bubble types in + "AI answered" chip
//   ⑥ calendar 3300 – 4000ms  calendar chip springs in, one-shot amber glow
//   ⑦ hold     4000 – 6500ms  full scene holds (the "4s five-step loop")
//   ⑧ reset    6500 – 6900ms  soft crossfade out, then loop
// Pauses (freezes on current frame) when the tab is hidden or the phone is
// off-screen; reduced-motion renders the static final composition only.

import { useEffect, useRef, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
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

export function HeroPhone() {
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

  if (reduceMotion) {
    return (
      <div className="mx-auto w-full max-w-[300px]" data-scene="hero-phone">
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

  return (
    <div ref={containerRef} className="mx-auto w-full max-w-[300px]" data-scene="hero-phone">
      <PhoneShell>
        <motion.div
          className="flex h-[300px] flex-col justify-end gap-2 px-3 pb-4"
          animate={{ opacity: phase === "reset" ? 0 : 1 }}
          transition={{
            duration: phase === "reset" ? 0.4 : duration.base,
            ease: easing.inOut,
          }}
        >
          {/* ① Missed-call banner */}
          {step("call") && (
            <motion.div
              key={`call-${cycleKey}`}
              initial={{ opacity: 0, y: -10 }}
              animate={{
                opacity: step("callDim") ? 0.55 : 1,
                y: 0,
                scale: step("callDim") ? 0.97 : 1,
              }}
              transition={springGentle}
              className="flex items-center gap-2 self-stretch rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-[11px] font-medium text-destructive"
            >
              <PhoneMissed aria-hidden="true" className="size-3.5 shrink-0" />
              (555) 812-4076 · Missed call
            </motion.div>
          )}

          {/* ② LocalOS greeting */}
          {step("greeting") && (
            <div className="flex flex-col items-end gap-1">
              <motion.div
                key={`greeting-${cycleKey}`}
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={springGentle}
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
              transition={springGentle}
              className="flex justify-start"
            >
              <div className="max-w-[80%] rounded-2xl rounded-bl-md bg-muted px-3.5 py-2.5 text-[13px] text-foreground">
                Do you do birthday cakes for Saturday?
              </div>
            </motion.div>
          )}

          {/* ④ LocalOS reply */}
          {step("reply") && (
            <div className="flex flex-col items-end gap-1">
              <motion.div
                key={`reply-${cycleKey}`}
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={springGentle}
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

          {/* ⑤ Calendar chip */}
          {step("calendar") && (
            <div className="relative flex justify-start pt-1">
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
                transition={springGentle}
                className="relative inline-flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-[12px] font-medium text-success"
              >
                <CalendarCheck2 aria-hidden="true" className="size-3.5 shrink-0" />
                Sat 10:00 AM · Cake pickup ✓
              </motion.div>
            </div>
          )}
        </motion.div>
      </PhoneShell>
      <SrNarration />
    </div>
  )
}

function PhoneShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className="relative overflow-hidden rounded-[2.25rem] border-[6px] border-white/10 bg-card shadow-overlay"
    >
      {/* Notch */}
      <div className="absolute top-2.5 left-1/2 z-20 h-4 w-20 -translate-x-1/2 rounded-full bg-background/90 ring-1 ring-white/10" />

      <div className="flex items-center gap-2 px-3 pt-8 pb-2">
        <span className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Sparkles aria-hidden="true" className="size-3.5" />
        </span>
        <div className="flex flex-col leading-none">
          <span className="text-xs font-semibold text-foreground">
            <Wordmark className="text-xs" />
          </span>
          <span className="text-[10px] text-muted-foreground">answering for Sunrise Bakery</span>
        </div>
      </div>

      {children}
    </div>
  )
}

/** Reduced-motion + non-JS fallback: the finished scene, no animation. */
function StaticFinalScene() {
  return (
    <div className={cn("flex h-[300px] flex-col justify-end gap-2 px-3 pb-4")}>
      <div className="flex items-center gap-2 self-stretch rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-[11px] font-medium text-destructive opacity-55">
        <PhoneMissed aria-hidden="true" className="size-3.5 shrink-0" />
        (555) 812-4076 · Missed call
      </div>

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

      <div className="flex justify-start pt-1">
        <div className="inline-flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-[12px] font-medium text-success">
          <CalendarCheck2 aria-hidden="true" className="size-3.5 shrink-0" />
          Sat 10:00 AM · Cake pickup ✓
        </div>
      </div>
    </div>
  )
}

function SrNarration() {
  return (
    <p className="sr-only">
      A phone mockup shows a missed call from (555) 812-4076. LocalOS automatically replies,
      &ldquo;Sorry we missed you! How can we help?&rdquo; The customer asks, &ldquo;Do you do
      birthday cakes for Saturday?&rdquo; LocalOS answers, &ldquo;We do! Custom cakes are $45 with
      48h notice — want me to book a Saturday pickup?&rdquo; and books it: Saturday 10:00 AM, cake
      pickup, confirmed.
    </p>
  )
}
