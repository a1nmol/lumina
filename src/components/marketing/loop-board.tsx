// Section 10 · THE LOOP BOARD — landing-copy.md §10, brand-redesign-plan.md
// §5.7. A corkboard-tinted card with 2 polaroid post cards + 3 customer
// chips connected by static indigo bezier "string" (40% opacity). Gate 2
// ships this static; Gate 3 adds hover-lighting on top of the same markup.

import { CalendarCheck2, MessageCircle, Phone } from "lucide-react"

import { ScrollReveal } from "./scroll-reveal"

const POSTS = [
  { top: "12%", caption: "Custom birthday cakes — book 48h ahead 🎂", meta: "Tue · Instagram" },
  { top: "58%", caption: "Weekend catering trays, made fresh 🧺", meta: "Thu · Facebook" },
]

const CUSTOMERS = [
  { top: "6%", name: "Maria G.", outcome: "Booked · Sat pickup", icon: CalendarCheck2 },
  { top: "42%", name: "Jordan P.", outcome: "Called · asked about pricing", icon: Phone },
  { top: "78%", name: "Alicia R.", outcome: "DM'd · catering inquiry", icon: MessageCircle },
]

// Percent-space bezier connectors (viewBox 0 0 100 100) — post → customer,
// hand-placed to roughly meet each card's left/right edge.
const STRINGS = [
  "M 34 18 C 55 18, 55 12, 78 11",
  "M 34 18 C 55 30, 55 46, 78 47",
  "M 34 64 C 55 64, 55 46, 78 47",
  "M 34 64 C 55 74, 55 82, 78 83",
]

export function LoopBoard() {
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
              {STRINGS.map((d) => (
                <path key={d} d={d} className="stroke-primary" strokeWidth={0.4} fill="none" opacity={0.4} />
              ))}
            </svg>

            <div className="relative flex flex-col gap-6 sm:block sm:h-full">
              {POSTS.map((post) => (
                <div
                  key={post.caption}
                  className="w-full max-w-[220px] rounded-lg border border-border bg-card p-3 shadow-raised sm:absolute sm:left-0 -rotate-2"
                  style={{ top: post.top }}
                >
                  <div className="mb-2 aspect-[4/3] w-full rounded-md bg-gradient-to-br from-primary/25 via-[var(--chart-3)]/20 to-[var(--chart-4)]/15" />
                  <p className="text-xs font-medium text-foreground">{post.caption}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{post.meta}</p>
                </div>
              ))}

              {CUSTOMERS.map((customer) => (
                <div
                  key={customer.name}
                  className="flex w-full max-w-[220px] items-center gap-2.5 rounded-full border border-border bg-card px-3 py-2 shadow-soft sm:absolute sm:right-0"
                  style={{ top: customer.top }}
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <customer.icon aria-hidden="true" className="size-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-foreground">{customer.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{customer.outcome}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  )
}
