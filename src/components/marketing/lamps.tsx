// Section 4 · HOW IT WORKS — three streetlamps (landing-copy.md §4). Plain-
// English pillars, no AI jargon. Each pillar is a streetlamp SVG — ink
// line-art strokes for the post/head (light-register restyle), amber glow
// ellipse stays filled; as the column scrolls into view the lamp "flicks
// on" (glow flicker-springs to full) and the copy fades up right after,
// staggered column to column. Under each lamp's copy sits a tiny looping
// mini-demo vignette (Next Wave Track C, docs/design-briefs/next-wave-
// worklist.md) — a ~3s real-component loop that shows the pillar in
// action, not just describes it. Every vignette pauses (IntersectionObserver
// + document visibility, mirrors hero-phone.tsx's isActive pattern) when
// off-screen or the tab is hidden, and renders its finished, static frame
// under prefers-reduced-motion.

"use client"

import { useEffect, useRef, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { CalendarCheck2, Heart, ImagePlus, MessageCircleHeart, Sparkles, type LucideIcon } from "lucide-react"

import { duration, easing, springGentle } from "@/lib/motion"
import { cn } from "@/lib/utils"

import { ScrollReveal } from "./scroll-reveal"

/** Delay added per column so lamps light left-to-right even when they enter view together. */
const COLUMN_STAGGER = 0.15
/** Extra delay after a lamp's flicker starts before its copy fades up ("right after"). */
const COPY_DELAY_AFTER_LAMP = 0.15
/** Flicker duration: two quick under/over-shoots before settling fully lit. */
const FLICKER_DURATION = 0.9
const FLICKER_OPACITY = [0, 0.4, 0.15, 1]
const FLICKER_TIMES = [0, 0.3, 0.55, 1]

const PILLARS: { title: string; body: string; icon: LucideIcon; Demo: () => React.JSX.Element }[] = [
  {
    title: "Gets you seen",
    body: "Every week Lumina drafts posts that sound like you. You approve with one tap.",
    icon: Sparkles,
    Demo: SeenVignette,
  },
  {
    title: "Never misses a customer",
    body: "Chats, texts, DMs — answered in seconds, day or night, from your real hours, menu, and prices.",
    icon: MessageCircleHeart,
    Demo: NeverMissesVignette,
  },
  {
    title: "Shows what worked",
    body: "See which post brought which customers, down to the booking.",
    icon: CalendarCheck2,
    Demo: ShowsWorkedVignette,
  },
]

export function Lamps() {
  return (
    <section id="how-it-works" data-scene="lamps" className="bg-background py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="mx-auto max-w-xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Three jobs. Handled.</h2>
        </ScrollReveal>

        <div className="mt-16 grid gap-12 sm:grid-cols-3 sm:gap-6">
          {PILLARS.map((pillar, index) => (
            <Pillar key={pillar.title} pillar={pillar} index={index} />
          ))}
        </div>
      </div>
    </section>
  )
}

/** unlit → lit variants, keyed off the column index via the `custom` prop for the stagger. */
const glowVariants = {
  unlit: { opacity: 0 },
  lit: (i: number) => ({
    opacity: FLICKER_OPACITY,
    transition: { delay: i * COLUMN_STAGGER, duration: FLICKER_DURATION, times: FLICKER_TIMES, ease: easing.out },
  }),
}

const lampHeadVariants = {
  unlit: { opacity: 0.5 },
  lit: (i: number) => ({
    opacity: 1,
    transition: { delay: i * COLUMN_STAGGER, duration: duration.base, ease: easing.out },
  }),
}

const copyVariants = {
  unlit: { opacity: 0, y: 16 },
  lit: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * COLUMN_STAGGER + COPY_DELAY_AFTER_LAMP,
      duration: duration.base,
      ease: easing.out,
    },
  }),
}

function Pillar({
  pillar,
  index,
}: {
  pillar: { title: string; body: string; icon: LucideIcon; Demo: () => React.JSX.Element }
  index: number
}) {
  const reduceMotion = useReducedMotion()

  if (reduceMotion) {
    return (
      <div className="flex flex-col items-center text-center">
        <StreetLampStatic icon={pillar.icon} />
        <h3 className="mt-5 text-lg font-semibold text-foreground">{pillar.title}</h3>
        <p className="mt-2 max-w-[22ch] text-sm text-muted-foreground">{pillar.body}</p>
        <pillar.Demo />
      </div>
    )
  }

  return (
    <motion.div
      className="flex flex-col items-center text-center"
      custom={index}
      initial="unlit"
      whileInView="lit"
      viewport={{ once: true, margin: "-40%" }}
    >
      <StreetLampAnimated icon={pillar.icon} />
      <motion.div variants={copyVariants}>
        <h3 className="mt-5 text-lg font-semibold text-foreground">{pillar.title}</h3>
        <p className="mt-2 max-w-[22ch] text-sm text-muted-foreground">{pillar.body}</p>
        <pillar.Demo />
      </motion.div>
    </motion.div>
  )
}

