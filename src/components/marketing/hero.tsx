"use client"

// Section 1 · HERO — "Morning on Main Street" (daylight). Owner-approved
// flip from the dusk-locked v1 to a light-first backdrop (owner direction
// change, see the top of this build): warm paper base + two barely-there
// color washes (amber sun-glow top-right, indigo tint top-left, both
// CSS-only — see .morning-sky in globals.css) + a fine espresso line-art
// Main Street strip along the bottom (StreetSilhouette's "line" variant
// carries its own door + OPEN sign, the scene's single amber accent) + a
// static paper-grain texture. No shader, no scene lock — DuskShader still
// powers the login aurora, just not this section anymore.
//
// Entrance: one orchestrated sequence — eyebrow → headline (blur-to-sharp)
// → sub → CTA row → phone (spring) → Wick flying in to his perch — staggered
// under 1.6s total, respecting reduced-motion (instant, static) throughout.
//
// Wick: bigger (88px, ~2x the prior 44px), flight="patrol" (continuous
// gentle figure-8 drift + occasional blink + rare micro-dart — see
// wick.tsx), choreographed against the phone loop via HeroPhone's
// onPhaseChange callback: curious when the customer's message arrives,
// thinking during the AI reply, one celebrating loop when the calendar
// chip lands, then back to patrol. Debounced (celebratedRef) to at most
// once per loop cycle, reset when a new "call" phase begins.

import { useCallback, useRef, useState } from "react"
import { ArrowRight } from "lucide-react"
import { motion, useReducedMotion } from "framer-motion"

import { Wick, type WickState } from "@/components/brand/wick"
import { Button } from "@/components/ui/button"
import { easing, spring } from "@/lib/motion"

import { HeroPhone, type HeroPhonePhase } from "./hero-phone"
import { ScrollReveal } from "./scroll-reveal"
import { StreetSilhouette } from "./street-silhouette"

export function Hero() {
  const [wickState, setWickState] = useState<WickState>("idle")
  // Debounces the calendar-chip celebration to at most once per phone loop.
  const celebratedRef = useRef(false)

  const handlePhaseChange = useCallback((phase: HeroPhonePhase) => {
    if (phase === "call") {
      celebratedRef.current = false
      setWickState("idle")
      return
    }
    if (phase === "customer") {
      setWickState("curious")
      return
    }
    if (phase === "reply") {
      setWickState("thinking")
      return
    }
    if (phase === "calendar" && !celebratedRef.current) {
      celebratedRef.current = true
      setWickState("celebrating")
    }
  }, [])

  return (
    <section id="top" data-scene="hero" className="relative isolate overflow-hidden bg-background">
      <div aria-hidden="true" className="morning-sky pointer-events-none absolute inset-0 z-0" />
      <div aria-hidden="true" className="paper-grain pointer-events-none absolute inset-0 z-0" />

      <div className="relative z-10 mx-auto grid max-w-6xl gap-12 px-4 pt-16 pb-0 sm:px-6 sm:pt-24 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-8 lg:px-8 lg:pt-28">
        <div className="relative">
          {/* Wick — near the headline, visible at first glance, not tucked
              in a corner. This wrapper (not Wick itself) carries the
              absolute positioning, so WickReveal's entrance transform below
              can't accidentally become Wick's containing block. Absolute +
              zero intrinsic content in flow ⇒ mounting/animating Wick never
              shifts anything else (no CLS). */}
          <div className="pointer-events-none absolute -top-12 right-0 z-20 sm:-top-16 sm:right-4">
            <WickReveal>
              <Wick
                state={wickState}
                flight="patrol"
                lookAt="right"
                size={88}
                onComplete={() => setWickState("idle")}
              />
            </WickReveal>
          </div>

          <ScrollReveal>
            <p className="text-xs font-semibold tracking-[0.2em] text-amber-glow uppercase">
              For bakers, barbers, and the people who fix sinks
            </p>
          </ScrollReveal>
          <HeadlineReveal>
            <h1 className="mt-4 text-4xl leading-[1.05] font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              The shop that never closes.
            </h1>
          </HeadlineReveal>
          <ScrollReveal delay={0.35}>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground">
              Lumina writes your posts, answers your customers, and books your jobs — even at 9pm, even while you
              sleep.
            </p>
          </ScrollReveal>
          <ScrollReveal delay={0.5} className="mt-8 flex flex-col items-start gap-3">
            <Button size="lg" variant="flame" className="h-11 px-6 text-base" render={<a href="#pilot-menu" />}>
              Get early access
              <ArrowRight aria-hidden="true" data-icon="inline-end" />
            </Button>
            <p className="font-mono text-xs tracking-wide text-muted-foreground/80 uppercase">
              Free during the pilot · No card · 10-minute setup
            </p>
          </ScrollReveal>
        </div>

        <PhoneReveal>
          <HeroPhone onPhaseChange={handlePhaseChange} />
        </PhoneReveal>
      </div>

      {/* Fine line-art Main Street strip along the hero's bottom edge — its
          own door + OPEN sign carry the scene's single amber accent. */}
      <div className="relative z-10 mt-16 sm:mt-20">
        <StreetSilhouette variant="line" className="h-28 sm:h-36 lg:h-40" />
      </div>
    </section>
  )
}

/** Headline entrance: slight y + blur-to-sharp fade, 400ms ease-out — the
 * one beat in the sequence that isn't a plain ScrollReveal fade+rise. */
function HeadlineReveal({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion()
  if (reduceMotion) return <>{children}</>
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.4, ease: easing.out, delay: 0.15 }}
    >
      {children}
    </motion.div>
  )
}

/** Phone entrance: spring in from y+24 (the device frame's own shadow-raised
 * lift + idle float live in hero-phone.tsx and layer on top of this). */
function PhoneReveal({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion()
  if (reduceMotion) return <div className="relative">{children}</div>
  return (
    <motion.div
      className="relative"
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ ...spring, delay: 0.65 }}
    >
      {children}
    </motion.div>
  )
}

/** Wick's entrance: flies in from off-canvas to his perch — the sequence's
 * final beat (~0.9s in, settling well under the 1.6s total budget). */
function WickReveal({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion()
  if (reduceMotion) return <>{children}</>
  return (
    <motion.div
      initial={{ opacity: 0, x: 56, y: -18, scale: 0.7 }}
      whileInView={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ ...spring, delay: 0.9 }}
    >
      {children}
    </motion.div>
  )
}
