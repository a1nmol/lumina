"use client"

// Section 3 · PROBLEM — landing-copy.md §3, upgraded to the cause→consequence
// 3-beat evening timeline (docs/design-briefs/next-wave-worklist.md Track B):
//   ① 6:02 PM        — the door card flips to CLOSED. "You lock up."
//   ② 7:41 PM/9:12 PM — the missed call + the unanswered DM (per-shop via
//                       shop-context.tsx) arrive while the door stays shut.
//   ③ NEXT MORNING    — the muted, tilted consequence card: they went
//                       elsewhere. A small amber-glow dot stands in for "the
//                       other shop's light on" — no extra copy needed.
// Then the existing 62% stat, now positioned as the generalization *after*
// the story rather than beside it. Grid of 4 cards on desktop (chronological,
// left→right), stacked on mobile. Each card reveals via ScrollReveal's own
// staggered `delay` (already reduced-motion safe); a couple of cards layer a
// small extra in-view detail on top (the door "flip", the call settling to
// "Missed", the DM settling to "No reply") — each of those is its own
// reduced-motion-gated motion element, following the same
// `if (reduceMotion) return <plain markup>` pattern the rest of this file
// (ScrollReveal, HeroPhone, etc.) already uses.
//
// Timestamp color note: the previous single "6:02 PM" TimeStamp used
// tone="flame" on the theory that flame (unlike amber-glow) clears AA on
// this light paper register. Re-verified with a linear-alpha-composited
// OKLCH contrast script: flame on --background is only 4.17:1 light /
// on --card 4.36:1 light — both *below* the 4.5:1 small-text bar (this
// component's TimeStamp renders at 12px). Amber was already rejected for
// the same reason. So the four per-beat time captions here use
// --muted-foreground instead (8.14:1 on --card light / 6.58:1 dark,
// comfortably AA) — matching the exact fix hero.tsx's eyebrow line already
// made for the same failure mode. The one time flame stays is the large
// (72px) "62%" stat below, which only needs the 3:1 large-text bar and
// clears it easily (4.17–6.55:1 across both registers).

import { MessageCircle, PhoneMissed } from "lucide-react"
import { motion, useReducedMotion } from "framer-motion"

import { duration, easing } from "@/lib/motion"

import { ScrollReveal } from "./scroll-reveal"
import { useShopExample } from "./shop-context"

export function Problem() {
  const { example } = useShopExample()

  return (
    <section id="problem" data-scene="problem" className="bg-background py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <ScrollReveal>
          <h2 className="max-w-2xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            You flipped the sign. Your customers didn&rsquo;t.
          </h2>
        </ScrollReveal>
        <ScrollReveal delay={0.05}>
          <p className="mt-4 max-w-lg text-lg text-muted-foreground">
            Every evening the calls, DMs, and &ldquo;are you open?&rdquo; messages keep coming. You can&rsquo;t
            answer at 9pm — so that customer books somewhere that does.
          </p>
        </ScrollReveal>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DoorCard delay={0} />
          <MissedCallCard delay={0.08} />
          <DmCard delay={0.16} question={example.missedQuestion} />
          <ConsequenceCard delay={0.24} />
        </div>

        <ScrollReveal delay={0.45} className="mt-14 border-t border-border pt-10">
          <p className="font-mono text-6xl font-bold tabular-nums text-flame sm:text-7xl">62%</p>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            of calls to small businesses ring out unanswered.
            <sup>&dagger;</sup>
          </p>
          {/* Full-strength muted-foreground, not /70 — the opacity dip
              fails 4.5:1 even with the darkened token (3.67:1); see
              the readability-audit build report. */}
          <p className="mt-1 text-xs text-muted-foreground">
            &dagger; industry studies; verify/replace with pilot data before GA
          </p>
        </ScrollReveal>
      </div>
    </section>
  )
}

/** Shared beat-card shell — one visual family across all four cards. */
const CARD_SHELL = "flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft"

/** Small mono/uppercase time caption — see the file-top note on why this is
 * plain --muted-foreground rather than the flame/amber TimeStamp component
 * at this size. */
function TimeCaption({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] font-medium tracking-[0.15em] text-muted-foreground uppercase">
      {children}
    </span>
  )
}

