"use client"

// Section 10 · THE INSIGHT CARD — landing-copy.md §10, brand-redesign-plan.md
// §5.7, next-wave-worklist.md §D. Previously a beam-chain diagram (three
// nodes joined by two animated beams) illustrating the loop mechanism.
// Replaced per owner-approved research: "show the literal thing the product
// produces, not the mechanism" — a shop owner instantly understands a phone
// notification; nobody parses a diagram. So this section is now ONE
// realistic product artifact: the insight notification card a shop owner
// would actually see from Lumina, with a single ghost card peeking behind
// it (reads as "one of many insights", not a one-off screenshot).
//
// Reveal DNA is mirrored from night-ticker.tsx's signature moment: a
// one-time scripted walkthrough (useInView, once per visit) that lands the
// artifact in stages, plus a two-phase "typing dots → resolved text" body
// reveal borrowed from the same chat-UI convention. Unlike night-ticker this
// plays once and totally rests (~1.3s, well under the >5s WCAG 2.2.2
// threshold for auto-updating content), so no pause control is needed here.
// Fully gated behind `useReducedMotion`, threaded into every framer
// transition as `{ duration: 0 }` (matches the fixes just made to this
// file's old Beam/ChainNode — framer bypasses the global CSS
// reduced-motion override, so the gate has to be explicit).

import { useEffect, useRef, useState } from "react"
import { motion, useInView, useReducedMotion } from "framer-motion"
import { ArrowRight, Sparkles } from "lucide-react"

import { duration, easing, spring } from "@/lib/motion"

import { ScrollReveal } from "./scroll-reveal"
import { Wordmark } from "./wordmark"

/** Scripted reveal timing (ms), mirroring night-ticker's stage-by-stage
 *  landing: ghost card fades in immediately, the main card springs up after
 *  CARD_DELAY, the body sentence starts its typing-dots state BODY_DELAY
 *  after that, holds TYPING_MS, then resolves to text — the footer chip
 *  pops CHIP_DELAY after the sentence resolves. Totals ~1.3s. */
const CARD_DELAY = 250
const BODY_DELAY = 350
const TYPING_MS = 500
const CHIP_DELAY = 200

/** Reveal stages: idle → ghost (fades in) → card (springs up) → typing
 *  (pulsing dots) → text (sentence resolved) → chip (footer pops). */
type Phase = "idle" | "ghost" | "card" | "typing" | "text" | "chip"

const SR_SUMMARY =
  "A Lumina insight notification: your Tuesday cake post brought in three customers this week — two calls and one DM — with a button to make more posts like it."

export function LoopBoard() {
  return (
    <section id="loop-board" data-scene="loop-board" className="bg-background py-14 sm:py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            See which post brought them in.
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Other tools show likes. Lumina shows you the Tuesday post that filled Saturday&apos;s calendar — in
            plain English, on your phone.
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.08} className="mt-10 sm:mt-12">
          <InsightArtifact />
        </ScrollReveal>
      </div>
    </section>
  )
}

function InsightArtifact() {
  const reduceMotion = useReducedMotion()
  const [phase, setPhase] = useState<Phase>("idle")

  const cardRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(cardRef, { once: true, amount: 0.5 })
  const started = useRef(false)

  // Reduced-motion (or not-yet-resolved-to-false) visitors land straight on
  // the finished state — no autoplay timers. See the file-top note.
  useEffect(() => {
    if (!reduceMotion) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhase("chip")
  }, [reduceMotion])

  // The one-time scripted reveal.
  useEffect(() => {
    if (reduceMotion || !isInView || started.current) return
    started.current = true

    setPhase("ghost")
    const timers: ReturnType<typeof setTimeout>[] = []
    timers.push(setTimeout(() => setPhase("card"), CARD_DELAY))
    timers.push(setTimeout(() => setPhase("typing"), CARD_DELAY + BODY_DELAY))
    timers.push(setTimeout(() => setPhase("text"), CARD_DELAY + BODY_DELAY + TYPING_MS))
    timers.push(setTimeout(() => setPhase("chip"), CARD_DELAY + BODY_DELAY + TYPING_MS + CHIP_DELAY))

    return () => timers.forEach(clearTimeout)
  }, [reduceMotion, isInView])

  const ghostShown = phase !== "idle"
  const cardShown = phase !== "idle" && phase !== "ghost"
  const chipShown = phase === "chip"

  return (
    <>
      <p className="sr-only">{SR_SUMMARY}</p>

      <div ref={cardRef} aria-hidden="true" className="relative mx-auto max-w-md">
        {/* Ghost card — a second insight peeking behind, so the artifact
            reads as "one of many" rather than a one-off screenshot. */}
        <motion.div
          aria-hidden="true"
          initial={false}
          animate={{ opacity: ghostShown ? 0.6 : 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: duration.base, ease: easing.out }}
          className="absolute inset-0 -z-10 translate-x-3 translate-y-3 rotate-2 rounded-2xl border border-border bg-card/60 p-4"
        >
          <div className="h-2 w-2/3 rounded bg-muted" />
          <div className="mt-2.5 h-2 w-1/2 rounded bg-muted" />
        </motion.div>

        <motion.div
          initial={false}
          animate={{ opacity: cardShown ? 1 : 0, y: cardShown ? 0 : 16, scale: cardShown ? 1 : 0.97 }}
          transition={reduceMotion ? { duration: 0 } : spring}
          className="-rotate-2 rounded-2xl border border-border bg-card p-4 shadow-raised ring-1 ring-amber-glow/15"
        >
          <div className="flex items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Sparkles aria-hidden="true" className="size-3.5" />
            </span>
            <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <Wordmark className="text-sm" />
              <span className="text-muted-foreground">&middot; Insight</span>
            </span>
            <span className="ml-auto font-mono text-[11px] tracking-wide text-muted-foreground">TUE &middot; 9:14 PM</span>
          </div>

          <InsightBody phase={phase} reduceMotion={!!reduceMotion} />

          <div className="mt-3">
            <motion.span
              initial={false}
              animate={{ opacity: chipShown ? 1 : 0, y: chipShown ? 0 : 6, scale: chipShown ? 1 : 0.92 }}
              transition={reduceMotion ? { duration: 0 } : spring}
              className="inline-flex items-center gap-1.5 rounded-full bg-flame px-3 py-1 text-xs font-medium text-flame-foreground"
            >
              Make more like this
              <ArrowRight aria-hidden="true" className="size-3" />
            </motion.span>
          </div>
        </motion.div>
      </div>
    </>
  )
}

const TYPING_DOTS = [0, 1, 2] as const

function InsightBody({ phase, reduceMotion }: { phase: Phase; reduceMotion: boolean }) {
  if (phase === "typing") {
    return (
      <div className="mt-3 flex h-5 items-center gap-1">
        {TYPING_DOTS.map((dot) => (
          <motion.span
            key={dot}
            className="size-1 rounded-full bg-muted-foreground/60"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut", delay: dot * 0.15 }}
          />
        ))}
      </div>
    )
  }

  if (phase === "text" || phase === "chip") {
    return (
      <motion.p
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduceMotion ? { duration: 0 } : { duration: duration.base, ease: easing.out }}
        className="mt-3 text-sm leading-relaxed text-foreground"
      >
        Your Tuesday cake post brought in <strong className="font-semibold">3 customers</strong> this week — 2
        calls, 1 DM.
      </motion.p>
    )
  }

  // idle / ghost / card — reserve the row's height so nothing shifts once
  // the typing dots (and then the sentence) land.
  return <div aria-hidden="true" className="mt-3 h-5" />
}
