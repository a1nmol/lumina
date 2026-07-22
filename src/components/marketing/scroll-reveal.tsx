"use client"

// Shared enter-on-scroll wrapper for marketing sections (Gate 2, static-
// first). Every section uses this instead of hand-rolling its own
// whileInView/reduced-motion boilerplate. Gate 3 will layer pinned scroll
// scenes on top via the `data-scene` attribute already on each section —
// this component is intentionally simple (fade + rise once, no scrubbing)
// so it doesn't fight that future work.

import type { ReactNode } from "react"
import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion"

import { duration, easing } from "@/lib/motion"
import { cn } from "@/lib/utils"

interface ScrollRevealProps
  extends Omit<HTMLMotionProps<"div">, "initial" | "whileInView" | "viewport" | "children"> {
  /** Stagger delay in seconds — for sequencing sibling reveals. */
  delay?: number
  as?: "div"
  children?: ReactNode
}

export function ScrollReveal({ className, delay = 0, children, ...props }: ScrollRevealProps) {
  const reduceMotion = useReducedMotion()

  if (reduceMotion) {
    return (
      <div className={cn(className)} {...(props as React.HTMLAttributes<HTMLDivElement>)}>
        {children}
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: duration.slow, ease: easing.out, delay }}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.div>
  )
}
