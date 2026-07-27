"use client"

// Section 10 · THE LOOP BOARD — landing-copy.md §10, brand-redesign-plan.md
// §5.7, next-wave-worklist.md §D — compressed to the "beam chain": three
// nodes (post → phone → calendar) joined by two animated beams, landing the
// "which post rang the till" thesis in one glance instead of a corkboard +
// hover-to-discover interaction. A one-time scripted walkthrough
// (useInView, once per visit) draws each beam in turn and pops the next
// node, mirroring the previous file's timer-stack + reduced-motion-skips-
// to-landed-state pattern. Hovering/focusing the calendar node (a real
// `<button>`, keyboard-reachable) reveals a small tooltip of which
// customers it represents — pure bonus depth, not required to read the
// chain. Fully gated behind `useReducedMotion` (matches lamps.tsx /
// street-silhouette.tsx's flicker pattern): reduced-motion visitors land
// straight on the finished state (beams fully drawn, count at total, badge
// parked) with zero timers.

import { useEffect, useRef, useState } from "react"
import { motion, useInView, useReducedMotion } from "framer-motion"
import { CalendarCheck2, MessageCircle, Phone, type LucideIcon } from "lucide-react"

import { easing, spring } from "@/lib/motion"
import { cn } from "@/lib/utils"

import { ScrollReveal } from "./scroll-reveal"

interface Customer {
  id: string
  name: string
  outcome: string
  icon: LucideIcon
}

const CUSTOMERS: Customer[] = [
  { id: "cust-maria", name: "Maria G.", outcome: "Booked · Sat pickup", icon: CalendarCheck2 },
  { id: "cust-jordan", name: "Jordan P.", outcome: "Called · asked about pricing", icon: Phone },
  { id: "cust-alicia", name: "Alicia R.", outcome: "DM'd · catering inquiry", icon: MessageCircle },
]

const TOTAL_BOOKED = CUSTOMERS.length

/** Scripted walkthrough timing (ms) — beam 1 draws, the phone node pops,
 *  beam 2 draws (carrying the "+3" rider), then the calendar node pops and
 *  its count chip ticks 0 → total. Only ever runs once, and only when
 *  motion is allowed (see the intro effect below). Totals ~2.4s. */
const BEAM_DELAY = 200
const BEAM_DURATION_MS = 700
const NODE_SETTLE_DELAY = 250
const COUNT_STEP = 150

/** Chain phases: 0 idle → 1 beam 1 drawing → 2 phone popped → 3 beam 2
 *  drawing → 4 calendar popped (count-up begins). */
type Phase = 0 | 1 | 2 | 3 | 4

