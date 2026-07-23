// Section 14 · THE PILOT MENU (early access) — landing-copy.md §14,
// brand-redesign-plan.md §5.11 + Next Wave Track C (docs/design-briefs/
// next-wave-worklist.md): bigger presence (max-w ~2xl) with real
// storytelling — a menu-board header with a hand-drawn underline, the
// pilot's three terms laid out as menu items (icon + one-line description
// + a "$0" price column with a dotted leader line, like a real menu board),
// and a soft Wick-glow amber accent behind the header. Every word of the
// original verbatim copy deck is preserved, just reflowed into name +
// description pairs across the three items instead of three stacked
// paragraphs — no new claims added. The working form (pilot-menu-form.tsx)
// is untouched, just given more room inside the bigger card. Dark
// chalkboard tone stays deliberately dark (a contained physical prop,
// on-theme) on the light paper band.

import { Gift, MapPinned, ShieldCheck, type LucideIcon } from "lucide-react"

import { ScrollReveal } from "./scroll-reveal"
import { PilotMenuForm } from "./pilot-menu-form"

interface MenuItem {
  icon: LucideIcon
  name: string
  description: string
}

const MENU_ITEMS: MenuItem[] = [
  { icon: Gift, name: "Everything on the house", description: "while we cook." },
  { icon: ShieldCheck, name: "No card, no contract", description: "Free." },
  { icon: MapPinned, name: "Limited seats per city", description: "so every shop gets real attention." },
]

export function PilotMenu() {
  return (
    <section id="pilot-menu" data-scene="pilot-menu" className="bg-background py-20 sm:py-28">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">The pilot menu.</h2>
        </ScrollReveal>

        <ScrollReveal delay={0.05} className="relative mt-10">
          {/* Wick-glow accent — a soft amber bloom behind the menu-board
              header, echoing Wick's own bio-luminescent tail-glow tokens
              (src/components/brand/wick.tsx's --wick-glow-outer) without
              drawing the character himself (he already appears in the
              form's success state below — two Wicks on screen would break
              the one-character illusion). Purely decorative; reuses the
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
            className="relative mx-auto max-w-xl border-2 border-dashed border-chalkboard-foreground/25 bg-chalkboard p-7 shadow-raised sm:p-10"
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

            <ul className="mt-7 flex flex-col gap-4 border-t border-b border-dashed border-chalkboard-foreground/20 py-6">
              {MENU_ITEMS.map((item) => (
                <li key={item.name} className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-chalkboard-foreground/10 text-amber-glow">
                    <item.icon aria-hidden="true" className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-semibold text-chalkboard-foreground">{item.name}</span>
                      <span
                        aria-hidden="true"
                        className="mb-1 h-0 flex-1 self-end border-b border-dotted border-chalkboard-foreground/30"
                      />
                      <span className="font-mono text-sm font-bold text-amber-glow">$0</span>
                    </div>
                    <p className="mt-0.5 text-xs text-chalkboard-foreground/70">{item.description}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mx-auto max-w-sm rounded-2xl bg-background p-6 shadow-raised">
              <PilotMenuForm />
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  )
}
