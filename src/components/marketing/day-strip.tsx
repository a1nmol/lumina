"use client"

// Section 5-9 · THE DAY STRIP — landing-copy.md §5-9, brand-redesign-plan.md
// §5.6 (the centerpiece). Gate 3: a pinned-scroll story on desktop (lg+) —
// a sticky viewport-height stage whose ~400vh scroll driver scrubs a sky
// gradient (dawn → noon → dusk → night → dawn) and crossfades five scene
// panels, each with a small scroll-scrubbed micro-motion (chalkboard
// "write-on", a sliding ticket, an amber pulse, a typed-in reply, a
// printing receipt). Below lg, and for anyone with prefers-reduced-motion,
// the section falls back to the original static stacked cards with
// whileInView entrances — no scroll-jacking, ever.
//
// Scroll mapping: `useScroll({ target: stageRef })` over the ~400vh driver
// produces `scrollYProgress` (0→1). That single motion value is the only
// scroll listener for the whole scene — everything else (`SkyLayer`,
// `ScenePanel`, `RailDot`) derives its own crossfade/local-progress via
// `useTransform`, so there's no imperative scroll handling and no layout
// thrash. Each of the 5 scenes owns an even 1/5 (20%) slice of progress;
// `useSegmentOpacity` produces the shared crossfade curve (fade in over the
// last ~4% of the previous slice, hold, fade out over the first ~4% of the
// next) and each panel additionally derives its own `localT` (0→1 clamped
// to its own slice) to drive that scene's specific micro-motion.

