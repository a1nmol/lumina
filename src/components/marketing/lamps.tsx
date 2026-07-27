// Section 4 · HOW IT WORKS — three jobs, handled (landing-copy.md §4). Plain-
// English pillars, no AI jargon. Compact bridge strip: icon badge + title +
// one line of body copy per job, in a single row on sm+ (stacked on mobile).
// This section's job is preview + orient; the day-strip section right after
// it does the proving. ScrollReveal handles entrance; a subtle divider
// separates columns on sm+.

import { CalendarCheck2, MessageCircleHeart, Sparkles, type LucideIcon } from "lucide-react"

import { ScrollReveal } from "./scroll-reveal"

const PILLARS: { title: string; body: string; icon: LucideIcon }[] = [
  {
    title: "Gets you seen",
    body: "Every week Lumina drafts posts that sound like you. You approve with one tap.",
    icon: Sparkles,
  },
  {
    title: "Never misses a customer",
    body: "Chats, texts, DMs — answered in seconds, day or night, from your real hours, menu, and prices.",
    icon: MessageCircleHeart,
  },
  {
    title: "Shows what worked",
    body: "See which post brought which customers, down to the booking.",
    icon: CalendarCheck2,
  },
]

export function Lamps() {
  return (
    <section id="how-it-works" data-scene="lamps" className="bg-background py-14 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="mx-auto max-w-xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Three jobs. Handled.</h2>
        </ScrollReveal>

        <div className="mt-10 grid gap-8 sm:grid-cols-3 sm:gap-6">
          {PILLARS.map((pillar, index) => (
            <ScrollReveal
              key={pillar.title}
              delay={index * 0.08}
              className="flex flex-col items-center gap-2 text-center sm:border-l sm:border-border sm:pl-6 sm:first:border-l-0 sm:first:pl-0"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-background/80 text-flame ring-1 ring-amber-glow/40">
                <pillar.icon aria-hidden="true" className="size-4" />
              </span>
              <h3 className="font-medium text-foreground">{pillar.title}</h3>
              <p className="text-sm text-muted-foreground">{pillar.body}</p>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  )
}
