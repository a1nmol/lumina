// THE CLOSING CONVERSION ZONE — merges the former three consecutive
// full-height sections (pilot-menu.tsx chalkboard+form → faq-signs.tsx
// accordion → final-cta.tsx street) into one section per Next Wave Track D
// (docs/design-briefs/next-wave-worklist.md). id stays "pilot-menu" — nav +
// hero/final-cta CTAs already anchor to it. Top to bottom: heading (reusing
// pilot-menu's "save my spot" copy spirit) → chalkboard card (compact menu
// chip row + the working form, no nested white sub-card) → a plain-content
// mini-FAQ (4 of the 5 original Q&As — "What does it cost?" cut as the
// weakest: it's now redundant with the "$0 during the pilot" chip line and
// the form's own "free during the pilot" microcopy right above) → the
// illustrated dusk street as the closing visual, with final-cta's closing
// line as a caption and no button (the form living in this same section
// replaces the old back-jump CTA).

import { Gift, MapPinned, ShieldCheck, type LucideIcon } from "lucide-react"

import { ScrollReveal } from "./scroll-reveal"
import { PilotMenuForm } from "./pilot-menu-form"
import { StreetSilhouette } from "./street-silhouette"

interface MenuChip {
  icon: LucideIcon
  label: string
}

const MENU_CHIPS: MenuChip[] = [
  { icon: Gift, label: "Everything on the house" },
  { icon: ShieldCheck, label: "No card, no contract" },
  { icon: MapPinned, label: "Limited seats per city" },
]

interface Faq {
  q: string
  a: string
}

// 4 of the original 5 Q&As (faq-signs.tsx) — "What does it cost?" cut as the
// weakest: its answer is now redundant with the "$0 during the pilot" chip
// line and the form's own "free during the pilot" microcopy directly above
// this block.
const FAQS: Faq[] = [
  {
    q: "Will customers know it's AI?",
    a: "If they ask, it never pretends to be human. Most just notice they finally got an answer in 30 seconds instead of tomorrow.",
  },
  {
    q: "What if it doesn't know the answer?",
    a: "It says so, tells the customer you'll follow up, and flags the thread for you. It never invents prices or promises.",
  },
  {
    q: "Do I keep my phone number?",
    a: "Yes. Lumina catches what you miss — it doesn't replace your line.",
  },
  {
    q: "How long does setup take?",
    a: "About 10 minutes: your hours, services, prices, and how you like to sound. That becomes your shop's brain.",
  },
]

export function ConversionZone() {
  return (
    <section id="pilot-menu" data-scene="conversion-zone" className="bg-background py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Free while we build together.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-muted-foreground">
            No card, no contract. Limited seats per city — so every shop gets real attention.
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.05} className="relative mx-auto mt-10 max-w-2xl">
          {/* Wick-glow accent — a soft amber bloom behind the chalkboard,
              echoing Wick's own bio-luminescent tail-glow tokens
              (src/components/brand/wick.tsx's --wick-glow-outer) without
              drawing the character himself (he already appears in the
              form's success state below). Purely decorative; reuses the
              existing `.glow-pulse` keyframe, already reduced-motion-safe
              via the global override in globals.css. */}
          <div
            aria-hidden="true"
            className="glow-pulse pointer-events-none absolute inset-x-0 -top-6 mx-auto h-24 w-2/3 max-w-xs rounded-full blur-3xl"
            style={{
              backgroundImage:
                "radial-gradient(closest-side, color-mix(in oklch, var(--wick-glow-outer) 45%, transparent), transparent)",
            }}
          />

          <div
            className="relative border-2 border-dashed border-chalkboard-foreground/25 bg-chalkboard p-7 shadow-raised sm:p-10"
            style={{ borderRadius: "180px 14px 160px 14px / 14px 160px 14px 180px" }}
          >
            <div className="flex flex-col items-center">
              <p className="font-serif text-sm tracking-[0.3em] text-chalkboard-foreground/70 uppercase">
                Pilot menu
              </p>
              {/* Hand-drawn underline — a single wavy chalk stroke, not a straight rule. */}
              <svg aria-hidden="true" width="120" height="10" viewBox="0 0 120 10" className="mt-1">
                <path
                  d="M2 5 Q 30 1 60 5 T 118 4"
                  fill="none"
                  stroke="var(--chalkboard-foreground)"
                  strokeOpacity="0.4"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </div>

            <ul className="mt-6 flex flex-wrap items-center justify-center gap-2 border-t border-b border-dashed border-chalkboard-foreground/20 py-5">
              {MENU_CHIPS.map((chip) => (
                <li
                  key={chip.label}
                  className="flex items-center gap-1.5 rounded-full bg-chalkboard-foreground/10 px-3 py-1.5 text-xs font-medium text-chalkboard-foreground"
                >
                  <chip.icon aria-hidden="true" className="size-3.5 shrink-0 text-amber-glow" />
                  {chip.label}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-center text-xs text-chalkboard-foreground/70">$0 during the pilot.</p>

            <div className="mt-7">
              <PilotMenuForm />
            </div>
          </div>
        </ScrollReveal>

        <div id="faq">
          <ScrollReveal delay={0.1} className="mx-auto mt-20 max-w-3xl">
            <h3 className="text-center text-lg font-semibold tracking-tight text-foreground">
              Questions, answered straight.
            </h3>
            <dl className="mt-8 grid gap-x-10 gap-y-5 sm:grid-cols-2">
              {FAQS.map((faq) => (
                <div key={faq.q}>
                  <dt className="text-sm font-medium text-foreground">{faq.q}</dt>
                  <dd className="mt-1 text-sm text-muted-foreground">{faq.a}</dd>
                </div>
              ))}
            </dl>
          </ScrollReveal>
        </div>

        <ScrollReveal delay={0.15} className="mt-20">
          <p className="text-center text-sm text-muted-foreground">Ready when you are.</p>
          <div className="dusk-section mt-4 overflow-hidden rounded-3xl border border-amber-glow/20 bg-card shadow-overlay">
            <StreetSilhouette variant="main-street" className="px-2 py-4 sm:px-6 sm:py-6" />
          </div>
        </ScrollReveal>
      </div>
    </section>
  )
}
