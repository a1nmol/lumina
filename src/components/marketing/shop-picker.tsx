"use client"

// Section 12 · PICK YOUR SHOP — landing-copy.md §12, brand-redesign-plan.md
// §5.9. A radiogroup of pill tabs (pattern borrowed from
// src/components/studio/format-segmented.tsx) drives shop-context.tsx's
// selected vertical, which problem.tsx and outcome-cards.tsx already
// consume. This section additionally renders its own small live demo — a
// mini showcase trio (Track D, next-wave-worklist.md §D): a post preview,
// a customer Q&A pair (answered in the same left-muted/right-indigo +
// "AI answered" chip convention as the in-app inbox / hero-phone / day-
// strip's 11PM scene), and a till/receipt-style weekly result chip — so
// the swap is fully legible without scrolling back up.

import { useRef, type KeyboardEvent } from "react"
import { CalendarCheck2, MessageCircle, Receipt, Sparkles } from "lucide-react"

import { cn } from "@/lib/utils"

import { ScrollReveal } from "./scroll-reveal"
import { SHOP_EXAMPLES } from "@/lib/marketing/shop-examples"
import { useShopExample } from "./shop-context"

export function ShopPicker() {
  const { vertical, example, setVertical } = useShopExample()
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([])

  function selectAndFocus(index: number) {
    const option = SHOP_EXAMPLES[index]
    if (!option) return
    setVertical(option.id)
    buttonRefs.current[index]?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const currentIndex = SHOP_EXAMPLES.findIndex((item) => item.id === vertical)
    if (currentIndex === -1) return
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault()
        selectAndFocus((currentIndex + 1) % SHOP_EXAMPLES.length)
        break
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault()
        selectAndFocus((currentIndex - 1 + SHOP_EXAMPLES.length) % SHOP_EXAMPLES.length)
        break
      case "Home":
        event.preventDefault()
        selectAndFocus(0)
        break
      case "End":
        event.preventDefault()
        selectAndFocus(SHOP_EXAMPLES.length - 1)
        break
      default:
        break
    }
  }

  return (
    <section id="pick-your-shop" data-scene="shop-picker" className="bg-background py-20 sm:py-28">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Made for shops like yours.
          </h2>
        </ScrollReveal>

        <ScrollReveal delay={0.05} className="mt-8 flex justify-center">
          <div
            role="radiogroup"
            aria-label="Pick your shop type"
            onKeyDown={handleKeyDown}
            className="inline-flex h-11 w-fit flex-wrap items-center justify-center gap-1 rounded-xl bg-muted p-1 text-muted-foreground"
          >
            {SHOP_EXAMPLES.map((shop, index) => {
              const isSelected = shop.id === vertical
              return (
                <button
                  key={shop.id}
                  ref={(el) => {
                    buttonRefs.current[index] = el
                  }}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={isSelected ? 0 : -1}
                  onClick={() => setVertical(shop.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border border-transparent px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring",
                    isSelected
                      ? "bg-background text-foreground shadow-sm"
                      : /* /70, not /60 — /60 measured 4.28:1 against the paper
                           background, short of the 4.5:1 small-text bar (see
                           the readability-audit build report). */
                        "text-foreground/70 hover:text-foreground"
                  )}
                >
                  <shop.icon aria-hidden="true" strokeWidth={1.5} className="size-3.5" />
                  {shop.label}
                </button>
              )
            })}
          </div>
        </ScrollReveal>

        <ScrollReveal delay={0.1} className="mt-10">
          <div
            key={example.id}
            className="mx-auto flex max-w-lg flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-raised sm:p-6"
          >
            {/* Post preview */}
            <div className="flex items-start gap-3 rounded-xl bg-awning p-3.5">
              <MessageCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-flame" />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  Today&rsquo;s post
                </p>
                <p className="mt-0.5 text-sm text-foreground">{example.sampleCaption}</p>
              </div>
            </div>

            {/* Q&A pair — same left-muted customer / right-indigo AI + "AI
                answered" chip convention as hero-phone.tsx / day-strip.tsx's
                11PM scene, so the in-app inbox metaphor stays consistent. */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-muted px-3.5 py-2.5 text-sm text-foreground">
                  {example.customerQ}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary/15 px-3.5 py-2.5 text-sm text-foreground">
                  {example.aiAnswer}
                </div>
                <span className="inline-flex items-center gap-1 pr-1 text-[11px] font-medium text-primary">
                  <Sparkles aria-hidden="true" className="size-3" />
                  AI answered
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 self-end pr-1 text-[11px] font-medium text-success">
                <CalendarCheck2 aria-hidden="true" className="size-3.5 shrink-0" />
                {example.bookedOutcome}
              </div>
            </div>

            {/* Till/receipt-style weekly result chip */}
            <div className="flex items-center gap-2 self-start rounded-full border border-dashed border-border bg-awning px-3.5 py-2">
              <Receipt aria-hidden="true" className="size-3.5 shrink-0 text-flame" />
              <span className="text-xs font-medium text-foreground">{example.weekResult}</span>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  )
}
