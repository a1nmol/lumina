"use client"

// Section 11 · FEATURES BY OUTCOME — landing-copy.md §11, brand-redesign-
// plan.md §5.8/§5.11 ("awning cards"). Each card's header band uses a CSS
// repeating-linear-gradient stripe in flame/amber. A small live example
// line (from shop-context.tsx) shows the selected vertical's specific
// instance under each card's fixed, verbatim body copy.

import { CalendarClock, Coffee, ImagePlus, type LucideIcon } from "lucide-react"

import { ScrollReveal } from "./scroll-reveal"
import { useShopExample } from "./shop-context"

interface OutcomeCard {
  title: string
  body: string
  icon: LucideIcon
  example: (exampleData: ReturnType<typeof useShopExample>["example"]) => string
}

const CARDS: OutcomeCard[] = [
  {
    title: "Get booked",
    body: "A front desk that answers in 30 seconds, books straight into your calendar, and texts back every missed call.",
    icon: CalendarClock,
    example: (example) => `"${example.missedQuestion}" → ${example.bookedExample}`,
  },
  {
    title: "Get known",
    body: "A week of posts in your voice, made in one sitting. Photos, captions, hashtags — approve and go.",
    icon: ImagePlus,
    example: (example) => example.postCaption,
  },
  {
    title: "Get your evenings back",
    body: "Stop being the phone. Read the morning receipt with your coffee instead.",
    icon: Coffee,
    example: (example) => `While you slept — ${example.eveningsExample}`,
  },
]

export function OutcomeCards() {
  const shop = useShopExample()

  return (
    <section id="features" data-scene="outcome-cards" className="bg-background py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-6 sm:grid-cols-3">
          {CARDS.map((card, index) => (
            <ScrollReveal key={card.title} delay={index * 0.08}>
              <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-raised">
                <div
                  aria-hidden="true"
                  className="h-2.5 w-full"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(45deg, var(--flame) 0 10px, var(--amber-glow) 10px 20px)",
                  }}
                />
                <div className="flex flex-1 flex-col gap-3 p-6">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-flame/10 text-flame">
                    <card.icon aria-hidden="true" className="size-4.5" />
                  </span>
                  <h3 className="text-lg font-semibold text-foreground">{card.title}</h3>
                  <p className="text-sm text-muted-foreground">{card.body}</p>
                  <div className="mt-auto rounded-lg border border-dashed border-border bg-awning px-3 py-2.5">
                    <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                      {shop.example.emoji} {shop.example.label} example
                    </p>
                    <p className="mt-1 text-xs text-foreground">{card.example(shop.example)}</p>
                  </div>
                </div>
              </article>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  )
}
