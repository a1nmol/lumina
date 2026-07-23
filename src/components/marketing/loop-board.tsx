"use client"

// Section 10 · THE LOOP BOARD — landing-copy.md §10, brand-redesign-plan.md
// §5.7. A corkboard-tinted card with 2 polaroid post cards + 3 customer
// chips connected by indigo bezier "string". Gate 3: hovering/focusing a
// post polaroid draws-in + brightens its strings and lifts the customer
// chips it's connected to, while the other post's strings dim — plus a
// gentle idle shimmer traveling one string every ~6s. Posts are real
// `<button>`s (keyboard + touch: focus/tap both trigger the same
// highlight) with `aria-describedby` linking each post to the customer
// chips it drove, so the "which post rang the till" relationship is
// available to assistive tech too, not just sighted hover users.
//
// Track D (next-wave-worklist.md §D) — comprehension pass, additive on top
// of the above: a 3-step legend strip ("① You post → ② They see it →
// ③ They book") makes the metaphor legible before anyone hovers anything;
// a scripted one-time "walkthrough" plays once the board scrolls into view
// (post 1 highlights → post 2 highlights → a till/receipt chip counts up
// "+3 customers"), then hands control back to the existing hover/focus
// interaction untouched. The walkthrough is pure autoplay motion, so it's
// fully gated behind `useReducedMotion` (matches lamps.tsx's flicker
// pattern) — reduced-motion visitors land straight on the finished state
// (till already at its total, chips already "landed") with zero timers.

import { useEffect, useRef, useState } from "react"
import { motion, useInView, useReducedMotion } from "framer-motion"
import { ArrowRight, CalendarCheck2, Eye, ImagePlus, MessageCircle, Phone, Receipt, type LucideIcon } from "lucide-react"

import { spring } from "@/lib/motion"
import { cn } from "@/lib/utils"

import { ScrollReveal } from "./scroll-reveal"

interface Post {
  id: string
  top: string
  caption: string
  meta: string
  /** Static idle tilt in degrees — alternates ±1.5° per polaroid, per the light-register restyle. */
  tilt: number
  /** Indices into STRINGS this post's connectors belong to. */
  strings: number[]
  /** Indices into CUSTOMERS this post is connected to. */
  customers: number[]
}

interface Customer {
  id: string
  top: string
  name: string
  outcome: string
  icon: LucideIcon
}

const POSTS: Post[] = [
  {
    id: "post-cake",
    top: "12%",
    caption: "Custom birthday cakes — book 48h ahead",
    meta: "Tue · Instagram",
    tilt: -1.5,
    strings: [0, 1],
    customers: [0, 1],
  },
  {
    id: "post-catering",
    top: "58%",
    caption: "Weekend catering trays, made fresh",
    meta: "Thu · Facebook",
    tilt: 1.5,
    strings: [2, 3],
    customers: [1, 2],
  },
]

const CUSTOMERS: Customer[] = [
  { id: "cust-maria", top: "6%", name: "Maria G.", outcome: "Booked · Sat pickup", icon: CalendarCheck2 },
  { id: "cust-jordan", top: "42%", name: "Jordan P.", outcome: "Called · asked about pricing", icon: Phone },
  { id: "cust-alicia", top: "78%", name: "Alicia R.", outcome: "DM'd · catering inquiry", icon: MessageCircle },
]

// Percent-space bezier connectors (viewBox 0 0 100 100) — post → customer,
// hand-placed to roughly meet each card's left/right edge. `post` is the
// index into POSTS that owns this string (drives highlight/dim state).
const STRINGS = [
  { d: "M 34 18 C 55 18, 55 12, 78 11", post: 0 },
  { d: "M 34 18 C 55 30, 55 46, 78 47", post: 0 },
  { d: "M 34 64 C 55 64, 55 46, 78 47", post: 1 },
  { d: "M 34 64 C 55 74, 55 82, 78 83", post: 1 },
] as const

/** Idle shimmer rides this one string (post-cake → Jordan). */
const SHIMMER_STRING_INDEX = 1

/** The self-explanatory legend strip above the board — small icons, no reading required. */
const LOOP_LEGEND: { label: string; icon: LucideIcon }[] = [
  { label: "You post", icon: ImagePlus },
  { label: "They see it", icon: Eye },
  { label: "They book", icon: CalendarCheck2 },
]

/** Scripted walkthrough timing (ms) — post 1 highlights, then post 2, then the
 *  board settles and the till chip counts up. Only ever runs once, and only
 *  when motion is allowed (see the intro effect below). */
const WALKTHROUGH_POST_DELAY = 350
const WALKTHROUGH_SECOND_POST_DELAY = 1750
const WALKTHROUGH_SETTLE_DELAY = 3150
const WALKTHROUGH_TILL_STEP = 260

