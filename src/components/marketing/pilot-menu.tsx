// Section 14 · THE PILOT MENU (early access) — landing-copy.md §14,
// brand-redesign-plan.md §5.11. A hand-painted menu-board card: dark
// chalkboard tone, dashed hand-drawn border via asymmetric border-radius,
// copy verbatim, working form (pilot-menu-form.tsx).

import { ScrollReveal } from "./scroll-reveal"
import { PilotMenuForm } from "./pilot-menu-form"

export function PilotMenu() {
  return (
    <section id="pilot-menu" data-scene="pilot-menu" className="bg-background py-20 sm:py-28">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">The pilot menu.</h2>
        </ScrollReveal>

        <ScrollReveal delay={0.05} className="mt-10">
          <div
            className="border-[3px] border-dashed border-chalkboard-foreground/30 bg-chalkboard p-7 shadow-overlay sm:p-10"
            style={{ borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px" }}
          >
            <p className="text-center font-serif text-lg text-chalkboard-foreground italic">
              Everything on the house — while we cook.
            </p>
            <p className="mt-2 text-center text-2xl font-bold text-chalkboard-foreground">
              Free. No card. No contract.
            </p>
            <p className="mt-2 text-center text-sm text-chalkboard-foreground/70">
              Limited seats per city, so every shop gets real attention.
            </p>

            <div className="mx-auto mt-8 max-w-sm rounded-2xl bg-background/95 p-6 shadow-raised">
              <PilotMenuForm />
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  )
}
