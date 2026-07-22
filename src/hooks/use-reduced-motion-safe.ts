"use client"

import * as React from "react"

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)"

function subscribe(callback: () => void) {
  const mediaQueryList = window.matchMedia(REDUCED_MOTION_QUERY)
  mediaQueryList.addEventListener("change", callback)
  return () => mediaQueryList.removeEventListener("change", callback)
}

function getSnapshot() {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches
}

function getServerSnapshot() {
  return false
}

/**
 * `prefers-reduced-motion` read via `useSyncExternalStore` (mirrors
 * src/hooks/use-mobile.ts) — `false` for the server render, the real
 * matchMedia value on the client. This is the "sanctioned escape hatch" the
 * react-hooks/set-state-in-effect lint rule wants for values only knowable
 * on the client (see use-mobile.ts's header comment) — a plain
 * `useState`+`useEffect` that calls `setState` in the effect body trips
 * that rule.
 *
 * Important limitation, by design: this hook alone is fine for callers that
 * only tweak ANIMATION PROPS on an already-decided subtree (framer-motion's
 * own `useReducedMotion()` covers that case too — keep using it for
 * hero-phone/lamps/scroll-reveal/wick). It is NOT sufficient on its own for
 * a STRUCTURAL switch (rendering an entirely different component subtree
 * depending on the answer) — `useSyncExternalStore`'s client snapshot is
 * read during the hydration render itself, so a real reduced-motion visitor
 * would see the "motion allowed" subtree hydrate first, then get swapped
 * out. Structural callers (day-strip.tsx's pinned-vs-stacked layout) must
 * pair this with a separate mount gate (src/hooks/use-mounted.ts) and only
 * honor this hook's value once that gate has flipped true — see
 * DayStripBody in src/components/marketing/day-strip.tsx for the pattern.
 */
export function useReducedMotionSafe(): boolean {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
