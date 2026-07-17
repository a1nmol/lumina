// CSS-only aurora background — 4 layered blurred radial gradients built from
// brand tokens, animating `background-position` on a ~12s ease-in-out loop.
// Purely CSS-driven so the global `prefers-reduced-motion` rule in
// globals.css (which zeroes animation-duration for every element) freezes it
// automatically — no JS branching needed here.

export function AuroraBackground({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className ?? ""}`}
    >
      <div className="aurora-layer absolute inset-0 opacity-70 blur-3xl dark:opacity-50" />
      <style>{`
        .aurora-layer {
          background-image:
            radial-gradient(38% 38% at 18% 22%, var(--primary) 0%, transparent 70%),
            radial-gradient(34% 34% at 82% 18%, color-mix(in oklch, var(--primary), black 35%) 0%, transparent 70%),
            radial-gradient(42% 42% at 78% 82%, var(--chart-2) 0%, transparent 70%),
            radial-gradient(30% 30% at 22% 85%, color-mix(in oklch, var(--primary), var(--chart-2) 45%) 0%, transparent 70%);
          background-repeat: no-repeat;
          background-size: 140% 140%;
          animation: aurora-drift 12s ease-in-out infinite;
        }
        @keyframes aurora-drift {
          0%, 100% {
            background-position: 0% 0%, 100% 0%, 100% 100%, 0% 100%;
          }
          50% {
            background-position: 12% 10%, 88% 14%, 86% 88%, 14% 92%;
          }
        }
      `}</style>
    </div>
  )
}
