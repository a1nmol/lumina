// Section 4 · HOW IT WORKS — three streetlamps (landing-copy.md §4). Plain-
// English pillars, no AI jargon. Each pillar is a streetlamp SVG (pole +
// head + amber glow ellipse); glow is static-on for Gate 2 (Gate 3 lights
// them in on scroll via the `data-scene` hook).

import { CalendarCheck2, MessageCircleHeart, Sparkles, type LucideIcon } from "lucide-react"

import { ScrollReveal } from "./scroll-reveal"

const PILLARS: { title: string; body: string; icon: LucideIcon }[] = [
  {
    title: "Gets you seen",
    body: "Every week LocalOS drafts posts that sound like you. You approve with one tap.",
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
    <section id="how-it-works" data-scene="lamps" className="bg-background py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="mx-auto max-w-xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Three jobs. Handled.</h2>
        </ScrollReveal>

        <div className="mt-16 grid gap-12 sm:grid-cols-3 sm:gap-6">
          {PILLARS.map((pillar, index) => (
            <ScrollReveal key={pillar.title} delay={index * 0.08} className="flex flex-col items-center text-center">
              <StreetLamp icon={pillar.icon} />
              <h3 className="mt-5 text-lg font-semibold text-foreground">{pillar.title}</h3>
              <p className="mt-2 max-w-[22ch] text-sm text-muted-foreground">{pillar.body}</p>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  )
}

function StreetLamp({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div className="relative flex flex-col items-center" aria-hidden="true">
      <svg width="72" height="130" viewBox="0 0 72 130" className="overflow-visible">
        {/* Glow */}
        <ellipse cx="36" cy="28" rx="30" ry="24" className="fill-amber-glow/25 glow-pulse" style={{ filter: "blur(10px)" }} />
        <ellipse cx="36" cy="28" rx="14" ry="12" className="fill-amber-glow/50 glow-pulse" style={{ filter: "blur(4px)" }} />
        {/* Lamp head */}
        <path d="M 20 26 Q 36 6 52 26 L 46 34 L 26 34 Z" className="fill-foreground/80" />
        <rect x="30" y="34" width="12" height="6" rx="1.5" className="fill-foreground/80" />
        {/* Pole */}
        <rect x="33.5" y="40" width="5" height="80" rx="2" className="fill-foreground/70" />
        <rect x="26" y="118" width="20" height="6" rx="2" className="fill-foreground/70" />
      </svg>
      <span className="absolute top-5 flex size-8 items-center justify-center rounded-full bg-background/80 text-flame ring-1 ring-amber-glow/40 backdrop-blur-sm">
        <Icon aria-hidden="true" className="size-4" />
      </span>
    </div>
  )
}
