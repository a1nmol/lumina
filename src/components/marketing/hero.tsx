"use client"

// Section 1 · HERO (dusk) — docs/design-briefs/landing-copy.md §1,
// brand-redesign-plan.md §5.2. Scene-locked dusk register regardless of the
// visitor's light/dark preference (`.dusk-section`, see globals.css).
// DuskShader is the sky; a CSS/SVG storefront silhouette sits at the
// horizon with one glowing OPEN sign (buzz animation, static under
// reduced-motion); Wick perches near the sign. Real phone mockup on the
// right (static v1 — see hero-phone.tsx).

import { ArrowRight } from "lucide-react"

import { Wick } from "@/components/brand/wick"
import { DuskShader } from "@/components/brand/dusk-shader"
import { Button } from "@/components/ui/button"

import { HeroPhone } from "./hero-phone"
import { ScrollReveal } from "./scroll-reveal"
import { StreetSilhouette } from "./street-silhouette"

export function Hero() {
  return (
    <section
      id="top"
      data-scene="hero"
      className="dusk-section relative isolate overflow-hidden bg-background"
    >
      <DuskShader intensity="hero" className="z-0" />
      {/* Soft scrim so headline text always clears AA over the shader's brighter (amber) band. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-t from-background via-background/40 to-background/10"
      />

      <div className="relative z-10 mx-auto grid max-w-6xl gap-12 px-4 pt-16 pb-0 sm:px-6 sm:pt-24 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-8 lg:px-8 lg:pt-28">
        <div>
          <ScrollReveal>
            <p className="text-xs font-semibold tracking-[0.2em] text-amber-glow uppercase">
              For bakers, barbers, and the people who fix sinks
            </p>
          </ScrollReveal>
          <ScrollReveal delay={0.05}>
            <h1 className="mt-4 text-4xl leading-[1.05] font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              The shop that never closes.
            </h1>
          </ScrollReveal>
          <ScrollReveal delay={0.1}>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground">
              LocalOS writes your posts, answers your customers, and books your jobs — even at 9pm, even while you
              sleep.
            </p>
          </ScrollReveal>
          <ScrollReveal delay={0.15} className="mt-8 flex flex-col items-start gap-3">
            <Button size="lg" variant="flame" className="h-11 px-6 text-base" render={<a href="#pilot-menu" />}>
              Get early access
              <ArrowRight aria-hidden="true" data-icon="inline-end" />
            </Button>
            <p className="font-mono text-xs tracking-wide text-muted-foreground/80 uppercase">
              Free during the pilot · No card · 10-minute setup
            </p>
          </ScrollReveal>
        </div>

        <ScrollReveal delay={0.2} className="relative">
          <HeroPhone />
        </ScrollReveal>
      </div>

      {/* Storefront silhouette + OPEN sign, pinned to the hero's horizon. */}
      <div className="relative z-10 mt-16 sm:mt-20">
        <div className="relative">
          <StreetSilhouette variant="scattered" className="h-28 sm:h-36 lg:h-40" />
          <div className="pointer-events-none absolute right-[18%] bottom-full flex flex-col items-center sm:right-[22%]">
            <Wick state="idle" size={44} className="mb-1" />
            {/* .sign-buzz is a plain CSS keyframe animation — already forced static by
                globals.css's global `prefers-reduced-motion` override, no JS gate needed. */}
            <div className="sign-buzz rounded-md border border-amber-glow/40 bg-background/70 px-2.5 py-1 font-mono text-[10px] font-semibold tracking-[0.15em] text-amber-glow uppercase backdrop-blur-sm">
              Open
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
