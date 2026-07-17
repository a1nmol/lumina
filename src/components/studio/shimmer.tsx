"use client"

import type { CSSProperties, ReactNode } from "react"
import { useReducedMotion } from "framer-motion"

import { cn } from "@/lib/utils"

// The `studio-shimmer-sweep` keyframes live once in globals.css. This
// component only supplies the per-instance gradient + animation-name via
// inline style — no per-instance <style> tag injected on every render.
const SHIMMER_STYLE: CSSProperties = {
  backgroundImage:
    "linear-gradient(90deg, var(--muted-foreground) 30%, var(--foreground) 50%, var(--muted-foreground) 70%)",
  backgroundSize: "200% 100%",
  animation: "studio-shimmer-sweep 1.8s ease-in-out infinite",
}

const STATIC_STYLE: CSSProperties = {
  animation: "none",
  backgroundImage: "none",
  WebkitTextFillColor: "var(--muted-foreground)",
  color: "var(--muted-foreground)",
}

/**
 * Text shimmer sweep (~1.8s loop) for "still generating" copy — a gradient
 * text mask that slides left-to-right. Pauses (falls back to a static muted
 * tone) under `prefers-reduced-motion`.
 */
export function Shimmer({ children, className }: { children: ReactNode; className?: string }) {
  const reduceMotion = useReducedMotion()

  return (
    <span
      className={cn("bg-clip-text text-transparent", className)}
      style={reduceMotion ? STATIC_STYLE : SHIMMER_STYLE}
    >
      {children}
    </span>
  )
}
