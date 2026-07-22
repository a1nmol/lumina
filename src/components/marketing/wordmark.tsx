import { cn } from "@/lib/utils"

/**
 * The LocalOS wordmark — "the shop light": a tiny amber dot perched over the
 * capital O in "OS" (brand-redesign-plan.md §5.1 "logo wordmark with a tiny
 * amber light dot over the 'O'"). Pure CSS/SVG, no image asset.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-flex items-baseline font-semibold tracking-tight", className)}>
      Local
      <span className="relative inline-block">
        O
        <span
          aria-hidden="true"
          className="glow-pulse absolute -top-[0.55em] left-1/2 size-[0.22em] -translate-x-1/2 rounded-full bg-amber-glow shadow-[0_0_6px_var(--amber-glow)]"
        />
      </span>
      S
    </span>
  )
}