/** ① 6:02 PM — the sign flips to CLOSED. */
function DoorCard({ delay }: { delay: number }) {
  const reduceMotion = useReducedMotion()

  const plate = (
    <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 rounded-xl border border-foreground/15 bg-awning">
      {/* Full-opacity ink text on --awning — the "closed" idea reads
          through shape + label alone, no semantic color spent (established
          pattern, ~5.7:1+ comfortably AA). */}
      <span className="text-xs font-bold tracking-[0.25em] text-foreground uppercase">Closed</span>
    </div>
  )

  return (
    <ScrollReveal delay={delay} className={CARD_SHELL}>
      <TimeCaption>6:02 PM</TimeCaption>
      {reduceMotion ? (
        plate
      ) : (
        <motion.div
          initial={{ rotateX: -68, opacity: 0 }}
          whileInView={{ rotateX: 0, opacity: 1 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: duration.slow, ease: easing.out, delay: delay + 0.15 }}
          style={{ transformPerspective: 480, transformOrigin: "top center" }}
        >
          {plate}
        </motion.div>
      )}
      <p className="text-sm font-medium text-foreground">You lock up.</p>
    </ScrollReveal>
  )
}

/** ② 7:41 PM — the missed call, icon ringing down to a settled "Missed". */
function MissedCallCard({ delay }: { delay: number }) {
  const reduceMotion = useReducedMotion()

  return (
    <ScrollReveal delay={delay} className={CARD_SHELL}>
      <TimeCaption>7:41 PM</TimeCaption>
      <div className="flex items-center gap-3">
        <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-warning/15 ring-1 ring-warning/25">
          {!reduceMotion && (
            <motion.span
              aria-hidden="true"
              initial={{ opacity: 0.5, scale: 0.7 }}
              whileInView={{ opacity: 0, scale: 1.7 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.85, ease: easing.out, delay: delay + 0.1 }}
              className="absolute inset-0 rounded-full border-2 border-warning/40"
            />
          )}
          <PhoneMissed aria-hidden="true" className="size-4 text-warning" />
        </span>
        <div className="min-w-0">
          <p className="text-sm text-foreground">(555) 812-4076</p>
          {reduceMotion ? (
            <p className="text-xs font-semibold text-foreground">Missed</p>
          ) : (
            <motion.p
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: duration.base, ease: easing.out, delay: delay + 0.5 }}
              className="text-xs font-semibold text-foreground"
            >
              Missed
            </motion.p>
          )}
        </div>
      </div>
    </ScrollReveal>
  )
}

/** ② 9:12 PM — the DM that fades to "No reply". Question swaps per the
 * "Pick your shop" tab (shop-context.tsx), same as before. */
function DmCard({ delay, question }: { delay: number; question: string }) {
  const reduceMotion = useReducedMotion()

  return (
    <ScrollReveal delay={delay} className={CARD_SHELL}>
      <TimeCaption>9:12 PM</TimeCaption>
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-warning/15 ring-1 ring-warning/25">
          <MessageCircle aria-hidden="true" className="size-4 text-warning" />
        </span>
        <div className="min-w-0">
          <p className="line-clamp-2 text-sm text-foreground">{question}</p>
          {reduceMotion ? (
            <p className="mt-1 text-xs text-muted-foreground italic">No reply</p>
          ) : (
            <motion.p
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: duration.base, ease: easing.out, delay: delay + 0.5 }}
              className="mt-1 text-xs text-muted-foreground italic"
            >
              No reply
            </motion.p>
          )}
        </div>
      </div>
    </ScrollReveal>
  )
}

/** ③ NEXT MORNING — the consequence: muted, gently tilted, quieter than the
 * rest. The rotate is a static presentational detail (not an animation), so
 * it's unconditional the same way the old ClosedSign's tilt always was — no
 * reduced-motion branch needed for it. The amber-glow dot ("the other
 * shop's light on") is purely decorative, carries no text meaning, and its
 * .glow-pulse keyframe is already neutralized globally under
 * prefers-reduced-motion (see globals.css). */
function ConsequenceCard({ delay }: { delay: number }) {
  return (
    <ScrollReveal
      delay={delay}
      className={`${CARD_SHELL} relative -rotate-2 border-border/70 bg-muted`}
    >
      <span
        aria-hidden="true"
        className="glow-pulse absolute top-4 right-4 size-2 rounded-full bg-amber-glow shadow-[0_0_8px_var(--amber-glow)]"
      />
      <TimeCaption>Next morning</TimeCaption>
      <p className="text-sm font-medium text-muted-foreground">They booked with the bakery across town.</p>
    </ScrollReveal>
  )
}
