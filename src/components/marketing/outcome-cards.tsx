"use client"

// Section 11 · FEATURES BY OUTCOME — landing-copy.md §11, brand-redesign-
// plan.md §5.8/§5.11 ("awning cards"). Next Wave Track C (docs/design-
// briefs/next-wave-worklist.md) rebuilds these as **lit shop-window
// displays**: each card's header stays a plain awning strip, but the body
// now frames a small glass "window pane" that's dim/muted by default and
// washes warm amber (`.shop-window-pane`, globals.css) with an interior
// micro-scene when the card is hovered, focused, or tapped — booked =
// calendar slots filling, known = tiny feed cards rising, evenings = the
// door sign flipping to CLOSED at 5:59 while messages keep getting
// answered below. The pane is a real `<button>` (keyboard + touch parity,
// mirrors loop-board.tsx's PostCard precedent) with an aria-label carrying
// the scene description — title/body copy/the example chip stay fully
// visible and readable regardless of lit state, so nothing is gated behind
// the decorative animation. Touch: first tap lights the window (no link to
// follow, so a second tap simply re-toggles); on coarse-pointer devices the
// window additionally lights itself once scrolled into view, since there's
// no hover to discover the demo otherwise.

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { CalendarCheck2, CalendarClock, Coffee, ImagePlus, Sparkles, type LucideIcon } from "lucide-react"

import { duration, easing, springGentle } from "@/lib/motion"
import { cn } from "@/lib/utils"

import { ScrollReveal } from "./scroll-reveal"
import { useShopExample } from "./shop-context"

type ShopExample = ReturnType<typeof useShopExample>["example"]

interface SceneProps {
  lit: boolean
  reduceMotion: boolean
}

interface OutcomeCard {
  title: string
  body: string
  icon: LucideIcon
  example: (exampleData: ShopExample) => string
  /** The landing-page guide's per-card hover hint — see `data-wick-hint` on
   *  the card `<article>` below and wick-guide.tsx's generic mechanism doc. */
  hint: string
  Scene: (props: SceneProps) => React.JSX.Element
  /** Accessible name for the window-pane toggle button — describes the
   *  micro-scene for screen reader users, since the scene itself renders
   *  aria-hidden (its content is illustrative, not new information — the
   *  card's title/body copy already say this in words). */
  sceneLabel: string
}

const CARDS: OutcomeCard[] = [
  {
    title: "Get booked",
    body: "A front desk that answers in 30 seconds, books straight into your calendar, and texts back every missed call.",
    icon: CalendarClock,
    example: (example) => `"${example.missedQuestion}" → ${example.bookedExample}`,
    hint: "This one fills the calendar.",
    Scene: BookedScene,
    sceneLabel: "Calendar slots filling in as bookings land",
  },
  {
    title: "Get known",
    body: "A week of posts in your voice, made in one sitting. Photos, captions, hashtags — approve and go.",
    icon: ImagePlus,
    example: (example) => example.postCaption,
    hint: "This one keeps you posted — literally.",
    Scene: KnownScene,
    sceneLabel: "New posts rising into the feed",
  },
  {
    title: "Get your evenings back",
    body: "Stop being the phone. Read the morning receipt with your coffee instead.",
    icon: Coffee,
    example: (example) => `While you slept — ${example.eveningsExample}`,
    hint: "This one sends you home by dinner.",
    Scene: EveningsScene,
    sceneLabel: "Shop sign flipping to closed while messages keep getting answered",
  },
]

