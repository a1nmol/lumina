// Section 2 · TRUST BAR — landing-copy.md §2. Paper register begins here
// (first non-dusk section). Chips with Lucide icons per vertical, plus the
// pilot framing line.

import { Coffee, Croissant, Scissors, Sparkle, Wrench, Waves } from "lucide-react"

import { ScrollReveal } from "./scroll-reveal"

const CHIPS = [
  { label: "Bakeries", icon: Croissant },
  { label: "Salons", icon: Sparkle },
  { label: "Barbers", icon: Scissors },
  { label: "Plumbers", icon: Wrench },
  { label: "Cafés", icon: Coffee },
  { label: "Cleaners", icon: Waves },
]

export function TrustBar() {
  return (
    <section
      id="trust-bar"
      aria-label="Built for main street"
      data-scene="trust-bar"
      className="border-b border-border bg-background py-10"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <ScrollReveal>
          <p className="text-center text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
            Built for main street
          </p>
        </ScrollReveal>
        {/* Shared hover hint across the whole chip row (owner direction #6)
            — one `data-wick-hint` target covering all chips + the gaps
            between them, rather than one per chip, so moving the pointer
            across the row doesn't repeatedly reset the guide's dwell timer. */}
        <ScrollReveal
          delay={0.05}
          data-wick-hint="Yes, yours counts."
          className="mt-5 flex flex-wrap items-center justify-center gap-2.5 sm:gap-3"
        >
          {CHIPS.map(({ label, icon: Icon }) => (
            <span
              key={label}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card py-1.5 pr-3.5 pl-1.5 text-sm font-medium text-foreground shadow-soft"
            >
              {/* Icon is purely decorative (the label text already carries the
                  meaning), so the reduced-opacity ink line-art treatment
                  called for in the brief is safe here without an AA
                  obligation — see the builder's contrast report. */}
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-awning">
                <Icon aria-hidden="true" strokeWidth={1.5} className="size-3.5 text-foreground/60" />
              </span>
              {label}
            </span>
          ))}
        </ScrollReveal>
        <ScrollReveal delay={0.1} className="mt-4 text-center text-sm text-muted-foreground">
          Free for invited local businesses during the pilot.
        </ScrollReveal>
      </div>
    </section>
  )
}
