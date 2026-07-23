"use client"

// Section 16 · FINAL CTA — "Lights on?" — landing-copy.md §16,
// brand-redesign-plan.md §5.13; street illustration per
// docs/design-briefs/street-spec.md (Track E). Light section
// (owner-approved light-first flip): the device is a framed "night window"
// card (`.dusk-section` scoped to the card only) holding the neon H2 above
// the full illustrated main-street row — every shop but the glowing café
// missing something — sitting above the light-background CTA copy + flame
// button. The street IS the visual argument now; no separate abstract
// vignette. No full-bleed dark band.

import { ArrowRight } from "lucide-react"

import { Button } from "@/components/ui/button"

import { ScrollReveal } from "./scroll-reveal"
import { StreetSilhouette } from "./street-silhouette"

export function FinalCta() {
  return (
    <section id="final-cta" data-scene="final-cta" className="relative overflow-hidden bg-background py-24 sm:py-32">
      <div className="relative z-10 mx-auto max-w-xl px-4 text-center sm:px-6 lg:px-8">
        <ScrollReveal className="mx-auto max-w-md sm:max-w-lg">
          <div className="dusk-section overflow-hidden rounded-3xl border border-amber-glow/20 bg-card shadow-overlay">
            <div className="px-6 pt-8 pb-1 sm:px-8 sm:pt-10">
              <h2
                className="text-3xl font-semibold tracking-tight text-amber-glow sm:text-4xl"
                style={{ filter: "drop-shadow(0 0 16px var(--amber-glow))" }}
              >
                Your lights, always on.
              </h2>
            </div>
            <div className="mt-6">
              <StreetSilhouette variant="main-street" className="px-2 pb-1 sm:px-4" />
            </div>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={0.05} className="mt-8">
          <p className="text-lg text-muted-foreground">
            Join the pilot — be the shop that never misses a customer.
          </p>
        </ScrollReveal>
        <ScrollReveal delay={0.1} className="mt-8 flex flex-col items-center gap-2">
          {/* No inline Wick here — the WickGuide (the single continuous tour
              host) arrives at this section himself; two Wicks on screen would
              break the one-character illusion. */}
          <Button size="lg" variant="flame" className="h-11 px-6 text-base" render={<a href="#pilot-menu" />}>
            Get early access
            <ArrowRight aria-hidden="true" data-icon="inline-end" />
          </Button>
        </ScrollReveal>
      </div>
    </section>
  )
}