export function OutcomeCards() {
  const shop = useShopExample()

  return (
    <section id="features" data-scene="outcome-cards" className="bg-background py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-6 sm:grid-cols-3">
          {CARDS.map((card, index) => (
            <ScrollReveal key={card.title} delay={index * 0.08}>
              <OutcomeWindowCard card={card} example={shop.example} />
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------------- */
/* Coarse-pointer detection — local to this file (touch behavior only)    */
/* ---------------------------------------------------------------------- */

const COARSE_POINTER_QUERY = "(pointer: coarse)"

function subscribeCoarsePointer(callback: () => void) {
  const mql = window.matchMedia(COARSE_POINTER_QUERY)
  mql.addEventListener("change", callback)
  return () => mql.removeEventListener("change", callback)
}
function getCoarsePointerSnapshot() {
  return window.matchMedia(COARSE_POINTER_QUERY).matches
}
function getCoarsePointerServerSnapshot() {
  return false
}

/** True on touch/coarse-pointer devices — mirrors src/hooks/use-mobile.ts's useSyncExternalStore pattern. */
function useCoarsePointer(): boolean {
  return useSyncExternalStore(subscribeCoarsePointer, getCoarsePointerSnapshot, getCoarsePointerServerSnapshot)
}

/* ---------------------------------------------------------------------- */
/* The card itself                                                        */
/* ---------------------------------------------------------------------- */

function OutcomeWindowCard({ card, example }: { card: OutcomeCard; example: ShopExample }) {
  const reduceMotion = !!useReducedMotion()
  const isCoarsePointer = useCoarsePointer()
  const articleRef = useRef<HTMLElement>(null)
  const [hoverLit, setHoverLit] = useState(false)
  const [tapLit, setTapLit] = useState(false)
  const [inViewLit, setInViewLit] = useState(false)

  // Mobile-only: the window lights itself as it scrolls into view — there's
  // no hover on touch, and a tap-to-preview affordance is easy to miss
  // while scrolling past three cards in a row.
  useEffect(() => {
    if (!isCoarsePointer) return
    const node = articleRef.current
    if (!node) return
    const observer = new IntersectionObserver(([entry]) => setInViewLit(entry.isIntersecting), { threshold: 0.6 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [isCoarsePointer])

  const lit = hoverLit || tapLit || inViewLit

  return (
    <article
      ref={articleRef}
      data-wick-hint={card.hint}
      className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-raised"
    >
      <div className="flex items-center gap-2.5 border-b border-border/70 bg-awning/50 px-5 py-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-flame/10 text-flame">
          <card.icon aria-hidden="true" className="size-4" />
        </span>
        <h3 className="text-base font-semibold text-foreground">{card.title}</h3>
      </div>

      {/* The shop window — hover/focus lights it on desktop, first tap lights
          it on touch (see the in-view effect above for the mobile fallback). */}
      <button
        type="button"
        aria-label={`Preview: ${card.sceneLabel}`}
        aria-pressed={lit}
        data-lit={lit}
        onMouseEnter={() => setHoverLit(true)}
        onMouseLeave={() => setHoverLit(false)}
        onFocus={() => setHoverLit(true)}
        onBlur={() => setHoverLit(false)}
        onClick={() => setTapLit((v) => !v)}
        className="shop-window-pane relative flex h-28 w-full items-center justify-center overflow-hidden border-b border-border/70 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
      >
        <span aria-hidden="true" className="contents">
          {/* Window mullions — a light cross-frame so the pane reads as glass panes, not a colored box. */}
          <span className="pointer-events-none absolute inset-3 border border-foreground/10" />
          <span className="pointer-events-none absolute inset-y-3 left-1/2 w-px -translate-x-1/2 bg-foreground/10" />
          <span className="pointer-events-none absolute inset-x-3 top-1/2 h-px -translate-y-1/2 bg-foreground/10" />
          <card.Scene lit={lit} reduceMotion={reduceMotion} />
        </span>
      </button>

      <div className="flex flex-1 flex-col gap-3 p-6">
        <p className="text-sm text-muted-foreground">{card.body}</p>
        <div className="mt-auto rounded-lg border border-dashed border-border bg-awning px-3 py-2.5">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            <example.icon aria-hidden="true" strokeWidth={1.5} className="size-3 shrink-0" />
            {example.label} example
          </p>
          <p className="mt-1 text-xs text-foreground">{card.example(example)}</p>
        </div>
      </div>
    </article>
  )
}

/* ---------------------------------------------------------------------- */
/* ① Get booked — calendar slots filling                                  */
/* ---------------------------------------------------------------------- */

const BOOKED_SLOT_COUNT = 6

function BookedScene({ lit, reduceMotion }: SceneProps) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {Array.from({ length: BOOKED_SLOT_COUNT }).map((_, i) => (
        <motion.span
          key={i}
          initial={false}
          animate={{ opacity: lit ? 1 : 0.4, scale: lit ? 1 : 0.85 }}
          transition={reduceMotion ? { duration: 0 } : { ...springGentle, delay: lit ? i * 0.06 : 0 }}
          className={cn(
            "flex size-6 items-center justify-center rounded-md border",
            lit ? "border-success/40 bg-success/15 text-success" : "border-foreground/15 bg-transparent text-transparent"
          )}
        >
          <CalendarCheck2 aria-hidden="true" className="size-3" />
        </motion.span>
      ))}
    </div>
  )
}

/* ---------------------------------------------------------------------- */
/* ② Get known — tiny feed cards rising                                   */
/* ---------------------------------------------------------------------- */

const KNOWN_CARD_COUNT = 3

function KnownScene({ lit, reduceMotion }: SceneProps) {
  return (
    <div className="flex items-end gap-1.5">
      {Array.from({ length: KNOWN_CARD_COUNT }).map((_, i) => (
        <motion.span
          key={i}
          initial={false}
          animate={{ y: lit ? 0 : 12, opacity: lit ? 1 : 0.3 }}
          transition={reduceMotion ? { duration: 0 } : { ...springGentle, delay: lit ? i * 0.08 : 0 }}
          className="h-9 w-6 rounded-sm bg-gradient-to-br from-primary/30 via-[var(--chart-3)]/25 to-[var(--chart-4)]/20"
        />
      ))}
    </div>
  )
}

/* ---------------------------------------------------------------------- */
/* ③ Get your evenings back — door sign flips to CLOSED at 5:59 while     */
/*    messages keep getting answered below                                */
/* ---------------------------------------------------------------------- */

function EveningsScene({ lit, reduceMotion }: SceneProps) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      {/* Flip sign — reuses faq-signs.tsx's rotateX flip-card technique
          (plain CSS transition, auto-neutralized under reduced motion by
          the global `prefers-reduced-motion` override in globals.css, so no
          manual reduceMotion branch is needed here). */}
      <span aria-hidden="true" className="relative inline-block h-4 w-10 shrink-0 [perspective:400px]">
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center rounded-sm border border-foreground/25 bg-success/10 text-[8px] font-bold tracking-wide text-success uppercase transition-transform duration-slow [backface-visibility:hidden]",
            lit && "[transform:rotateX(180deg)]"
          )}
        >
          Open
        </span>
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center rounded-sm border border-foreground/25 bg-destructive/10 text-[8px] font-bold tracking-wide text-destructive uppercase transition-transform duration-slow [backface-visibility:hidden] [transform:rotateX(180deg)]",
            lit && "[transform:rotateX(0deg)]"
          )}
        >
          Closed
        </span>
      </span>
      <span className="font-mono text-[8px] tracking-[0.15em] text-muted-foreground uppercase">5:59 PM</span>
      <motion.span
        initial={false}
        animate={{ opacity: lit ? 1 : 0.35 }}
        transition={reduceMotion ? { duration: 0 } : { duration: duration.base, ease: easing.out }}
        className="inline-flex items-center gap-1 text-[9px] font-medium text-primary"
      >
        <Sparkles aria-hidden="true" className="size-2.5" />
        Still answering
      </motion.span>
    </div>
  )
}
