// Hero phone mockup — static v1 (brand-redesign-plan.md §5.2 / Gate 2 spec):
// steps ③④⑤ of the copy deck's 5-step loop, stacked as real chat bubbles +
// a calendar chip. Bezel styling adapted from src/components/studio/phone-
// frame.tsx (lean marketing variant — no generate/idle states, this always
// renders the finished scene). Gate 3 will animate steps ①② in and scrub
// this into a real 4s loop; the seam is the `data-scene="hero-phone"` hook.

import { CalendarCheck2, Sparkles } from "lucide-react"

import { Wordmark } from "./wordmark"

export function HeroPhone() {
  return (
    <div className="mx-auto w-full max-w-[300px]" data-scene="hero-phone">
      <div className="relative overflow-hidden rounded-[2.25rem] border-[6px] border-white/10 bg-card shadow-overlay">
        {/* Notch */}
        <div
          aria-hidden="true"
          className="absolute top-2.5 left-1/2 z-20 h-4 w-20 -translate-x-1/2 rounded-full bg-background/90 ring-1 ring-white/10"
        />

        <div className="flex items-center gap-2 px-3 pt-8 pb-2">
          <span className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Sparkles aria-hidden="true" className="size-3.5" />
          </span>
          <div className="flex flex-col leading-none">
            <span className="text-xs font-semibold text-foreground">
              <Wordmark className="text-xs" />
            </span>
            <span className="text-[10px] text-muted-foreground">answering for Sunrise Bakery</span>
          </div>
        </div>

        <div className="flex min-h-[280px] flex-col justify-end gap-2.5 px-3 pb-4">
          {/* ③ Customer */}
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-2xl rounded-bl-md bg-muted px-3.5 py-2.5 text-[13px] text-foreground">
              Do you do birthday cakes for Saturday?
            </div>
          </div>

          {/* ④ LocalOS reply */}
          <div className="flex flex-col items-end gap-1">
            <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary/15 px-3.5 py-2.5 text-[13px] text-foreground">
              We do! Custom cakes are $45 with 48h notice — want me to book a Saturday pickup?
            </div>
            <span className="inline-flex items-center gap-1 pr-1 text-[10px] font-medium text-primary">
              <Sparkles aria-hidden="true" className="size-2.5" />
              AI answered
            </span>
          </div>

          {/* ⑤ Calendar chip fills */}
          <div className="flex justify-start pt-1">
            <div className="inline-flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-[12px] font-medium text-success">
              <CalendarCheck2 aria-hidden="true" className="size-3.5 shrink-0" />
              Sat 10:00 AM · Cake pickup ✓
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
