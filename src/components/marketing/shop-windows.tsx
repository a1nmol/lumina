"use client"

// Section 13 · SHOP WINDOWS (testimonials) — landing-copy.md §13,
// brand-redesign-plan.md §5.10. Light section (Owner-approved light-first
// flip): each testimonial is a small, CONTAINED "window at dusk" vignette —
// `.dusk-section` scopes only the card itself, never the section — floating
// on the paper background with generous whitespace. The light/dark contrast
// between the paper page and each lit window card IS the story now.
// Honestly placeholder ("Your bakery?" etc.) until real pilot numbers exist.
//
// Track D aliveness pass (next-wave-worklist.md §D): each window's glow
// flickers on softly (once) as it scrolls into view — via the one-shot
// `.window-flicker-in` CSS keyframe in globals.css, swapped out on
// `animationend` so it never fights the hover-brighten transition that
// takes over afterward. Hover/focus brightens the glow further and reveals
// a "Your shop here?" chip over the dimmed placeholder — a `bg-flame
// text-flame-foreground` filled pill (not text-flame on its own, which
// falls short of 4.5:1 on the paper/card surfaces at this size) so the
// reveal stays AA in both light and the card's own dusk-section register.

import { useEffect, useRef, useState } from "react"
import { useInView } from "framer-motion"
import { Store } from "lucide-react"

import { cn } from "@/lib/utils"

import { ScrollReveal } from "./scroll-reveal"

const WINDOWS = [
  { id: "bakery", label: "Your bakery?" },
  { id: "salon", label: "Your salon?" },
  { id: "shop", label: "Your shop?" },
] as const

/** Resting glow opacity once a window has finished its enter flicker (pre-hover). */
const REST_OPACITY = 0.6

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
          {WINDOWS.map((window, index) => (
            <ScrollReveal key={window.id} delay={index * 0.08} className="flex justify-center">
              <ShopWindowCard label={window.label} />
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  )
}

function ShopWindowCard({ label }: { label: string }) {
  const [isActive, setIsActive] = useState(false)
  const [flickering, setFlickering] = useState(false)
  const [hasEntered, setHasEntered] = useState(false)

  // ScrollReveal mounts this card immediately (it only fades/positions the
  // wrapper on viewport entry) — so the glow's own "enters view" trigger
  // needs its own viewport check, not a mount effect, or every window
  // would flicker on page load regardless of scroll position.
  const cardRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(cardRef, { once: true, amount: 0.5 })

  // Deliberate setState-in-effect: this is a one-time sync reacting to the
  // IntersectionObserver-backed `useInView` result (an external system),
  // exactly the "subscribe, then setState in a callback" case the rule
  // permits — not a value derivable from props/state during render.
  useEffect(() => {
    if (!isInView || hasEntered) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFlickering(true)
    setHasEntered(true)
  }, [isInView, hasEntered])

  return (
    <div
      ref={cardRef}
      tabIndex={0}
      aria-label={`${label} — testimonial coming soon`}
      onMouseEnter={() => setIsActive(true)}
      onMouseLeave={() => setIsActive(false)}
      onFocus={() => setIsActive(true)}
      onBlur={() => setIsActive(false)}
      className={cn(
        "dusk-section relative flex aspect-[4/5] w-full max-w-[220px] flex-col items-center justify-center gap-3 rounded-t-[2.5rem] rounded-b-2xl border bg-card p-6 text-center outline-none",
        "transition-[border-color] duration-300 focus-visible:ring-3 focus-visible:ring-ring/50",
        isActive ? "border-amber-glow/50" : "border-amber-glow/20"
      )}
    >
      {/* Glow wash — one-shot flicker-in via CSS keyframe, then a plain
          opacity target (hover-reactive) once the keyframe animation ends. */}
      <div
        aria-hidden="true"
        onAnimationEnd={() => setFlickering(false)}
        className={cn(
          "pointer-events-none absolute inset-0",
          flickering ? "window-flicker-in" : "opacity-0 transition-opacity duration-300"
        )}
        style={{
          "--window-rest-opacity": String(REST_OPACITY),
          opacity: flickering ? undefined : hasEntered ? (isActive ? 1 : REST_OPACITY) : 0,
          backgroundImage:
            "radial-gradient(circle at 50% 32%, color-mix(in oklch, var(--amber-glow) 45%, transparent), transparent 72%)",
        } as React.CSSProperties}
      />
      {/* Ring/shadow glow — separate layer so the box-shadow (which can't
          be driven by the background-image keyframe above) brightens in
          lockstep with hover, independent of the one-shot enter flicker. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-t-[2.5rem] rounded-b-2xl transition-shadow duration-300"
        style={{
          boxShadow: isActive
            ? "0 0 0 1px color-mix(in oklch, var(--amber-glow) 18%, transparent), 0 0 34px color-mix(in oklch, var(--amber-glow) 26%, transparent), var(--shadow-overlay)"
            : "0 0 0 1px color-mix(in oklch, var(--amber-glow) 10%, transparent), 0 0 20px color-mix(in oklch, var(--amber-glow) 14%, transparent), var(--shadow-overlay)",
        }}
      />

      <Store
        aria-hidden="true"
        className={cn("relative size-6 transition-colors duration-300", isActive ? "text-amber-glow" : "text-amber-glow/75")}
      />
      <p className="relative text-sm font-medium text-muted-foreground">{label}</p>

      <span
        aria-hidden={!isActive}
        className={cn(
          "absolute inset-x-4 bottom-4 rounded-full bg-flame px-3 py-1.5 text-[11px] font-semibold text-flame-foreground shadow-soft transition-all duration-300",
          isActive ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
        )}
      >
        Your shop here?
      </span>
    </div>
  )
}
