"use client"

import type { ReactNode } from "react"
import { usePathname } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"

import { roomEnter } from "@/lib/motion"

/**
 * Companion shell (C1) — each summoned "room" rises + scales in as a quick,
 * cinematic entrance (280ms, ease-out, transform/opacity only — GPU-friendly,
 * per DESIGN_SYSTEM.md's motion perf rule). Replaces the old sidebar shell's
 * plain fade+rise (RouteTransition) now that navigation is "summoning a
 * room" rather than switching a page in a chrome-heavy app. Reduced-motion:
 * instant, no transform at all.
 *
 * The Companion dock (src/components/companion/dock.tsx) is deliberately
 * rendered OUTSIDE this component in the app layout — this wrapper's
 * `motion.div` picks up an inline `transform` while animating, and CSS
 * `position: fixed` resolves against the nearest transformed ancestor, so
 * anything that must stay pinned across a room change (the dock) has to live
 * as a sibling, never a descendant, of this tree.
 */
export function RoomTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const reduceMotion = useReducedMotion()
  // Key on the ROOM (first path segment), not the full pathname (review fix):
  // settings/voice/brain sub-navigation must swap content inside the room
  // without remounting the whole settings shell + replaying the entrance.
  const roomKey = pathname.split("/")[1] || "home"

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={roomKey}
        initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduceMotion ? undefined : { opacity: 0, y: 8, scale: 0.99 }}
        transition={{ duration: reduceMotion ? 0 : roomEnter.duration, ease: roomEnter.ease }}
        className="flex min-h-0 flex-1 flex-col"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
