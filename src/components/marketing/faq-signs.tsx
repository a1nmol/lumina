"use client"

// Section 15 · FAQ — flip signs — landing-copy.md §15, brand-redesign-
// plan.md §5.12. Reuses ui/accordion.tsx (Base UI — full keyboard nav +
// aria wiring already handled there) restyled so each trigger shows a small
// OPEN/CLOSED sign chip that flips via CSS rotateX when its panel opens.
// Copy is owner-voiced, verbatim from the deck.

import { Accordion, AccordionItem, AccordionPanel, AccordionTrigger } from "@/components/ui/accordion"

import { ScrollReveal } from "./scroll-reveal"

const FAQS = [
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
    a: "Yes. LocalOS catches what you miss — it doesn't replace your line.",
  },
  {
    q: "How long does setup take?",
    a: "About 10 minutes: your hours, services, prices, and how you like to sound. That becomes your shop's brain.",
  },
  {
    q: "What does it cost?",
    a: "Free during the pilot. When plans launch, pilot shops get first — and best — pricing.",
  },
]

export function FaqSigns() {
  return (
    <section id="faq" data-scene="faq" className="bg-background py-20 sm:py-28">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Questions, answered straight.
          </h2>
        </ScrollReveal>

        <ScrollReveal delay={0.05} className="mt-10 rounded-2xl border border-border bg-card px-5 shadow-raised sm:px-7">
          <Accordion>
            {FAQS.map((faq) => (
              <AccordionItem key={faq.q} value={faq.q}>
                <AccordionTrigger className="gap-3 py-4">
                  <span className="flex items-center gap-3 text-left">
                    <FlipSignChip />
                    <span className="text-sm font-semibold text-foreground sm:text-base">{faq.q}</span>
                  </span>
                </AccordionTrigger>
                <AccordionPanel className="pl-[3.25rem] text-sm text-muted-foreground sm:pr-8">{faq.a}</AccordionPanel>
              </AccordionItem>
            ))}
          </Accordion>
        </ScrollReveal>
      </div>
    </section>
  )
}

/** A tiny OPEN/CLOSED flip sign — driven purely by the ancestor Trigger's `data-panel-open` state (group/accordion-trigger, declared in ui/accordion.tsx). Decorative. */
function FlipSignChip() {
  return (
    <span aria-hidden="true" className="relative inline-block h-5 w-11 shrink-0 [perspective:400px]">
      <span
        className="absolute inset-0 flex items-center justify-center rounded-sm border border-success/40 bg-success/10 text-[9px] font-bold tracking-wide text-success uppercase transition-transform duration-base [backface-visibility:hidden] group-data-panel-open/accordion-trigger:[transform:rotateX(180deg)]"
      >
        Open
      </span>
      <span
        className="absolute inset-0 flex items-center justify-center rounded-sm border border-destructive/40 bg-destructive/10 text-[9px] font-bold tracking-wide text-destructive uppercase transition-transform duration-base [backface-visibility:hidden] [transform:rotateX(180deg)] group-data-panel-open/accordion-trigger:[transform:rotateX(0deg)]"
      >
        Closed
      </span>
    </span>
  )
}
