import { cn } from "@/lib/utils"

/**
 * The Lumina wordmark — "the shop light": the dot of the "i" is a tiny glowing
 * amber light rather than plain ink (brand-redesign-plan.md §5.1's "amber
 * light dot" motif, carried over from the LocalOS mark's dot-over-the-O).
 * Renders a dotless "ı" (U+0131) plus our own glow dot so there's no double
 * dot; the visible run is aria-hidden with a `sr-only` "Lumina" alongside so
 * screen readers still get the real word. Pure CSS/SVG, no image asset.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-flex items-baseline font-semibold tracking-tight", className)}>
      <span aria-hidden="true" className="inline-flex items-baseline">
        Lum
        <span className="relative inline-block">
          ı
          <span
            aria-hidden="true"
            className="glow-pulse absolute -top-[0.62em] left-1/2 size-[0.16em] -translate-x-1/2 rounded-full bg-amber-glow shadow-[0_0_6px_var(--amber-glow)]"
          />
        </span>
        na
      </span>
      <span className="sr-only">Lumina</span>
    </span>
  )
}
