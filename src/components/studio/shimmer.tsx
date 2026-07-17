"use client"

import type { ReactNode } from "react"
import { useReducedMotion } from "framer-motion"

import { cn } from "@/lib/utils"

/**
 * Text shimmer sweep (~1.8s loop) for "still generating" copy — a gradient
 * text mask that slides left-to-right. Pauses (falls back to a static muted
 * tone) under `prefers-reduced-motion`. Plain-DOM `<style>` keyframes,
 * matching the pattern in `src/components/aurora.tsx` — no global CSS edits
 * needed.
 */
export function Shimmer({ children, className }: { children: ReactNode; className?: string }) {
  const reduceMotion = useReducedMotion()

  return (
    <span
      className={cn(
        "studio-shimmer-text bg-clip-text text-transparent",
        reduceMotion && "studio-shimmer-text--static",
        className
      )}
    >
      {children}
      <style>{`
        .studio-shimmer-text {
          background-image: linear-gradient(
            90deg,
            var(--muted-foreground) 30%,
            var(--foreground) 50%,
            var(--muted-foreground) 70%
          );
          background-size: 200% 100%;
          animation: studio-shimmer-sweep 1.8s ease-in-out infinite;
        }
        .studio-shimmer-text--static {
          animation: none;
          background-image: none;
          -webkit-text-fill-color: var(--muted-foreground);
          color: var(--muted-foreground);
        }
        @keyframes studio-shimmer-sweep {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }
      `}</style>
    </span>
  )
}
