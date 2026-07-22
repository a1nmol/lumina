"use client"

// Section 3 · PROBLEM — landing-copy.md §3 (stamp "6:02 PM"). Day fades:
// split composition — a CLOSED flip-sign on the left, a phone card with 3
// missed-item rows on the right. The DM row swaps per the "Pick your shop"
// tab (shop-context.tsx); call/review rows stay generic.

import { MessageCircle, Phone, Star } from "lucide-react"

import { TimeStamp } from "@/components/brand/time-stamp"

import { ScrollReveal } from "./scroll-reveal"
import { useShopExample } from "./shop-context"

export function Problem() {
  const { example } = useShopExample()

  return (
    <section id="problem" data-scene="problem" className="bg-background py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="mb-10">
          {/* flame, not the default amber — amber-glow is tuned for dark/dusk
              backgrounds (globals.css) and fails AA against the light paper
              register this section renders in. */}
          <TimeStamp label="6:02 PM" tone="flame" />
        </ScrollReveal>

        <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
          <div>
            <ScrollReveal>
              <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                You flipped the sign. Your customers didn&rsquo;t.
              </h2>
            </ScrollReveal>
            <ScrollReveal delay={0.05}>
              <p className="mt-4 max-w-lg text-lg text-muted-foreground">
                Every evening the calls, DMs, and &ldquo;are you open?&rdquo; messages keep coming. You can&rsquo;t
                answer at 9pm — so that customer books somewhere that does.
              </p>
            </ScrollReveal>
            <ScrollReveal delay={0.1} className="mt-10">
              <p className="font-mono text-6xl font-bold tabular-nums text-flame sm:text-7xl">62%</p>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                of calls to small businesses ring out unanswered.
                <sup>&dagger;</sup>
              </p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                &dagger; industry studies; verify/replace with pilot data before GA
              </p>
            </ScrollReveal>
          </div>

          <ScrollReveal delay={0.15} className="flex flex-col items-center gap-8 sm:flex-row sm:items-start sm:justify-center lg:justify-end">
            <ClosedSign />
            <MissedItemsCard missedQuestion={example.missedQuestion} />
          </ScrollReveal>
        </div>
      </div>
    </section>
  )
}

function ClosedSign() {
  return (
    <div
      className="flex w-40 shrink-0 -rotate-3 flex-col items-center gap-3 rounded-2xl border border-border bg-card p-5 shadow-raised transition-transform duration-slow ease-out hover:rotate-0"
      style={{ perspective: "600px" }}
    >
      <span className="h-1 w-8 rounded-full bg-border" aria-hidden="true" />
      <div className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-destructive/30 bg-destructive/10">
        <span className="text-xs font-bold tracking-[0.25em] text-destructive uppercase">Closed</span>
      </div>
      <span className="text-[11px] text-muted-foreground">Back at 8:00 AM</span>
    </div>
  )
}

function MissedItemsCard({ missedQuestion }: { missedQuestion: string }) {
  return (
    <div className="w-full max-w-[280px] rounded-2xl border border-border bg-card p-4 shadow-raised">
      <p className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">On the counter</p>
      <ul className="flex flex-col gap-2.5">
        <MissedRow icon={Phone} label="Missed call" detail="(555) 812-4076" />
        <MissedRow icon={MessageCircle} label="New DM" detail={missedQuestion} />
        <MissedRow icon={Star} label="New review" detail="★★★★ needs a reply" />
      </ul>
    </div>
  )
}

function MissedRow({
  icon: Icon,
  label,
  detail,
}: {
  icon: typeof Phone
  label: string
  detail: string
}) {
  return (
    <li className="flex items-start gap-2.5 rounded-lg bg-warning/10 px-2.5 py-2">
      <Icon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-warning" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground">{label}</p>
        <p className="truncate text-xs text-muted-foreground">{detail}</p>
      </div>
    </li>
  )
}
