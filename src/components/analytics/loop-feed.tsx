"use client"

import { motion, useReducedMotion } from "framer-motion"
import { Waypoints } from "lucide-react"

import { EmptyState } from "@/components/empty-state"
import { duration, easing, staggerContainer } from "@/lib/motion"
import type { LoopPair as LoopPairType } from "@/lib/types"

import { LoopPair } from "./loop-pair"

type LoopFeedProps = {
  pairs: LoopPairType[]
}

/** Reverse-chron feed of the Loop tab: roll-up stat strip + one LoopPair per matched post, newest first. */
export function LoopFeed({ pairs }: LoopFeedProps) {
  const reduceMotion = useReducedMotion()

  if (pairs.length === 0) {
    return (
      <EmptyState
        icon={<Waypoints aria-hidden="true" className="size-6" />}
        title="No matches yet"
        description="Publish a post and Lumina will show you exactly who it brought in."
        actionLabel="Go to Content Studio"
        actionHref="/studio"
      />
    )
  }

  const leadCount = pairs.reduce(
    (sum, pair) => sum + pair.outcomes.filter((outcome) => outcome.kind === "lead").length,
    0
  )
  const bookingCount = pairs.reduce(
    (sum, pair) => sum + pair.outcomes.filter((outcome) => outcome.kind === "booking").length,
    0
  )

  const sorted = [...pairs].sort(
    (a, b) => new Date(b.post.publishedAt).getTime() - new Date(a.post.publishedAt).getTime()
  )

  return (
    // Companion C3 — the Loop is the room's hero: the whole feed sits on one
    // raised stage panel (faint edge ring, soft card wash) instead of
    // floating loose against the page background, same center-stage
    // elevation Studio gave the phone pedestal in C2.
    <div className="flex flex-col gap-6 rounded-3xl bg-card/40 p-4 ring-1 ring-border/30 sm:p-6">
      <p className="text-sm text-muted-foreground">
        This {pairs.length === 1 ? "post" : "week"}:{" "}
        <span className="font-medium tabular-nums text-foreground">{pairs.length}</span>{" "}
        {pairs.length === 1 ? "post" : "posts"} drove{" "}
        <span className="font-medium tabular-nums text-foreground">{leadCount}</span>{" "}
        {leadCount === 1 ? "lead" : "leads"} and{" "}
        <span className="font-medium tabular-nums text-foreground">{bookingCount}</span>{" "}
        {bookingCount === 1 ? "booking" : "bookings"}.
      </p>

      <motion.div
        initial={reduceMotion ? false : "initial"}
        animate="animate"
        variants={reduceMotion ? undefined : staggerContainer}
        className="flex flex-col gap-6"
      >
        {sorted.map((pair) => (
          <motion.div
            key={pair.post.id}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: duration.base, ease: easing.out }}
          >
            <LoopPair pair={pair} />
          </motion.div>
        ))}
      </motion.div>
    </div>
  )
}