function StreetLampAnimated({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div className="relative flex flex-col items-center" aria-hidden="true">
      <svg width="72" height="130" viewBox="0 0 72 130" className="overflow-visible">
        {/* Glow — unlit until the column scrolls into view, then flickers on */}
        <motion.ellipse
          cx="36"
          cy="28"
          rx="30"
          ry="24"
          variants={glowVariants}
          className="fill-amber-glow/25"
          style={{ filter: "blur(10px)" }}
        />
        <motion.ellipse
          cx="36"
          cy="28"
          rx="14"
          ry="12"
          variants={glowVariants}
          className="fill-amber-glow/50"
          style={{ filter: "blur(4px)" }}
        />
        {/* Lamp head — ink line-art, dim until lit */}
        <motion.g
          variants={lampHeadVariants}
          className="text-foreground/75"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinejoin="round"
        >
          <path d="M 20 26 Q 36 6 52 26 L 46 34 L 26 34 Z" />
          <rect x="30" y="34" width="12" height="6" rx="1.5" />
        </motion.g>
        {/* Pole — ink line-art, structural, not part of the light */}
        <g className="text-foreground/60" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <line x1="36" y1="40" x2="36" y2="120" />
          <rect x="26" y="118" width="20" height="6" rx="2" />
        </g>
      </svg>
      <span className="absolute top-5 flex size-8 items-center justify-center rounded-full bg-background/80 text-flame ring-1 ring-amber-glow/40 backdrop-blur-sm">
        <Icon aria-hidden="true" className="size-4" />
      </span>
    </div>
  )
}

function StreetLampStatic({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div className="relative flex flex-col items-center" aria-hidden="true">
      <svg width="72" height="130" viewBox="0 0 72 130" className="overflow-visible">
        <ellipse cx="36" cy="28" rx="30" ry="24" className="fill-amber-glow/25" style={{ filter: "blur(10px)" }} />
        <ellipse cx="36" cy="28" rx="14" ry="12" className="fill-amber-glow/50" style={{ filter: "blur(4px)" }} />
        <g className="text-foreground/75" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round">
          <path d="M 20 26 Q 36 6 52 26 L 46 34 L 26 34 Z" />
          <rect x="30" y="34" width="12" height="6" rx="1.5" />
        </g>
        <g className="text-foreground/60" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <line x1="36" y1="40" x2="36" y2="120" />
          <rect x="26" y="118" width="20" height="6" rx="2" />
        </g>
      </svg>
      <span className="absolute top-5 flex size-8 items-center justify-center rounded-full bg-background/80 text-flame ring-1 ring-amber-glow/40 backdrop-blur-sm">
        <Icon aria-hidden="true" className="size-4" />
      </span>
    </div>
  )
}

/* ---------------------------------------------------------------------- */
/* Mini-demo vignettes — shared loop machinery                            */
/* ---------------------------------------------------------------------- */

/** Two-phase hold durations (ms): [dim/idle hold, demonstrated/lit hold]. Sums to ~3s per loop, matching the design brief's "~3s" cadence. */
type VignetteHolds = readonly [number, number]

/** Tracks whether a vignette is visible AND the tab is foregrounded — pairs
 *  with usePhaseLoop below. Arming no new phase timer while inactive simply
 *  freezes the vignette on its current frame instead of animating unseen,
 *  mirroring hero-phone.tsx's isActive pattern. No-ops entirely under
 *  reduced motion (no observer is ever attached, so the phase never
 *  advances past its initial 0). */
function useVignetteActive(reduceMotion: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  const [isActive, setIsActive] = useState(false)

  useEffect(() => {
    if (reduceMotion) return
    const node = ref.current
    if (!node) return

    const updateActive = () => setIsActive(!document.hidden && node.dataset.inView === "true")
    const observer = new IntersectionObserver(
      ([entry]) => {
        node.dataset.inView = entry.isIntersecting ? "true" : "false"
        updateActive()
      },
      { threshold: 0.4 }
    )
    observer.observe(node)

    document.addEventListener("visibilitychange", updateActive)
    return () => {
      observer.disconnect()
      document.removeEventListener("visibilitychange", updateActive)
    }
  }, [reduceMotion])

  return [ref, isActive] as const
}

/** Alternates 0 → 1 → 0… on its own timer while `active`; frozen at its
 *  current value while inactive. */
function usePhaseLoop(active: boolean, holdsMs: VignetteHolds) {
  const [phase, setPhase] = useState<0 | 1>(0)

  useEffect(() => {
    if (!active) return
    const id = setTimeout(() => setPhase((p) => (p === 0 ? 1 : 0)), holdsMs[phase])
    return () => clearTimeout(id)
  }, [active, phase, holdsMs])

  return phase
}

