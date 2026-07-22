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
        <ScrollReveal delay={0.05} className="mt-5 flex flex-wrap items-center justify-center gap-2.5 sm:gap-3">
          {CHIPS.map(({ label, icon: Icon }) => (
            <span
              key={label}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-awning px-3.5 py-1.5 text-sm font-medium text-foreground"
            >
              <Icon aria-hidden="true" className="size-3.5 text-flame" />
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