export function LoopBoard() {
  const [activePost, setActivePost] = useState<number | null>(null)
  const reduceMotion = useReducedMotion()
  const totalCustomers = CUSTOMERS.length

  // Per-chip "has this customer's string arrived yet" — drives the landing
  // pop the first time a chip lights up (walkthrough OR early hover), then
  // stays true. Reduced-motion visitors start with every chip already
  // landed (see the effect below).
  const [landed, setLanded] = useState<boolean[]>(() => CUSTOMERS.map(() => false))
  // The till/receipt chip's running count, 0 → totalCustomers.
  const [tillCount, setTillCount] = useState(0)

  const boardRef = useRef<HTMLDivElement>(null)
  const isBoardInView = useInView(boardRef, { once: true, amount: 0.5 })
  const walkthroughStarted = useRef(false)

  // Reduced-motion (or not-yet-resolved-to-false, which framer briefly
  // reports as `null` pre-mount) visitors skip straight to the finished
  // state — no autoplay timers, board stays fully driven by hover/focus.
  // Deliberate setState-in-effect: `reduceMotion` is only knowable on the
  // client (matchMedia via framer's own hook), so this is a one-time sync
  // from that external system, not state derivable from props/render.
  useEffect(() => {
    if (!reduceMotion) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLanded(CUSTOMERS.map(() => true))
    setTillCount(totalCustomers)
  }, [reduceMotion, totalCustomers])

  // The one-time scripted walkthrough.
  useEffect(() => {
    if (reduceMotion || !isBoardInView || walkthroughStarted.current) return
    walkthroughStarted.current = true

    const timers: ReturnType<typeof setTimeout>[] = []
    timers.push(setTimeout(() => setActivePost(0), WALKTHROUGH_POST_DELAY))
    timers.push(setTimeout(() => setActivePost(1), WALKTHROUGH_SECOND_POST_DELAY))
    timers.push(
      setTimeout(() => {
        setActivePost(null)
        CUSTOMERS.forEach((_, index) => {
          timers.push(
            setTimeout(() => setTillCount(index + 1), index * WALKTHROUGH_TILL_STEP)
          )
        })
      }, WALKTHROUGH_SETTLE_DELAY)
    )

    return () => timers.forEach(clearTimeout)
  }, [reduceMotion, isBoardInView])

  // Whenever a post is active (walkthrough OR hover/focus), mark its
  // connected customer chips as "landed" — permanent once true. Deliberate
  // setState-in-effect: this is a one-time sync reacting to the timer-
  // driven walkthrough / user hover state changing, not a value derivable
  // during render (the chip's whole point is to remember its own history).
  useEffect(() => {
    if (activePost === null) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLanded((prev) => {
      let changed = false
      const next = [...prev]
      POSTS[activePost].customers.forEach((index) => {
        if (!next[index]) {
          next[index] = true
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [activePost])

  return (
    <section id="loop-board" data-scene="loop-board" className="bg-background py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            The first tool that shows which post rang the till.
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Other tools show likes. Lumina shows the birthday cake your Tuesday post sold. Hover a post — the
            strings light up to the customers it brought in.
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.08} className="mt-8 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-3 sm:gap-x-2.5">
          {LOOP_LEGEND.map((step, index) => (
            <div key={step.label} className="flex items-center gap-1.5 sm:gap-2.5">
              <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 shadow-soft">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                  {index + 1}
                </span>
                <step.icon aria-hidden="true" strokeWidth={1.75} className="size-3.5 text-muted-foreground" />
                <span className="text-xs font-medium whitespace-nowrap text-foreground">{step.label}</span>
              </div>
              {index < LOOP_LEGEND.length - 1 ? (
                <ArrowRight aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground/50" />
              ) : null}
            </div>
          ))}
        </ScrollReveal>

        <ScrollReveal delay={0.1} className="mt-10">
          <div
            ref={boardRef}
            className="relative mx-auto min-h-[360px] w-full max-w-3xl rounded-3xl border border-border p-6 shadow-raised sm:min-h-[400px] sm:p-10"
            style={{
              backgroundColor: "var(--awning)",
              backgroundImage:
                "radial-gradient(color-mix(in oklch, var(--foreground) 6%, transparent) 1px, transparent 1px)",
              backgroundSize: "14px 14px",
            }}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="pointer-events-none absolute inset-0 hidden size-full sm:block"
            >
              {STRINGS.map((string) => {
                const isActive = activePost === string.post
                const isDimmed = activePost !== null && !isActive
                return (
                  <motion.path
                    key={string.d}
                    d={string.d}
                    className="stroke-primary"
                    fill="none"
                    strokeLinecap="round"
                    initial={false}
                    animate={{
                      pathLength: isActive ? [0, 1] : 1,
                      // Bumped from the dusk-tuned 0.2/0.4/0.85 baseline —
                      // indigo-on-awning tops out around 2.2:1 even at full
                      // opacity (see the builder's contrast report), so this
                      // is the best achievable read while staying "indigo,
                      // not muddy ink"; the post↔customer relationship is
                      // never conveyed by color alone (caption text +
                      // aria-describedby carry it too).
                      opacity: isDimmed ? 0.3 : isActive ? 1 : 0.55,
                      strokeWidth: isActive ? 3 : 2,
                    }}
                    transition={{
                      pathLength: { duration: 0.5, ease: "easeOut" },
                      opacity: spring,
                      strokeWidth: spring,
                    }}
                  />
                )
              })}
              {/* Idle shimmer — a small light traveling one string every
                  ~6s, off entirely under prefers-reduced-motion (global
                  rule in globals.css collapses the animation to one
                  imperceptible frame). */}
              <circle r="0.9" className="fill-amber-glow shimmer-dot" style={{ offsetPath: `path("${STRINGS[SHIMMER_STRING_INDEX].d}")` }} />
            </svg>

            <div className="relative flex flex-col gap-6 sm:block sm:h-full">
              {POSTS.map((post, index) => (
                <PostCard
                  key={post.id}
                  post={post}
                  isActive={activePost === index}
                  onEnter={() => setActivePost(index)}
                  onLeave={() => setActivePost((current) => (current === index ? null : current))}
                  onToggle={() => setActivePost((current) => (current === index ? null : index))}
                />
              ))}

              {CUSTOMERS.map((customer, index) => {
                const isLifted = activePost !== null && POSTS[activePost].customers.includes(index)
                return (
                  <CustomerChip
                    key={customer.id}
                    customer={customer}
                    isLifted={isLifted}
                    hasLanded={landed[index]}
                  />
                )
              })}
            </div>
          </div>

          {/* Till/receipt chip — counts up once the walkthrough settles
              (or shows the total instantly under reduced motion). Stays at
              the total afterward; it's a summary, not a per-hover readout. */}
          <div className="mt-6 flex justify-center">
            <motion.div
              initial={false}
              animate={{ opacity: tillCount > 0 ? 1 : 0, y: tillCount > 0 ? 0 : 8 }}
              transition={spring}
              className="inline-flex items-center gap-2 rounded-full border border-dashed border-success/40 bg-success/10 px-4 py-2 shadow-soft"
            >
              <Receipt aria-hidden="true" className="size-4 shrink-0 text-success" />
              <span className="text-sm font-semibold tabular-nums text-foreground">
                +{tillCount} customer{tillCount === 1 ? "" : "s"}
              </span>
            </motion.div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  )
}

function PostCard({
  post,
  isActive,
  onEnter,
  onLeave,
  onToggle,
}: {
  post: Post
  isActive: boolean
  onEnter: () => void
  onLeave: () => void
  onToggle: () => void
}) {
  const describedBy = post.customers.map((i) => CUSTOMERS[i].id).join(" ")
  return (
    <motion.button
      type="button"
      aria-describedby={describedBy}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      onClick={onToggle}
      initial={false}
      animate={{ scale: isActive ? 1.03 : 1, rotate: isActive ? 0 : post.tilt }}
      transition={spring}
      className="w-full max-w-[220px] rounded-lg border border-border bg-card p-3 text-left shadow-raised outline-none sm:absolute sm:left-0 focus-visible:ring-3 focus-visible:ring-ring/50"
      style={{ top: post.top }}
    >
      <div className="mb-2 aspect-[4/3] w-full rounded-md bg-gradient-to-br from-primary/25 via-[var(--chart-3)]/20 to-[var(--chart-4)]/15" />
      <p className="text-xs font-medium text-foreground">{post.caption}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{post.meta}</p>
    </motion.button>
  )
}

function CustomerChip({
  customer,
  isLifted,
  hasLanded,
}: {
  customer: Customer
  isLifted: boolean
  /** True once this chip's connecting string has "arrived" at least once — plays a small landing pop, then stays true. */
  hasLanded: boolean
}) {
  return (
    <motion.div
      id={customer.id}
      initial={false}
      animate={{ y: isLifted ? -2 : 0, opacity: hasLanded ? 1 : 0.6, scale: hasLanded ? 1 : 0.96 }}
      transition={spring}
      className={cn(
        "flex w-full max-w-[220px] items-center gap-2.5 rounded-full border bg-card px-3 py-2 shadow-soft sm:absolute sm:right-0",
        isLifted ? "border-primary/30 ring-2 ring-primary/30" : "border-border"
      )}
      style={{ top: customer.top }}
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <customer.icon aria-hidden="true" className="size-3.5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-foreground">{customer.name}</p>
        <p className="truncate text-[11px] text-muted-foreground">{customer.outcome}</p>
      </div>
    </motion.div>
  )
}
