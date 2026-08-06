/**
 * Lumina motion tokens — the single source for Framer Motion values.
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
  /** Interactive spring bezier — mirrors --ease-spring in globals.css; use for dnd-kit's string-based transitions. */
  spring: [0.34, 1.3, 0.64, 1],
} as const;

/** Per-word caption reveal cadence (Composer "generating" state). */
export const wordRevealMs = 30;

/** Micro-copy rotation cadence (Composer "generating" state, e.g. "Sketching layout…"). */
export const microCopyCycleMs = 550;

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

/** Studio "generate moment" lamplight pulse (Companion C2) — a single 600ms
 *  amber flash on the phone frame when a generation lands, layered
 *  alongside the existing brand `shadow-glow` pulse. A bespoke duration
 *  (not on the fast/base/slow scale) for this one signature moment — same
 *  rationale as `wordRevealMs`/`microCopyCycleMs`/`roomEnter` above. */
export const lamplightPulseS = 0.6;

/** Room transition (Companion shell) — the cinematic rise+scale a summoned
 *  room enters with (src/components/companion/room-transition.tsx). A
 *  bespoke, slightly slower-than-`base` duration for this one signature
 *  moment — mirrors how `wordRevealMs`/`microCopyCycleMs` above already live
 *  here as named constants outside the fast/base/slow scale. */
export const roomEnter = {
  duration: 0.28,
  ease: easing.out,
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
