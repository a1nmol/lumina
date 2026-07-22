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

import { useState } from "react"
import { motion } from "framer-motion"
import { CalendarCheck2, MessageCircle, Phone, type LucideIcon } from "lucide-react"

import { spring } from "@/lib/motion"
import { cn } from "@/lib/utils"

import { ScrollReveal } from "./scroll-reveal"

interface Post {
  id: string
  top: string
  caption: string
  meta: string
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
    caption: "Custom birthday cakes — book 48h ahead 🎂",
    meta: "Tue · Instagram",
    strings: [0, 1],
    customers: [0, 1],
  },
  {
    id: "post-catering",
    top: "58%",
    caption: "Weekend catering trays, made fresh 🧺",
    meta: "Thu · Facebook",
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

export function LoopBoard() {
  const [activePost, setActivePost] = useState<number | null>(null)

  return (
    <section id="loop-board" data-scene="loop-board" className="bg-background py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            The first tool that shows which post rang the till.
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Other tools show likes. LocalOS shows the birthday cake your Tuesday post sold. Hover a post — the
            strings light up to the customers it brought in.
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.1} className="mt-14">
          <div
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
                      opacity: isDimmed ? 0.2 : isActive ? 0.85 : 0.4,
                      strokeWidth: isActive ? 2.5 : 1.5,
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
                return <CustomerChip key={customer.id} customer={customer} isLifted={isLifted} />
              })}
            </div>
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
      animate={{ scale: isActive ? 1.03 : 1, rotate: isActive ? 0 : -2 }}
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

function CustomerChip({ customer, isLifted }: { customer: Customer; isLifted: boolean }) {
  return (
    <motion.div
      id={customer.id}
      initial={false}
      animate={{ y: isLifted ? -2 : 0 }}
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
