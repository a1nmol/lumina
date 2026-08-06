"use client"

import Link from "next/link"
import { motion, useReducedMotion } from "framer-motion"

import { Button } from "@/components/ui/button"
import { duration, easing } from "@/lib/motion"

const STEPS = [
  "You share a post — I help you make it in the Studio.",
  "Someone sees it and writes in — I answer and remember who they are.",
  "I connect the two, so you know exactly which post brought them in.",
] as const

/**
 * Decorative station-to-station diagram: post card → speech bubble (AI
 * reply) → calendar-check (booked outcome), joined by two bezier threads
 * that draw in sequence — thread 1 first, thread 2 a `duration.slow` beat
 * later — mirroring loop-pair.tsx's `ConnectorThread` idiom (chart-1 stroke,
 * non-scaling-stroke, round caps). Purely illustrative; the steps below
 * carry the actual meaning, so this whole SVG is `aria-hidden`.
 */
function LoopDiagram() {
  const reduceMotion = useReducedMotion()

  const station = (delay: number) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 6 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: duration.base, ease: easing.out, delay },
        }

  const thread = (delay: number) => ({
    initial: { pathLength: reduceMotion ? 1 : 0 },
    animate: { pathLength: 1 },
    transition: { duration: duration.slow, ease: easing.out, delay: reduceMotion ? 0 : delay },
  })

  return (
    <svg
      viewBox="0 0 520 120"
      aria-hidden="true"
      className="w-full max-w-xl text-muted-foreground"
    >
      {/* Thread 1: post → speech bubble */}
      <motion.path
        d="M92,60 C140,30 168,90 208,60"
        fill="none"
        stroke="var(--chart-1)"
        strokeWidth={1.5}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        className="opacity-50"
        {...thread(0.1)}
      />

      {/* Thread 2: speech bubble → calendar-check, delayed a beat behind thread 1 */}
      <motion.path
        d="M312,60 C352,30 380,90 428,60"
        fill="none"
        stroke="var(--chart-1)"
        strokeWidth={1.5}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        className="opacity-50"
        {...thread(0.1 + duration.slow)}
      />

      {/* Station 1: post card */}
      <motion.g {...station(0)}>
        <rect
          x={26}
          y={33}
          width={44}
          height={54}
          rx={6}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={1.5}
        />
        <rect
          x={32}
          y={39}
          width={32}
          height={22}
          rx={3}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={1.5}
        />
        <line x1={32} y1={68} x2={58} y2={68} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
        <line x1={32} y1={75} x2={50} y2={75} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      </motion.g>

      {/* Station 2: speech bubble with a small spark (AI answering) */}
      <motion.g {...station(duration.slow * 0.6)}>
        <path
          d="M232,38 h56 a8,8 0 0 1 8,8 v20 a8,8 0 0 1 -8,8 h-30 l-10,10 v-10 h-16 a8,8 0 0 1 -8,-8 v-20 a8,8 0 0 1 8,-8 z"
          fill="none"
          stroke="var(--color-lamplight)"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        <path
          d="M260,52 l2.5,6 6,2.5 -6,2.5 -2.5,6 -2.5,-6 -6,-2.5 6,-2.5 z"
          fill="none"
          stroke="var(--color-lamplight)"
          strokeWidth={1.3}
          strokeLinejoin="round"
        />
      </motion.g>

      {/* Station 3: calendar-check */}
      <motion.g {...station(duration.slow * 1.2)}>
        <rect
          x={432}
          y={33}
          width={54}
          height={54}
          rx={6}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={1.5}
        />
        <line x1={432} y1={49} x2={486} y2={49} stroke="var(--color-border)" strokeWidth={1.5} />
        <line x1={444} y1={27} x2={444} y2={39} stroke="var(--color-border)" strokeWidth={1.5} strokeLinecap="round" />
        <line x1={474} y1={27} x2={474} y2={39} stroke="var(--color-border)" strokeWidth={1.5} strokeLinecap="round" />
        <path
          d="M448,63 l9,9 17,-19"
          fill="none"
          stroke="var(--color-lamplight)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </motion.g>
    </svg>
  )
}

/**
 * Companion C5B — the Loop's empty-state replacement. The Loop is Lumina's
 * signature differentiator (no other tool joins content to the leads it
 * produced), so an empty Loop tab teaches the mechanic instead of showing a
 * generic "nothing here yet" — same stage-panel language as the populated
 * `LoopFeed` so the transition from explainer to real data feels seamless.
 */
export function LoopExplainer() {
  return (
    <div className="flex flex-col items-center gap-8 rounded-3xl bg-card/40 p-6 text-center ring-1 ring-border/30 sm:p-10">
      <div className="flex max-w-2xl flex-col gap-2">
        <h3 className="font-heading text-2xl leading-tight font-normal text-foreground">
          Nothing to connect yet — here&apos;s how the Loop works.
        </h3>
        <p className="text-sm text-muted-foreground">
          This is the page no other tool has: your posts on one side, the real people they
          brought in on the other.
        </p>
      </div>

      <LoopDiagram />

      <ol className="flex w-full max-w-2xl flex-col gap-4 text-left sm:flex-row sm:gap-6">
        {STEPS.map((step, index) => (
          <li key={step} className="flex flex-1 items-start gap-3">
            <span
              aria-hidden="true"
              className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium text-muted-foreground"
            >
              {index + 1}
            </span>
            <p className="text-sm text-muted-foreground">{step}</p>
          </li>
        ))}
      </ol>

      <Button render={<Link href="/studio" />}>Create a post</Button>
    </div>
  )
}
