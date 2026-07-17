/**
 * LocalOS motion tokens — the single source for Framer Motion values.
 * Mirrors the CSS motion tokens in globals.css (fast 150ms / base 250ms / slow 400ms).
 * Always pair animated components with `useReducedMotion` from framer-motion.
 */

export const duration = {
  fast: 0.15,
  base: 0.25,
  slow: 0.4,
} as const;

export const easing = {
  out: [0.16, 1, 0.3, 1],
  inOut: [0.65, 0, 0.35, 1],
} as const;

/** Interactive spring — buttons, toggles, drag, hover lifts. */
export const spring = {
  type: "spring",
  stiffness: 500,
  damping: 32,
  mass: 0.8,
} as const;

/** Gentle spring — cards, panels, layout transitions. */
export const springGentle = {
  type: "spring",
  stiffness: 260,
  damping: 30,
} as const;

/** Standard enter: fade + rise. */
export const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 4 },
  transition: { duration: duration.base, ease: easing.out },
} as const;

/** Staggered list container. */
export const staggerContainer = {
  animate: { transition: { staggerChildren: 0.05 } },
} as const;
