"use client"

// Section 12 · PICK YOUR SHOP — landing-copy.md §12, brand-redesign-plan.md
// §5.9. A tablist of pill tabs (pattern borrowed from
// src/components/studio/format-segmented.tsx) drives shop-context.tsx's
// selected vertical, which problem.tsx and outcome-cards.tsx already
// consume. This section additionally renders its own small live demo — a
// mini showcase trio (Track D, next-wave-worklist.md §D): a post preview,
// a customer Q&A pair (answered in the same left-muted/right-indigo +
// "AI answered" chip convention as the in-app inbox / hero-phone / day-
// strip's 11PM scene), and a till/receipt-style weekly result chip — so
// the swap is fully legible without scrolling back up.
//
// Landing-compression pass (Track C, next-wave-worklist.md): the demo used
// to be a plain bordered card — "a stack of generic boxes" next to the
// hero's actual phone mockup. It now reuses hero-phone.tsx's device-frame
// *vocabulary* (rounded-[2.5rem] shell, the same color-mix bezel border +
// shadow-raised recipe, a slim header bar) so the two artifacts read as one
// family — "this is the real product" — without importing or coupling to
// hero-phone.tsx itself (that file owns its own animated timeline; this is
// a static, tab-driven mini-scene). Height budget: the old layout stacked
// five full-width blocks (post preview, customer bubble, AI bubble +
// label, booked-outcome line, weekly chip). It's now three stacked groups
// — a Q&A thread, then a two-column row (post preview | booked-outcome
// chip) that only stacks on mobile, then the weekly chip — which trims
// roughly a whole block's height back at sm+ (~25-30% shorter) while
// staying single-column (unchanged) on small screens.

import { useRef, type KeyboardEvent } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { CalendarCheck2, MessageCircle, Receipt, Sparkles } from "lucide-react"

import { duration, easing } from "@/lib/motion"
import { cn } from "@/lib/utils"

import { ScrollReveal } from "./scroll-reveal"
import { Wordmark } from "./wordmark"
import { SHOP_EXAMPLES } from "@/lib/marketing/shop-examples"
import { useShopExample } from "./shop-context"

export function ShopPicker() {
  const { vertical, example, setVertical } = useShopExample()
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([])
  const reduceMotion = useReducedMotion()

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
            role="tablist"
            aria-label="Pick your shop type"
            onKeyDown={handleKeyDown}
            className="inline-flex h-11 w-fit flex-wrap items-center justify-center gap-1 rounded-xl bg-muted p-1 text-muted-foreground"
          >
            {SHOP_EXAMPLES.map((shop, index) => {
              const isSelected = shop.id === vertical
              return (
                <button
                  key={shop.id}
                  id={`shop-tab-${shop.id}`}
                  ref={(el) => {
                    buttonRefs.current[index] = el
                  }}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  aria-controls="shop-picker-panel"
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
          {/* Phone shell — same rounded-[2.5rem] / color-mix bezel / shadow-
              raised recipe as hero-phone.tsx's PhoneShell, reused (not
              imported) since this scene is static/tab-driven rather than
              timeline-animated. The header bar is this demo's own "this is
              the product" signal: wordmark + "Front desk" + the active
              trade name. */}
          <div className="mx-auto max-w-lg">
            <div
              className="relative overflow-hidden rounded-[2.5rem] bg-card shadow-raised"
              style={{
                border: "7px solid color-mix(in oklch, var(--foreground) 14%, transparent)",
                boxShadow:
                  "var(--shadow-raised), inset 0 0 0 1px color-mix(in oklch, var(--foreground) 6%, transparent)",
              }}
            >
              <div className="flex items-center gap-2 border-b border-border/60 px-5 py-3 sm:px-6">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <Sparkles aria-hidden="true" className="size-3.5" />
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Wordmark className="text-xs" />
                  <span aria-hidden="true" className="text-muted-foreground">
                    ·
                  </span>
                  <span className="truncate">Front desk · {example.label}</span>
                </span>
              </div>

              {/* Demo content — cross-fades between trades inside the
                  stable frame instead of hard-remounting the whole card. */}
              <div
                id="shop-picker-panel"
                role="tabpanel"
                aria-labelledby={`shop-tab-${vertical}`}
                className="relative overflow-hidden px-5 py-5 sm:px-6 sm:py-6"
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={example.id}
                    initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
                    transition={{ duration: reduceMotion ? 0 : duration.base, ease: easing.out }}
                    className="flex flex-col gap-3"
                  >
                    {/* Q&A pair — same left-muted customer / right-indigo AI
                        + "AI answered" chip convention as hero-phone.tsx /
                        day-strip.tsx's 11PM scene, so the in-app inbox
                        metaphor stays consistent. */}
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
                    </div>

                    {/* Post preview + booked outcome — side by side at sm+
                        (the density pass), stacked on mobile. */}
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      <div className="flex items-start gap-2.5 rounded-xl bg-awning p-3">
                        <MessageCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-flame" />
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                            Today&rsquo;s post
                          </p>
                          <p className="mt-0.5 text-sm text-foreground">{example.sampleCaption}</p>
                        </div>
                      </div>

                      {/* Ink text on the booked-outcome chip (not
                          text-success) — same AA-safe pattern as the
                          calendar chip in hero-phone.tsx: --success text
                          alone is borderline in dark mode, so hierarchy
                          comes from the icon color + ring instead. */}
                      <div className="flex items-center gap-2.5 rounded-xl border border-success/30 bg-success/10 px-3 py-2.5">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-success/15 ring-1 ring-success/30">
                          <CalendarCheck2 aria-hidden="true" className="size-3.5 text-success" />
                        </span>
                        <p className="min-w-0 text-xs font-medium text-foreground">{example.bookedOutcome}</p>
                      </div>
                    </div>

                    {/* Till/receipt-style weekly result chip */}
                    <div className="flex items-center gap-2 self-center rounded-full border border-dashed border-border bg-awning px-3.5 py-2">
                      <Receipt aria-hidden="true" className="size-3.5 shrink-0 text-flame" />
                      <span className="text-xs font-medium text-foreground">{example.weekResult}</span>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>

          <span aria-live="polite" className="sr-only">
            Showing example for {example.label}
          </span>
        </ScrollReveal>
      </div>
    </section>
  )
}