export function LoopBoard() {
  const reduceMotion = useReducedMotion()
  const [phase, setPhase] = useState<Phase>(0)
  const [tillCount, setTillCount] = useState(0)
  const [tooltipOpen, setTooltipOpen] = useState(false)

  const chainRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(chainRef, { once: true, amount: 0.5 })
  const walkthroughStarted = useRef(false)

  // Reduced-motion (or not-yet-resolved-to-false, which framer briefly
  // reports as `null` pre-mount) visitors skip straight to the finished
  // state — no autoplay timers. Deliberate setState-in-effect:
  // `reduceMotion` is only knowable on the client (matchMedia via framer's
  // own hook), so this is a one-time sync from that external system, not
  // state derivable from props/render.
  useEffect(() => {
    if (!reduceMotion) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhase(4)
    setTillCount(TOTAL_BOOKED)
  }, [reduceMotion])

  // The one-time scripted walkthrough.
  useEffect(() => {
    if (reduceMotion || !isInView || walkthroughStarted.current) return
    walkthroughStarted.current = true

    const timers: ReturnType<typeof setTimeout>[] = []
    const node2At = BEAM_DELAY + BEAM_DURATION_MS
    const beam2At = node2At + NODE_SETTLE_DELAY
    const node3At = beam2At + BEAM_DURATION_MS

    timers.push(setTimeout(() => setPhase(1), BEAM_DELAY))
    timers.push(setTimeout(() => setPhase(2), node2At))
    timers.push(setTimeout(() => setPhase(3), beam2At))
    timers.push(setTimeout(() => setPhase(4), node3At))
    for (let i = 1; i <= TOTAL_BOOKED; i += 1) {
      timers.push(setTimeout(() => setTillCount(i), node3At + i * COUNT_STEP))
    }

    return () => timers.forEach(clearTimeout)
  }, [reduceMotion, isInView])

  const beam1Draw = phase >= 1
  const node2Popped = phase >= 2
  const beam2Draw = phase >= 3
  const node3Popped = phase >= 4
  const ledgerVisible = phase >= 4

  return (
    <section id="loop-board" data-scene="loop-board" className="bg-background py-14 sm:py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            The first tool that shows which post rang the till.
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Other tools show likes. Lumina traces every thread back to the post that caused it — the birthday cake
            your Tuesday post sold, in one glance.
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.08} className="mt-10 sm:mt-12">
          <div ref={chainRef} className="relative mx-auto max-w-2xl">
            <span className="sr-only">
              One Tuesday post brought in two calls and a DM — three booked customers, traced back to the post that
              caused them.
            </span>

            {/* Only the purely decorative nodes/beams are aria-hidden — the
                calendar node stays in the accessibility tree since it's a
                real, keyboard-focusable button with its own label + tooltip. */}
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
              <ChainNode
                label="You post"
                decorative
                className="w-full max-w-[180px]"
              >
                <div className="w-full max-w-[160px] rounded-lg border border-border bg-card p-2.5 shadow-raised sm:-rotate-[1.5deg]">
                  <div className="aspect-[4/3] w-full rounded-md bg-gradient-to-br from-primary/25 via-[var(--chart-3)]/20 to-[var(--chart-4)]/15" />
                  <p className="mt-2 text-[11px] font-medium text-foreground">
                    Custom birthday cakes — book 48h ahead
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">Tue · Instagram</p>
                </div>
              </ChainNode>

              <Beam axis="x" className="hidden sm:flex" draw={beam1Draw} />
              <Beam axis="y" className="sm:hidden" draw={beam1Draw} />

              <ChainNode label="They call & DM" popped={node2Popped} decorative>
                <IconBadge icon={Phone} />
              </ChainNode>

              <Beam axis="x" className="hidden sm:flex" draw={beam2Draw} badge="+3" badgeLanded={node3Popped} />
              <Beam axis="y" className="sm:hidden" draw={beam2Draw} badge="+3" badgeLanded={node3Popped} />

              <ChainNode label="They book" popped={node3Popped}>
                <CalendarNode
                  popped={node3Popped}
                  tillCount={tillCount}
                  tooltipOpen={tooltipOpen}
                  onOpen={() => setTooltipOpen(true)}
                  onClose={() => setTooltipOpen(false)}
                  onToggle={() => setTooltipOpen((open) => !open)}
                />
              </ChainNode>
            </div>
          </div>

          {/* Ledger caption — a receipt-styled one-liner that lands once the
              chain finishes (or shows immediately under reduced motion). */}
          <motion.div
            initial={false}
            animate={{ opacity: ledgerVisible ? 1 : 0, y: ledgerVisible ? 0 : 6 }}
            transition={spring}
            className="mx-auto mt-8 flex max-w-md flex-wrap items-center justify-center gap-x-2 gap-y-2 border-t border-dashed border-border pt-4 font-mono text-xs text-muted-foreground"
          >
            <span className="text-foreground">Tuesday&apos;s cake post</span>
            <span aria-hidden="true">&rarr;</span>
            <span>2 calls + 1 DM</span>
            <span aria-hidden="true">&rarr;</span>
            <span>3 booked</span>
            <span className="ml-1 inline-flex -rotate-2 items-center rounded-sm border border-success/40 bg-success/10 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-success">
              = 3 customers
            </span>
          </motion.div>
        </ScrollReveal>
      </div>
    </section>
  )
}

function ChainNode({
  label,
  children,
  popped = true,
  decorative = false,
  className,
}: {
  label: string
  children: React.ReactNode
  /** False before this node's beam has arrived — plays a spring pop once true. */
  popped?: boolean
  /** True for nodes with no interactive content — kept out of the a11y tree
   *  (the sr-only summary sentence covers their meaning); the calendar node
   *  is the one real button and is never marked decorative. */
  decorative?: boolean
  className?: string
}) {
  return (
    <div aria-hidden={decorative || undefined} className={cn("flex flex-col items-center gap-2", className)}>
      <motion.div
        initial={false}
        animate={{ scale: popped ? 1 : 0.9, opacity: popped ? 1 : 0.5 }}
        transition={spring}
      >
        {children}
      </motion.div>
      <p className="text-[11px] font-medium whitespace-nowrap text-muted-foreground">{label}</p>
    </div>
  )
}

function IconBadge({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-primary shadow-soft">
      <Icon aria-hidden="true" strokeWidth={1.75} className="size-4.5" />
    </span>
  )
}

