"use client"

// Section 5-9 · THE DAY STRIP — landing-copy.md §5-9, brand-redesign-plan.md
// §5.6 (the centerpiece). Gate 2 ships this as a static storyboard: five
// stacked, individually crafted scene cards, each with its own `data-scene`
// hook for Gate 3's pinned-scroll scrub (dawn→noon→dusk→night→dawn). Copy
// is verbatim from the deck.

import { CalendarDays, Check, DoorOpen, MessageCircleWarning, Scissors, Sparkles, Star, ThumbsUp } from "lucide-react"

import { TimeStamp } from "@/components/brand/time-stamp"
import { cn } from "@/lib/utils"

import { ScrollReveal } from "./scroll-reveal"

export function DayStrip() {
  return (
    <section id="day-strip" data-scene="day-strip" className="bg-background py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="mb-16 text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            One day on Main Street.
          </h2>
        </ScrollReveal>

        <div className="flex flex-col gap-16">
          <MorningChalkboard />
          <TicketRail />
          <ShopBell />
          <IndigoHours />
          <MorningReceipt />
        </div>
      </div>
    </section>
  )
}

function SceneHeading({ stamp, title }: { stamp: string; title: string }) {
  return (
    <ScrollReveal className="mb-4">
      {/* flame, not the default amber — every SceneHeading renders on the
          light paper register (even the 11PM scene: this heading sits
          above, not inside, that scene's .dusk-section card), and
          amber-glow is tuned for dark/dusk backgrounds only. */}
      <TimeStamp label={stamp} tone="flame" />
      <h3 className="mt-1.5 text-xl font-semibold text-foreground sm:text-2xl">{title}</h3>
    </ScrollReveal>
  )
}

function MorningChalkboard() {
  return (
    <div data-scene="day-strip-7am">
      <SceneHeading stamp="7:00 AM" title="Your morning post, already written." />
      <ScrollReveal delay={0.05}>
        <div className="rounded-2xl border-[10px] border-chalkboard-border bg-chalkboard p-6 shadow-raised sm:p-8">
          <p className="-rotate-1 font-serif text-lg leading-relaxed text-chalkboard-foreground italic [text-shadow:0_0_1px_var(--chalkboard-foreground)] sm:text-xl">
            Fresh sourdough out at 7. The first loaf&rsquo;s crackle is for the early birds. 🥖
          </p>
          <div className="mt-5 flex items-center gap-3 border-t border-dashed border-chalkboard-foreground/20 pt-4">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-chalkboard-foreground/10 px-3 py-1 text-xs font-medium text-chalkboard-foreground">
              <ThumbsUp aria-hidden="true" className="size-3.5" />
              Approved
            </span>
            <span className="font-mono text-xs tracking-wide text-chalkboard-foreground/70 uppercase">
              Queued for 8:00 AM
            </span>
          </div>
        </div>
      </ScrollReveal>
    </div>
  )
}

