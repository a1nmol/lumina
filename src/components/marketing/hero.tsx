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

import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowRight } from "lucide-react"
import { motion, useReducedMotion } from "framer-motion"

import { setHeroWickHandoff, Wick, type WickState } from "@/components/brand/wick"
import { Button } from "@/components/ui/button"
import { duration, easing, spring } from "@/lib/motion"

import { HeroPhone, type HeroPhonePhase } from "./hero-phone"
import { ScrollReveal } from "./scroll-reveal"
import { StreetSilhouette } from "./street-silhouette"

export function Hero() {
  const [wickState, setWickState] = useState<WickState>("idle")
  // Debounces the calendar-chip celebration to at most once per phone loop.
  const celebratedRef = useRef(false)

  // Hero ↔ guide handoff (landing-page-guide upgrade, additive) — this is
  // the ONE IntersectionObserver for the hero↔guide relationship (see
  // wick.tsx's HeroWickHandoff doc): wick-guide.tsx no longer runs its own
  // duplicate observer on this section, it just reads the store below.
  // `wickAnchorRef` sits on the wrapper that carries the *static* absolute
  // positioning (not the animated children), so its measured rect never
  // includes any of WickReveal's/HeroWickHandoffLayer's own transforms —
  // that's what makes this a reliable handshake instead of a race against
  // in-flight animation.
  const wickAnchorRef = useRef<HTMLDivElement>(null)
  const [wickHandoffVisible, setWickHandoffVisible] = useState(true)

  useEffect(() => {
    const section = document.querySelector('[data-scene="hero"]')
    if (!section) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible = entry.isIntersecting
        setWickHandoffVisible(visible)
        const node = wickAnchorRef.current
        const rect = node?.getBoundingClientRect()
        setHeroWickHandoff({
          heroVisible: visible,
          center: rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null,
        })
      },
      { threshold: 0 }
    )
    observer.observe(section)
    return () => observer.disconnect()
  }, [])

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
          <div ref={wickAnchorRef} className="pointer-events-none absolute -top-12 right-0 z-20 sm:-top-16 sm:right-4">
            <HeroWickHandoffLayer visible={wickHandoffVisible}>
              <WickReveal>
                <Wick
                  state={wickState}
                  flight="patrol"
                  lookAt="right"
                  size={88}
                  onComplete={() => setWickState("idle")}
                />
              </WickReveal>
            </HeroWickHandoffLayer>
          </div>

          <ScrollReveal>
            {/* muted-foreground, not amber-glow — amber-glow is tuned for
                dark/dusk surfaces (globals.css) and fails AA at this small
                uppercase size against the light paper register (1.86:1, see
                the readability-audit build report). Flame was also tried
                and rejected: 4.17:1 on paper, still short of the 4.5:1 small-
                text bar. muted-foreground clears 7.8:1 and reads as a
                classic "eyebrow" label above the headline. */}
            <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
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
            {/* Full-strength muted-foreground, not /80 — the opacity dip
                dropped this below 4.5:1 (3.86:1 with the old token, still
                only 4.66:1 with the darkened one; see build report). */}
            <p className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
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

/**
 * Hero↔guide handoff visibility (additive, landing-page-guide upgrade) —
 * wraps the hero's own Wick (including its one-time `WickReveal` entrance)
 * with an ongoing opacity/scale toggle keyed to hero-section visibility, so
 * the "same bug" visibly departs the instant the scroll guide takes over
 * (and gently returns if the visitor scrolls back up). Nested OUTSIDE
 * `WickReveal` so the two never fight over the same transform: this layer
 * only ever touches opacity/scale, `WickReveal` only ever touches its own
 * one-shot x/y/scale entrance.
 */
function HeroWickHandoffLayer({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  const reduceMotion = useReducedMotion()
  if (reduceMotion) {
    return <div style={{ opacity: visible ? 1 : 0 }}>{children}</div>
  }
  return (
    <motion.div
      animate={{ opacity: visible ? 1 : 0, scale: visible ? 1 : 0.6 }}
      transition={visible ? { ...spring, delay: 0.08 } : { duration: duration.fast, ease: easing.out }}
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