/* ---------------------------------------------------------------------- */
/* ① Gets you seen — a tiny post card slides up + heart/reach ticks       */
/* ---------------------------------------------------------------------- */

const SEEN_HOLDS: VignetteHolds = [900, 2100]

function SeenVignette() {
  const reduceMotion = !!useReducedMotion()
  const [ref, active] = useVignetteActive(reduceMotion)
  const phase = usePhaseLoop(active, SEEN_HOLDS)
  const posted = reduceMotion || phase === 1

  return (
    <div ref={ref} aria-hidden="true" className="mx-auto mt-5 flex h-14 w-[150px] items-center justify-center">
      <motion.div
        initial={false}
        animate={{ y: posted ? 0 : 4, opacity: posted ? 1 : 0.6 }}
        transition={springGentle}
        className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2 shadow-soft"
      >
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary/25 via-[var(--chart-3)]/20 to-[var(--chart-4)]/15 text-flame">
          <ImagePlus aria-hidden="true" className="size-3" />
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold tabular-nums text-foreground">
          <motion.span
            initial={false}
            animate={{ scale: posted ? [1, 1.3, 1] : 1 }}
            transition={{ duration: duration.base, ease: easing.out }}
            className="inline-flex"
          >
            <Heart
              aria-hidden="true"
              className={cn("size-2.5", posted ? "fill-flame text-flame" : "text-muted-foreground")}
            />
          </motion.span>
          {posted ? "47" : "12"}
        </span>
      </motion.div>
    </div>
  )
}

/* ---------------------------------------------------------------------- */
/* ② Never misses — a mini chat Q auto-answered with the AI chip          */
/* ---------------------------------------------------------------------- */

const NEVER_MISSES_HOLDS: VignetteHolds = [900, 2100]

function NeverMissesVignette() {
  const reduceMotion = !!useReducedMotion()
  const [ref, active] = useVignetteActive(reduceMotion)
  const phase = usePhaseLoop(active, NEVER_MISSES_HOLDS)
  const answered = reduceMotion || phase === 1

  return (
    <div ref={ref} aria-hidden="true" className="mx-auto mt-5 flex h-14 w-[150px] flex-col justify-center gap-1">
      <div className="flex justify-start">
        <span className="max-w-[85%] rounded-lg rounded-bl-sm bg-muted px-2 py-1 text-[9px] text-foreground">
          Open Sunday?
        </span>
      </div>
      <motion.div
        initial={false}
        animate={{ opacity: answered ? 1 : 0, y: answered ? 0 : 4 }}
        transition={springGentle}
        className="flex flex-col items-end gap-0.5"
      >
        <span className="max-w-[85%] rounded-lg rounded-br-sm bg-primary/15 px-2 py-1 text-[9px] text-foreground">
          Yes! 9–3.
        </span>
        {/* AI chip — matches hero-phone.tsx's "AI answered" convention (Sparkles + text-primary). */}
        <span className="inline-flex items-center gap-1 pr-0.5 text-[9px] font-medium text-primary">
          <Sparkles aria-hidden="true" className="size-2.5" />
          AI answered
        </span>
      </motion.div>
    </div>
  )
}

/* ---------------------------------------------------------------------- */
/* ③ Shows what worked — a tiny thread draws from a post chip to a        */
/*    booking chip                                                        */
/* ---------------------------------------------------------------------- */

const SHOWS_WORKED_HOLDS: VignetteHolds = [700, 2300]

function ShowsWorkedVignette() {
  const reduceMotion = !!useReducedMotion()
  const [ref, active] = useVignetteActive(reduceMotion)
  const phase = usePhaseLoop(active, SHOWS_WORKED_HOLDS)
  const drawn = reduceMotion || phase === 1

  return (
    <div ref={ref} aria-hidden="true" className="relative mx-auto mt-5 h-14 w-[150px]">
      <svg viewBox="0 0 150 56" className="absolute inset-0 size-full overflow-visible">
        <motion.path
          d="M 34 28 C 70 28, 80 28, 116 28"
          className="stroke-primary"
          fill="none"
          strokeLinecap="round"
          strokeWidth={1.5}
          initial={false}
          animate={{ pathLength: drawn ? 1 : 0, opacity: drawn ? 1 : 0 }}
          transition={{ duration: duration.slow, ease: easing.out }}
        />
      </svg>
      <span className="absolute top-1/2 left-0 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-flame shadow-soft">
        <ImagePlus aria-hidden="true" className="size-3.5" />
      </span>
      <motion.span
        initial={false}
        animate={{ scale: drawn ? 1 : 0.85, opacity: drawn ? 1 : 0.5 }}
        transition={springGentle}
        className="absolute top-1/2 right-0 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border border-success/30 bg-success/10 text-success shadow-soft"
      >
        <CalendarCheck2 aria-hidden="true" className="size-3.5" />
      </motion.span>
    </div>
  )
}