function TicketRail() {
  const tickets = [
    { label: "Mon", detail: "Weekly special post" },
    { label: "Wed", detail: "Cinnamon roll photo" },
    { label: "Fri", detail: "Weekend hours reminder" },
  ]
  return (
    <div data-scene="day-strip-12pm">
      <SceneHeading stamp="12:00 PM" title="Your week, on the rail." />
      <ScrollReveal delay={0.05}>
        <div className="relative rounded-2xl border border-border bg-card p-6 shadow-raised sm:p-8">
          <div aria-hidden="true" className="absolute top-12 right-6 left-6 h-0.5 rounded-full bg-border" />
          <div className="relative flex flex-wrap justify-between gap-4 pt-2">
            {tickets.map((ticket, index) => (
              <div
                key={ticket.label}
                className={cn(
                  "flex w-[9.5rem] flex-col gap-1 rounded-lg border border-border bg-background px-3 py-2.5 shadow-soft transition-transform duration-slow ease-out",
                  index === 2 && "border-primary/40 ring-1 ring-primary/20"
                )}
              >
                <span className="text-[11px] font-semibold tracking-wide text-primary uppercase">{ticket.label}</span>
                <span className="text-xs text-muted-foreground">{ticket.detail}</span>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm text-muted-foreground">Drag Thursday&rsquo;s special to Friday. Done.</p>
        </div>
      </ScrollReveal>
    </div>
  )
}

function ShopBell() {
  const bubbles = [
    { text: "Are you open Sunday?", state: "answered" as const },
    { text: "Do you take walk-ins?", state: "answered" as const },
    { text: "Needs you — allergy question", state: "flagged" as const },
  ]
  return (
    <div data-scene="day-strip-6pm">
      <SceneHeading stamp="6:00 PM" title="Ding — a customer at the digital door." />
      <ScrollReveal delay={0.05}>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-raised sm:p-8">
          <div className="mb-4 flex items-center gap-2 border-b border-dashed border-border pb-4">
            <span className="flex size-8 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
              <DoorOpen aria-hidden="true" className="size-4" />
            </span>
            <span className="text-xs font-medium text-muted-foreground">Front door · digital</span>
          </div>
          <div className="flex flex-col gap-2.5">
            {bubbles.map((bubble) => (
              <div
                key={bubble.text}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm",
                  bubble.state === "flagged"
                    ? "border-warning/40 bg-warning/10 text-warning-foreground"
                    : "border-border bg-muted/60 text-foreground"
                )}
              >
                {bubble.state === "flagged" ? (
                  <MessageCircleWarning aria-hidden="true" className="size-4 shrink-0 text-warning" />
                ) : (
                  <Check aria-hidden="true" className="size-4 shrink-0 text-success" />
                )}
                <span className="flex-1">{bubble.text}</span>
                <span
                  className={cn(
                    "shrink-0 text-[11px] font-medium",
                    bubble.state === "flagged" ? "text-warning" : "text-success"
                  )}
                >
                  {bubble.state === "flagged" ? "Needs you" : "Answered"}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-5 text-sm text-muted-foreground">It never guesses. It flags you.</p>
        </div>
      </ScrollReveal>
    </div>
  )
}

function IndigoHours() {
  return (
    <div data-scene="day-strip-11pm">
      <SceneHeading stamp="11:00 PM" title="While Main Street sleeps, yours is answering." />
      <ScrollReveal delay={0.05}>
        <div className="dusk-section overflow-hidden rounded-2xl border border-border bg-background shadow-overlay">
          <div className="flex items-center gap-2 border-b border-border bg-card px-4 py-3">
            <span className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Sparkles aria-hidden="true" className="size-3.5" />
            </span>
            <span className="text-sm font-medium text-foreground">9:04 PM · Instagram DM</span>
          </div>
          <div className="flex flex-col gap-2.5 p-4">
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-2xl rounded-bl-md bg-muted px-3.5 py-2.5 text-sm text-foreground">
                Hi! Do you do birthday cakes for Saturday?
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary/15 px-3.5 py-2.5 text-sm text-foreground">
                We do! Custom cakes are $45 with 48h notice — want me to book a Saturday pickup?
              </div>
              <span className="inline-flex items-center gap-1 pr-1 text-[11px] font-medium text-primary">
                <Sparkles aria-hidden="true" className="size-3" />
                AI answered
              </span>
            </div>
          </div>
        </div>
      </ScrollReveal>
    </div>
  )
}

function MorningReceipt() {
  return (
    <div data-scene="day-strip-645am">
      <SceneHeading stamp="6:45 AM" title="The morning receipt." />
      <ScrollReveal delay={0.05}>
        <div className="relative mx-auto max-w-xs">
          <div className="rounded-t-sm border border-b-0 border-border bg-card px-5 pt-5 pb-5 font-mono text-xs shadow-raised">
            <p className="text-center text-sm font-semibold text-foreground">GOOD MORNING ☀</p>
            <div
              aria-hidden="true"
              className="my-3 h-px w-full bg-[repeating-linear-gradient(90deg,var(--border)_0_4px,transparent_4px_8px)]"
            />
            <p className="text-center tracking-wide text-muted-foreground uppercase">While you slept</p>
            <ul className="mt-3 flex flex-col gap-1.5 text-foreground">
              <li className="flex items-center justify-between gap-2">
                <span>2 new leads</span>
                <Sparkles aria-hidden="true" className="size-3 text-amber-glow" />
              </li>
              <li className="flex items-center justify-between gap-2">
                <span>1 booking (Sat 10:00 AM)</span>
                <CalendarDays aria-hidden="true" className="size-3 text-primary" />
              </li>
              <li className="flex items-center justify-between gap-2">
                <span>1 five-star review</span>
                <Star aria-hidden="true" className="size-3 fill-amber-glow text-amber-glow" />
              </li>
            </ul>
            <div
              aria-hidden="true"
              className="my-3 h-px w-full bg-[repeating-linear-gradient(90deg,var(--border)_0_4px,transparent_4px_8px)]"
            />
            <p className="flex items-center justify-center gap-1.5 text-center text-muted-foreground">
              <Scissors aria-hidden="true" className="size-3" />
              Have a great bake.
            </p>
          </div>
          {/* Tear-off bottom edge — classic two-gradient torn-paper trick: the
              card color fills a zigzag, the page background shows through the
              cut triangles beneath it. */}
          <div
            aria-hidden="true"
            className="h-2.5 w-full"
            style={{
              backgroundImage:
                "linear-gradient(-45deg, transparent 8px, var(--card) 8px), linear-gradient(45deg, transparent 8px, var(--card) 8px)",
              backgroundSize: "16px 16px",
              backgroundPosition: "0 0",
              backgroundRepeat: "repeat-x",
            }}
          />
        </div>
      </ScrollReveal>
    </div>
  )
}
