"use client"

// Section 16 · FINAL CTA — "Lights on?" — landing-copy.md §16,
// brand-redesign-plan.md §5.13. Light section (owner-approved light-first
// flip): the device is now one small, contained dusk vignette — a framed
// "night window" card (`.dusk-section` scoped to the card only) holding the
// neon H2 + a compact single-lit-window strip — sitting above the
// light-background CTA copy + flame button. No full-bleed dark band.

import { ArrowRight } from "lucide-react"

import { Wick } from "@/components/brand/wick"
import { Button } from "@/components/ui/button"

import { ScrollReveal } from "./scroll-reveal"
import { StreetSilhouette } from "./street-silhouette"

export function FinalCta() {
  return (
    <section id="final-cta" data-scene="final-cta" className="relative overflow-hidden bg-background py-24 sm:py-32">
      <div className="relative z-10 mx-auto max-w-xl px-4 text-center sm:px-6 lg:px-8">
        <ScrollReveal className="mx-auto max-w-sm">
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
              <StreetSilhouette variant="single" className="h-20 sm:h-24" />
            </div>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={0.05} className="mt-8">
          <p className="text-lg text-muted-foreground">
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
    </section>
  )
}
