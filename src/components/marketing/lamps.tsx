// Section 4 · HOW IT WORKS — three streetlamps (landing-copy.md §4). Plain-
// English pillars, no AI jargon. Each pillar is a streetlamp SVG — ink
// line-art strokes for the post/head (light-register restyle), amber glow
// ellipse stays filled; as the column scrolls into view the lamp "flicks
// on" (glow flicker-springs to full) and the copy fades up right after,
// staggered column to column.

"use client"

import { motion, useReducedMotion } from "framer-motion"
import { CalendarCheck2, MessageCircleHeart, Sparkles, type LucideIcon } from "lucide-react"

import { duration, easing } from "@/lib/motion"

import { ScrollReveal } from "./scroll-reveal"

/** Delay added per column so lamps light left-to-right even when they enter view together. */
const COLUMN_STAGGER = 0.15
/** Extra delay after a lamp's flicker starts before its copy fades up ("right after"). */
const COPY_DELAY_AFTER_LAMP = 0.15
/** Flicker duration: two quick under/over-shoots before settling fully lit. */
const FLICKER_DURATION = 0.9
const FLICKER_OPACITY = [0, 0.4, 0.15, 1]
const FLICKER_TIMES = [0, 0.3, 0.55, 1]

const PILLARS: { title: string; body: string; icon: LucideIcon }[] = [
  {
    title: "Gets you seen",
    body: "Every week LocalOS drafts posts that sound like you. You approve with one tap.",
    icon: Sparkles,
  },
  {
    title: "Never misses a customer",
    body: "Chats, texts, DMs — answered in seconds, day or night, from your real hours, menu, and prices.",
    icon: MessageCircleHeart,
  },
  {
    title: "Shows what worked",
    body: "See which post brought which customers, down to the booking.",
    icon: CalendarCheck2,
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
  pillar: { title: string; body: string; icon: LucideIcon }
  index: number
}) {
  const reduceMotion = useReducedMotion()

  if (reduceMotion) {
    return (
      <div className="flex flex-col items-center text-center">
        <StreetLampStatic icon={pillar.icon} />
        <h3 className="mt-5 text-lg font-semibold text-foreground">{pillar.title}</h3>
        <p className="mt-2 max-w-[22ch] text-sm text-muted-foreground">{pillar.body}</p>
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