function CalendarNode({
  popped,
  tillCount,
  tooltipOpen,
  onOpen,
  onClose,
  onToggle,
}: {
  popped: boolean
  tillCount: number
  tooltipOpen: boolean
  onOpen: () => void
  onClose: () => void
  onToggle: () => void
}) {
  return (
    <div className="relative flex flex-col items-center">
      <button
        type="button"
        onMouseEnter={onOpen}
        onMouseLeave={onClose}
        onFocus={onOpen}
        onBlur={onClose}
        onClick={onToggle}
        aria-expanded={tooltipOpen}
        aria-describedby="loop-chain-tooltip"
        aria-label="They book — see who"
        className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-primary shadow-soft outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <CalendarCheck2 aria-hidden="true" strokeWidth={1.75} className="size-4.5" />
      </button>

      <motion.span
        initial={false}
        animate={{ opacity: popped ? 1 : 0, y: popped ? 0 : -4, scale: popped ? 1 : 0.9 }}
        transition={spring}
        className="absolute -top-2 -right-3 inline-flex items-center rounded-full border border-amber-glow/40 bg-card px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-foreground shadow-soft"
      >
        {tillCount} booked
      </motion.span>

      <motion.div
        id="loop-chain-tooltip"
        role="tooltip"
        initial={false}
        animate={{ opacity: tooltipOpen ? 1 : 0, y: tooltipOpen ? 0 : 4 }}
        transition={{ duration: 0.15, ease: easing.out }}
        className={cn(
          "absolute top-full left-1/2 z-10 mt-3 w-52 -translate-x-1/2 rounded-lg border border-border bg-card p-3 text-left shadow-raised",
          tooltipOpen ? "pointer-events-auto" : "pointer-events-none"
        )}
      >
        <ul className="flex flex-col gap-2">
          {CUSTOMERS.map((customer) => (
            <li key={customer.id} className="flex items-center gap-2">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <customer.icon aria-hidden="true" className="size-3" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[11px] font-medium text-foreground">{customer.name}</p>
                <p className="truncate text-[10px] text-muted-foreground">{customer.outcome}</p>
              </div>
            </li>
          ))}
        </ul>
      </motion.div>
    </div>
  )
}

function Beam({
  axis,
  draw,
  badge,
  badgeLanded,
  className,
}: {
  axis: "x" | "y"
  draw: boolean
  badge?: string
  badgeLanded?: boolean
  className?: string
}) {
  const isX = axis === "x"
  const pathD = isX ? "M0 10 L100 10" : "M10 0 L10 100"

  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative flex shrink-0 items-center justify-center",
        isX ? "h-6 min-w-10 flex-1" : "h-8 w-6",
        className
      )}
    >
      <svg
        viewBox={isX ? "0 0 100 20" : "0 0 20 100"}
        preserveAspectRatio="none"
        className="absolute inset-0 size-full"
      >
        <path d={pathD} className="stroke-border" strokeWidth={2} fill="none" strokeLinecap="round" />
        <motion.path
          d={pathD}
          stroke="var(--amber-glow)"
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          initial={false}
          animate={{ pathLength: draw ? 1 : 0 }}
          transition={{ duration: BEAM_DURATION_MS / 1000, ease: easing.out }}
        />
      </svg>

      {/* Traveling glow dot — rides the beam once per draw, then fades. */}
      <motion.span
        className={cn(
          "absolute size-1.5 rounded-full bg-amber-glow",
          isX ? "top-1/2 -translate-y-1/2" : "left-1/2 -translate-x-1/2"
        )}
        style={{ boxShadow: "0 0 6px var(--amber-glow)" }}
        initial={false}
        animate={
          draw
            ? isX
              ? { left: ["0%", "100%"], opacity: [0, 1, 1, 0] }
              : { top: ["0%", "100%"], opacity: [0, 1, 1, 0] }
            : isX
              ? { left: "0%", opacity: 0 }
              : { top: "0%", opacity: 0 }
        }
        transition={{ duration: BEAM_DURATION_MS / 1000, ease: easing.out }}
      />

      {badge ? (
        <motion.span
          className={cn(
            "absolute inline-flex items-center rounded-full border border-amber-glow/40 bg-card px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-foreground shadow-soft",
            isX ? "top-1/2 -translate-y-1/2" : "left-1/2 -translate-x-1/2"
          )}
          initial={false}
          animate={
            draw
              ? isX
                ? { left: ["0%", "100%"], opacity: [0, 1, 1, badgeLanded ? 0 : 1] }
                : { top: ["0%", "100%"], opacity: [0, 1, 1, badgeLanded ? 0 : 1] }
              : isX
                ? { left: "0%", opacity: 0 }
                : { top: "0%", opacity: 0 }
          }
          transition={{ duration: BEAM_DURATION_MS / 1000, ease: easing.out }}
        >
          {badge}
        </motion.span>
      ) : null}
    </div>
  )
}
