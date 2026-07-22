// Section 13 · SHOP WINDOWS (testimonials) — landing-copy.md §13,
// brand-redesign-plan.md §5.10. Light section (Owner-approved light-first
// flip): each testimonial is a small, CONTAINED "window at dusk" vignette —
// `.dusk-section` scopes only the card itself, never the section — floating
// on the paper background with generous whitespace. The light/dark contrast
// between the paper page and each lit window card IS the story now.
// Honestly placeholder ("Your bakery?" etc.) until real pilot numbers exist.

import { Store } from "lucide-react"

import { ScrollReveal } from "./scroll-reveal"

const WINDOWS = ["Your bakery?", "Your salon?", "Your shop?"]

export function ShopWindows() {
  return (
    <section id="shop-windows" data-scene="shop-windows" className="bg-background py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Lights on across town.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
            Pilot results land here — we only publish real numbers from real shops.
          </p>
        </ScrollReveal>

        <div className="mt-16 grid gap-8 sm:grid-cols-3 sm:gap-6">
          {WINDOWS.map((label, index) => (
            <ScrollReveal key={label} delay={index * 0.08} className="flex justify-center">
              <div
                className="dusk-section flex aspect-[4/5] w-full max-w-[220px] flex-col items-center justify-center gap-3 rounded-t-[2.5rem] rounded-b-2xl border border-amber-glow/25 bg-card p-6 text-center"
                style={{
                  boxShadow:
                    "0 0 0 1px color-mix(in oklch, var(--amber-glow) 10%, transparent), 0 0 26px color-mix(in oklch, var(--amber-glow) 16%, transparent), var(--shadow-overlay)",
                }}
              >
                <Store aria-hidden="true" className="size-6 text-amber-glow/80" />
                <p className="text-sm font-medium text-muted-foreground">{label}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  )
}
