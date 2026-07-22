"use client"

// Section 16 · FINAL CTA — "Lights on?" — landing-copy.md §16,
// brand-redesign-plan.md §5.13. Full dusk band: every window on the street
// dark except one (StreetSilhouette variant="single"); neon H2; flame CTA;
// Wick lands near the button.

import { ArrowRight } from "lucide-react"

import { Wick } from "@/components/brand/wick"
import { Button } from "@/components/ui/button"

import { ScrollReveal } from "./scroll-reveal"
import { StreetSilhouette } from "./street-silhouette"

export function FinalCta() {
  return (
    <section id="final-cta" data-scene="final-cta" className="dusk-section relative overflow-hidden bg-background py-24 sm:py-32">
      <div className="relative z-10 mx-auto max-w-2xl px-4 text-center sm:px-6 lg:px-8">
        <ScrollReveal>
          <h2
            className="text-4xl font-semibold tracking-tight text-amber-glow sm:text-5xl"
            style={{ filter: "drop-shadow(0 0 18px var(--amber-glow))" }}
          >
            Your lights, always on.
          </h2>
        </ScrollReveal>
        <ScrollReveal delay={0.05}>
          <p className="mt-4 text-lg text-muted-foreground">
            Join the pilot — be the shop that never misses a customer.
          </p>
        </ScrollReveal>
        <ScrollReveal delay={0.1} className="mt-8 flex flex-col items-center gap-2">
          <div className="relative inline-flex flex-col items-center">
            <Wick state="idle" size={40} className="mb-1" />
            <Button size="lg" variant="flame" className="h-11 px-6 text-base" render={<a href="#pilot-menu" />}>
              Get early access
              <ArrowRight aria-hidden="true" data-icon="inline-end" />
            </Button>
          </div>
        </ScrollReveal>
      </div>

      <div className="relative z-10 mt-16 sm:mt-20">
        <StreetSilhouette variant="single" className="h-24 sm:h-32" />
      </div>
    </section>
  )
}
