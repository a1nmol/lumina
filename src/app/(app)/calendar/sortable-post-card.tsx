"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { format, parseISO } from "date-fns"
import { Info, Lock } from "lucide-react"
import { motion, useReducedMotion } from "framer-motion"

import { cn } from "@/lib/utils"
import { duration, easing, spring } from "@/lib/motion"

import type { DemoPost } from "./demo-posts"
import { PostCard } from "./post-card"

type SortablePostCardProps = {
  post: DemoPost
  /**
   * Opens the shared post-detail sheet (redesign wave R5 parity fix — month
   * was the one view whose cards couldn't open it). Only ever invoked from a
   * genuine pointer/touch click — see the button's onClick below — never
   * from the keyboard, which this card reserves for dnd-kit's drag pick-up/
   * drop, and never right after a real drag (MonthView arms a short
   * suppression window on drag start so the trailing click doesn't
   * double-fire as "open details").
   */
  onOpenDetail?: () => void
}

/** Draggable month-grid card: dnd-kit handles positioning, Framer Motion handles the pick-up/settle feel. */
export function SortablePostCard({ post, onOpenDetail }: SortablePostCardProps) {
  const reduceMotion = useReducedMotion()
  const isPosted = post.status === "posted"
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: post.id,
    disabled: isPosted,
    transition: {
      duration: duration.base * 1000,
      easing: `cubic-bezier(${easing.spring.join(",")})`,
    },
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: reduceMotion ? undefined : transition,
    zIndex: isDragging ? 20 : undefined,
  }

  const time = format(parseISO(post.date), "h:mm a")

  return (
    <div ref={setNodeRef} style={style} className={cn("group/postcard relative", isDragging && "opacity-30")}>
      <button
        type="button"
        {...(isPosted ? {} : attributes)}
        {...(isPosted ? {} : listeners)}
        onClick={
          onOpenDetail
            ? (event) => {
                // Posted (locked) cards have no drag capability to protect,
                // so any activation — mouse, touch, or keyboard — opens
                // details. Draggable cards reserve Enter/Space for dnd-kit's
                // pick-up/drop; only a genuine pointer click (event.detail
                // > 0 — keyboard-triggered clicks report 0) opens details.
                if (!isPosted && event.detail === 0) return
                onOpenDetail()
              }
            : undefined
        }
        aria-roledescription={isPosted ? undefined : "Draggable post"}
        aria-label={
          isPosted
            ? `${time} post. Posted — locked. Press space or enter for details.`
            : `${time} post. Press space or enter to pick up, then use arrow keys to move it to another day. Click for details.`
        }
        className={cn(
          "relative w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isPosted ? "cursor-default" : "cursor-grab touch-none active:cursor-grabbing"
        )}
      >
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: isDragging ? 1.03 : 1 }}
          transition={spring}
          className={isDragging ? "rounded-lg shadow-raised" : undefined}
        >
          <PostCard post={post} variant="compact" isDragging={isDragging} />
        </motion.div>
        {isPosted && (
          <span
            aria-hidden="true"
            className="absolute -top-1 -left-1 flex size-4 items-center justify-center rounded-full bg-card text-muted-foreground ring-1 ring-border"
          >
            <Lock className="size-2.5" />
          </span>
        )}
      </button>
      {!isPosted && onOpenDetail && (
        // Keyboard path to details (review fix): Enter/Space on the card is
        // owned by dnd-kit pick-up, so this separate focusable button carries
        // the details action — visually quiet until hover/focus.
        <button
          type="button"
          onClick={onOpenDetail}
          aria-label={`Open details for the ${time} post`}
          className="absolute -top-1 -right-1 z-10 flex size-4 items-center justify-center rounded-full bg-card text-muted-foreground opacity-0 ring-1 ring-border transition-opacity group-hover/postcard:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lamplight pointer-fine:opacity-0 [@media(pointer:coarse)]:opacity-70"
        >
          <Info className="size-2.5" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
