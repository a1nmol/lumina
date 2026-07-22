// Section 13 · SHOP WINDOWS (testimonials) — landing-copy.md §13,
// brand-redesign-plan.md §5.10. Dusk band; 3 "shop window" cards with an
// amber-lit border glow, honestly placeholder ("Your bakery?" etc.) until
// real pilot numbers exist.

import { Store } from "lucide-react"

import { ScrollReveal } from "./scroll-reveal"

const WINDOWS = ["Your bakery?", "Your salon?", "Your shop?"]

export function ShopWindows() {
  return (
    <section id="shop-windows" data-scene="shop-windows" className="dusk-section bg-background py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Lights on across town.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
            Pilot results land here — we only publish real numbers from real shops.
          </p>
        </ScrollReveal>

        <div className="mt-14 grid gap-6 sm:grid-cols-3">
          {WINDOWS.map((label, index) => (
            <ScrollReveal key={label} delay={index * 0.08}>
              <div
                className="flex aspect-[4/5] flex-col items-center justify-center gap-3 rounded-t-[3rem] rounded-b-2xl border border-amber-glow/25 bg-card/60 p-6 text-center"
                style={{
                  boxShadow:
                    "0 0 0 1px color-mix(in oklch, var(--amber-glow) 8%, transparent), 0 0 28px color-mix(in oklch, var(--amber-glow) 12%, transparent)",
                }}
              >
                <Store aria-hidden="true" className="size-6 text-amber-glow/70" />
                <p className="text-sm font-medium text-muted-foreground">{label}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  )
}
