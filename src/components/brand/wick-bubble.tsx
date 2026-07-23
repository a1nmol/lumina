"use client"

/**
 * WickBubble — shared speech-bubble UI for every place Wick "talks": the
 * landing-page scroll guide (wick-guide.tsx) and the hero's own scroll
 * teaser (hero.tsx). Same visual language everywhere — a small rounded card
 * anchored beside him, an optional typing-dots preamble before a per-word
 * reveal, an optional dismiss (X) button, and a `side` ("left"/"right")
 * that flips which edge the card opens from and where its little pointer
 * tail sits.
 *
 * Content-agnostic by design: callers own WHEN it mounts (conditional
 * render + a stable `key` per distinct message, typically inside
 * `AnimatePresence`, so a new message always types in fresh) and WHAT it
 * says. This file only owns HOW it looks and types.
 *
 * `instant` — skips the typing-dots + per-word reveal in favor of a quick
 * fade/slide, full text immediately. Used for hover-hint swaps (see
 * wick-guide.tsx's `data-wick-hint` mechanism), where re-running the whole
 * typing performance on every hover would feel sluggish, and for any
 * re-display of a message the visitor has already fully seen once.
 */

import { useEffect, useMemo, useState } from "react"
import { motion, type Transition } from "framer-motion"
import { X } from "lucide-react"

import { duration, easing, springGentle, wordRevealMs } from "@/lib/motion"
import { cn } from "@/lib/utils"

/** Typing-dots phase before text starts appearing — "he's about to talk". */
const TYPING_DOTS_MS = 350

export type WickBubbleProps = {
  text: string
  /** Which side of Wick the bubble opens toward. */
  side: "left" | "right"
  reduceMotion: boolean
  /** Renders a small X dismiss button when provided. */
  onDismiss?: () => void
  /** Bubble width cap, px. Defaults to 200 (the original guide size). */
  maxWidthPx?: number
  /** Skip typing entirely — quick fade/slide instead. See file doc. */
  instant?: boolean
  className?: string
}

export function WickBubble({
  text,
  side,
  reduceMotion,
  onDismiss,
  maxWidthPx = 200,
  instant = false,
  className,
}: WickBubbleProps) {
  const words = useMemo(() => text.split(" "), [text])
  // Frozen at first render (lazy `useState` initializer, setter never
  // called) — deliberately NOT read live on every render. A caller may
  // legitimately flip `instant`/`reduceMotion` on a component instance
  // that's already mounted and mid-typing (e.g. wick-guide.tsx marking a
  // bubble "already seen" shortly after it appears, for the NEXT time that
  // same key shows) — if the typing effects below reacted to that live
  // value, the dependency-array re-run would cancel whatever timer was
  // already in flight and permanently freeze the reveal mid-sentence. Only
  // the value present at THIS instance's first render should ever decide
  // whether it types at all — matches the file doc's contract ("this
  // component's whole lifetime is exactly one message's").
  const [skipTyping] = useState(() => reduceMotion || instant)
  const [phase, setPhase] = useState<"dots" | "typing">(skipTyping ? "typing" : "dots")
  const [revealed, setRevealed] = useState(skipTyping ? words.length : 0)

  useEffect(() => {
    if (skipTyping) return
    const t = setTimeout(() => setPhase("typing"), TYPING_DOTS_MS)
    return () => clearTimeout(t)
  }, [skipTyping])

  useEffect(() => {
    if (skipTyping || phase !== "typing") return
    if (revealed >= words.length) return
    const t = setTimeout(() => setRevealed((n) => n + 1), wordRevealMs)
    return () => clearTimeout(t)
  }, [phase, revealed, words.length, skipTyping])

  const isLeft = side === "left"

  const initial = reduceMotion
    ? false
    : instant
      ? { opacity: 0, x: isLeft ? 4 : -4 }
      : { opacity: 0, x: isLeft ? 8 : -8, scale: 0.9 }
  const transition: Transition = reduceMotion
    ? { duration: 0 }
    : instant
      ? { duration: duration.fast, ease: easing.out }
      : springGentle

  return (
    <motion.div
      role="note"
      aria-live="off"
      initial={initial}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={
        reduceMotion
          ? { opacity: 0 }
          : { opacity: 0, scale: 0.96, transition: { duration: duration.fast, ease: easing.out } }
      }
      transition={transition}
      style={{ width: maxWidthPx, maxWidth: maxWidthPx }}
      className={cn(
        "pointer-events-auto absolute top-1/2 -translate-y-1/2 rounded-xl border border-border bg-card px-3 py-2.5 text-xs leading-snug text-card-foreground shadow-raised",
        isLeft ? "right-full mr-3" : "left-full ml-3",
        className
      )}
    >
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss guide"
          className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-soft transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <X className="size-3" aria-hidden="true" />
        </button>
      )}
      {reduceMotion || phase === "typing" ? (
        <span>{reduceMotion ? text : words.slice(0, revealed).join(" ")}</span>
      ) : (
        <TypingDots />
      )}
      {/* Tiny tail pointing at Wick. */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-1/2 size-3 -translate-y-1/2 rotate-45 rounded-[2px] border-border bg-card",
          isLeft ? "-right-1.5 border-t border-r" : "-left-1.5 border-b border-l"
        )}
      />
    </motion.div>
  )
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <motion.span
          key={index}
          className="size-1.5 rounded-full bg-muted-foreground"
          animate={{ y: [0, -3, 0] }}
          transition={{ duration: 0.5, repeat: Infinity, delay: index * 0.12, ease: easing.inOut }}
        />
      ))}
    </span>
  )
}