import { useRef } from "react"
import {
  motion,
  useMotionValue,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion"
import { CalendarDays, Check, DoorOpen, MessageCircleWarning, Scissors, Sparkles, Star, ThumbsUp } from "lucide-react"

import { TimeStamp } from "@/components/brand/time-stamp"
import { useMounted } from "@/hooks/use-mounted"
import { useReducedMotionSafe } from "@/hooks/use-reduced-motion-safe"
import { cn } from "@/lib/utils"

import { ScrollReveal } from "./scroll-reveal"

/** Five equal scroll slices — one per scene, in on-page order. */
const SCENES = [
  { key: "7am", stamp: "7:00 AM", title: "Your morning post, already written." },
  { key: "12pm", stamp: "12:00 PM", title: "Your week, on the rail." },
  { key: "6pm", stamp: "6:00 PM", title: "Ding — a customer at the digital door." },
  { key: "11pm", stamp: "11:00 PM", title: "While Main Street sleeps, yours is answering." },
  { key: "645am", stamp: "6:45 AM", title: "The morning receipt." },
] as const

const SEGMENT_SIZE = 1 / SCENES.length

export function DayStrip() {
  return (
    <section id="day-strip" data-scene="day-strip" className="bg-background py-20 sm:py-28 lg:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="mb-16 text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            One day on Main Street.
          </h2>
        </ScrollReveal>
      </div>

      <DayStripBody />
    </section>
  )
}

function DayStripBody() {
  // Structural switch (an entirely different subtree: the pinned scroll
  // stage vs. the static stacked cards — not just animation props), so this
  // uses the mount-gated useReducedMotionSafe rather than framer's
  // useReducedMotion. `mounted` starts false on both SSR and the client's
  // first paint, so the static stacked layout is what renders — and is all
  // that ever renders — until hydration has fully committed; only then,
  // once the real matchMedia value is known, does the pinned stage mount
  // (and only if motion is actually allowed). This intentionally trades a
  // one-effect-tick delay before the pinned stage appears on desktop for
  // zero risk of a reduced-motion visitor ever seeing it flash in first.
  const reduceMotion = useReducedMotionSafe()
  const mounted = useMounted()
  const showPinnedStage = mounted && !reduceMotion

  return (
    <>
      {/* Static stacked story — the mobile/tablet layout, the reduced-motion
          fallback at every breakpoint, AND the universal pre-mount/SSR
          render ("stacked static everywhere" until proven otherwise). */}
      <div className={cn("mx-auto max-w-3xl px-4 sm:px-6 lg:px-8", showPinnedStage && "lg:hidden")}>
        <div className="flex flex-col gap-16">
          <MorningChalkboard />
          <TicketRail />
          <ShopBell />
          <IndigoHours />
          <MorningReceipt />
        </div>
      </div>

      {/* Pinned scroll story — desktop only, motion allowed only, mounted only after hydration confirms both. */}
      {showPinnedStage && (
        <div className="hidden lg:block">
          <PinnedDayStripStage />
        </div>
      )}
    </>
  )
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
/* Pinned desktop stage                                                */
/* ------------------------------------------------------------------ */

function PinnedDayStripStage() {
  const stageRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: stageRef, offset: ["start start", "end end"] })

  return (
    // 400vh scroll driver — not a spacing-scale value (it's a scroll
    // length, not a surface/UI dimension), per the brief's "~400vh tall".
    <div ref={stageRef} className="relative" style={{ height: "400vh" }}>
      {/* Sticky stage sits just below the sticky nav (top-14 / h-14, same
          token nav.tsx already uses) so it never hides beneath it. */}
      <div className="sticky top-14 h-[calc(100vh-3.5rem)] overflow-hidden rounded-3xl border border-border shadow-overlay">
        <SkyBand progress={scrollYProgress} />
        <ProgressRail progress={scrollYProgress} />

        <div className="relative z-10 flex h-full items-center justify-center px-10 py-16 xl:px-20">
          <div className="relative h-96 w-full max-w-xl">
            {SCENES.map((scene, index) => (
              <ScenePanel key={scene.key} scene={scene} index={index} progress={scrollYProgress} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Shared crossfade curve for a scene's 1/5 slice of scroll progress. */
function useSegmentOpacity(progress: MotionValue<number>, index: number, total: number) {
  const size = 1 / total
  const start = index * size
  const end = start + size
  const fade = size * 0.2
  // Framer v12 may compile scroll-linked transforms to WAAPI keyframes, whose
  // offsets must be non-decreasing AND within [0,1] — so the edge segments'
  // fade windows must be clamped (index 0 would otherwise start at -fade,
  // the last segment would end at 1+fade, and WAAPI throws). Epsilon keeps
  // the four stops strictly increasing so interpolation never degenerates.
  const eps = 0.0001
  const input = [
    Math.max(0, start - fade),
    Math.max(eps, start),
    Math.min(1 - eps, end),
    Math.min(1, end + fade),
  ]
  for (let i = 1; i < input.length; i++) {
    if (input[i] <= input[i - 1]) input[i] = input[i - 1] + eps
  }
  return useTransform(
    progress,
    input,
    [index === 0 ? 1 : 0, 1, 1, index === total - 1 ? 1 : 0]
  )
}

function ScenePanel({
  scene,
  index,
  progress,
}: {
  scene: (typeof SCENES)[number]
  index: number
  progress: MotionValue<number>
}) {
  const start = index * SEGMENT_SIZE
  const end = start + SEGMENT_SIZE
  const fade = SEGMENT_SIZE * 0.2
  const isFirst = index === 0
  const isLast = index === SCENES.length - 1

  const opacity = useSegmentOpacity(progress, index, SCENES.length)
  const y = useTransform(
    progress,
    [start - fade, start, end, end + fade],
    [isFirst ? 0 : 16, 0, 0, isLast ? 0 : -16]
  )
  const localT = useTransform(progress, [start, end], [0, 1], { clamp: true })

  return (
    <motion.div style={{ opacity, y }} className="absolute inset-0 flex flex-col justify-center">
      <SceneHeading stamp={scene.stamp} title={scene.title} animated={false} />
      <div className="mt-2">
        <ScenePanelContent sceneKey={scene.key} localT={localT} />
      </div>
    </motion.div>
  )
}

function ScenePanelContent({ sceneKey, localT }: { sceneKey: (typeof SCENES)[number]["key"]; localT: MotionValue<number> }) {
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

/* ------------------------------------------------------------------ */
/* Sky band                                                            */
/* ------------------------------------------------------------------ */

const SKY_LAYERS = [
  { token: "--sky-dawn" },
  { token: "--sky-noon" },
  { token: "--sky-dusk" },
  { token: "--sky-night" },
  { token: "--sky-dawn" },
] as const

function SkyBand({ progress }: { progress: MotionValue<number> }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {SKY_LAYERS.map((layer, index) => (
        <SkyLayer key={`${layer.token}-${index}`} index={index} token={layer.token} progress={progress} />
      ))}
    </div>
  )
}

function SkyLayer({ index, token, progress }: { index: number; token: string; progress: MotionValue<number> }) {
  const opacity = useSegmentOpacity(progress, index, SKY_LAYERS.length)
  return (
    <motion.div
      style={{
        opacity,
        backgroundImage: `linear-gradient(180deg, var(${token}) 0%, var(${token}) 40%, transparent 100%)`,
      }}
      className="absolute inset-0"
    />
  )
}

/* ------------------------------------------------------------------ */
/* Progress rail — the streetlamp-wire micro-signature, scoped to the   */
/* day-strip stage (brand-redesign-plan.md §5 micro-signatures).        */
/* ------------------------------------------------------------------ */

function ProgressRail({ progress }: { progress: MotionValue<number> }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute top-1/2 left-6 z-10 hidden -translate-y-1/2 xl:left-10 lg:block"
    >
      <div className="relative flex h-64 flex-col justify-between">
        <div className="absolute top-1 bottom-1 left-1/2 w-px -translate-x-1/2 bg-border" />
        <motion.div
          style={{ scaleY: progress }}
          className="absolute top-1 bottom-1 left-1/2 w-px origin-top -translate-x-1/2 bg-primary"
        />
        {SCENES.map((scene, index) => (
          <RailDot key={scene.key} index={index} progress={progress} />
        ))}
      </div>
    </div>
  )
}

function RailDot({ index, progress }: { index: number; progress: MotionValue<number> }) {
  const threshold = index * SEGMENT_SIZE
  // Degenerate [0,0] ranges (index 0) break interpolation/WAAPI offsets —
  // keep the window strictly increasing.
  const windowStart = Math.max(0, threshold - 0.02)
  const windowEnd = Math.max(windowStart + 0.0001, threshold)
  const filled = useTransform(progress, [windowStart, windowEnd], [0, 1], { clamp: true })
  return (
    <div className="relative z-10 flex size-2.5 items-center justify-center">
      <span className="absolute inset-0 rounded-full border border-border bg-background" />
      <motion.span
        style={{ opacity: filled, scale: filled }}
        className="absolute inset-0 rounded-full bg-primary shadow-glow"
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Scene cards — shared between the pinned desktop panels (driven by     */
/* scroll-derived `localT`) and the static mobile/reduced-motion stack   */
/* (passed a constant `localT = 1`, i.e. "fully progressed"). Keeping     */
/* one implementation means the two layouts can never visually drift.    */
/* ------------------------------------------------------------------ */

function MorningChalkboard() {
  const localT = useMotionValue(1)
  return (
    <div data-scene="day-strip-7am">
      <SceneHeading stamp="7:00 AM" title="Your morning post, already written." />
      <ScrollReveal delay={0.05}>
        <ChalkboardCard localT={localT} />
      </ScrollReveal>
    </div>
  )
}

function ChalkboardCard({ localT }: { localT: MotionValue<number> }) {
  const reveal = useTransform(localT, [0, 0.55], [0, 100], { clamp: true })
  const clipPath = useTransform(reveal, (v) => `inset(0 ${100 - v}% 0 0)`)
  return (
    <div className="rounded-2xl border-[10px] border-chalkboard-border bg-chalkboard p-6 shadow-raised sm:p-8">
      <motion.p
        style={{ clipPath }}
        className="-rotate-1 font-serif text-lg leading-relaxed text-chalkboard-foreground italic [text-shadow:0_0_1px_var(--chalkboard-foreground)] sm:text-xl"
      >
        Fresh sourdough out at 7. The first loaf&rsquo;s crackle is for the early birds. 🥖
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

function TicketRail() {
  const localT = useMotionValue(1)
  return (
    <div data-scene="day-strip-12pm">
      <SceneHeading stamp="12:00 PM" title="Your week, on the rail." />
      <ScrollReveal delay={0.05}>
        <TicketRailCard localT={localT} />
      </ScrollReveal>
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

function ShopBell() {
  const localT = useMotionValue(1)
  return (
    <div data-scene="day-strip-6pm">
      <SceneHeading stamp="6:00 PM" title="Ding — a customer at the digital door." />
      <ScrollReveal delay={0.05}>
        <ShopBellCard localT={localT} />
      </ScrollReveal>
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

function IndigoHours() {
  const localT = useMotionValue(1)
  return (
    <div data-scene="day-strip-11pm">
      <SceneHeading stamp="11:00 PM" title="While Main Street sleeps, yours is answering." />
      <ScrollReveal delay={0.05}>
        <IndigoHoursCard localT={localT} />
      </ScrollReveal>
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

function MorningReceipt() {
  const localT = useMotionValue(1)
  return (
    <div data-scene="day-strip-645am">
      <SceneHeading stamp="6:45 AM" title="The morning receipt." />
      <ScrollReveal delay={0.05}>
        <MorningReceiptCard localT={localT} />
      </ScrollReveal>
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
        <p className="text-center text-sm font-semibold text-foreground">GOOD MORNING ☀</p>
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
