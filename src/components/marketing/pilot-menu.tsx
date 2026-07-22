// Section 14 · THE PILOT MENU (early access) — landing-copy.md §14,
// brand-redesign-plan.md §5.11. A hand-painted menu-board card: dark
// chalkboard tone (stays dark deliberately — it's a contained physical
// prop, on-theme, not a full-bleed dusk band), softened for the light-first
// flip — smaller, centered on the light paper band, dashed hand-drawn
// border via asymmetric border-radius, copy verbatim, working form
// (pilot-menu-form.tsx) with light inputs.

import { ScrollReveal } from "./scroll-reveal"
import { PilotMenuForm } from "./pilot-menu-form"

export function PilotMenu() {
  return (
    <section id="pilot-menu" data-scene="pilot-menu" className="bg-background py-20 sm:py-28">
      <div className="mx-auto max-w-xl px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">The pilot menu.</h2>
        </ScrollReveal>

        <ScrollReveal delay={0.05} className="mt-10">
          <div
            className="mx-auto max-w-md border-2 border-dashed border-chalkboard-foreground/25 bg-chalkboard p-6 shadow-raised sm:p-8"
            style={{ borderRadius: "180px 14px 160px 14px / 14px 160px 14px 180px" }}
          >
            <p className="text-center font-serif text-base text-chalkboard-foreground italic">
              Everything on the house — while we cook.
            </p>
            <p className="mt-2 text-center text-xl font-bold text-chalkboard-foreground">
              Free. No card. No contract.
            </p>
            <p className="mt-2 text-center text-sm text-chalkboard-foreground/70">
              Limited seats per city, so every shop gets real attention.
            </p>

            <div className="mx-auto mt-7 max-w-sm rounded-2xl bg-background p-6 shadow-raised">
              <PilotMenuForm />
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  )
}
