"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { format, parseISO } from "date-fns"
import { Lock } from "lucide-react"
import { motion, useReducedMotion } from "framer-motion"

import { cn } from "@/lib/utils"
import { duration, easing, spring } from "@/lib/motion"

import type { DemoPost } from "./demo-posts"
import { PostCard } from "./post-card"

type SortablePostCardProps = {
  post: DemoPost
}

/** Draggable month-grid card: dnd-kit handles positioning, Framer Motion handles the pick-up/settle feel. */
export function SortablePostCard({ post }: SortablePostCardProps) {
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
    <div ref={setNodeRef} style={style} className={isDragging ? "opacity-30" : undefined}>
      <button
        type="button"
        {...(isPosted ? {} : attributes)}
        {...(isPosted ? {} : listeners)}
        aria-roledescription={isPosted ? undefined : "Draggable post"}
        aria-label={
          isPosted
            ? `${time} post. Posted — locked.`
            : `${time} post. Press space or enter to pick up, then use arrow keys to move it to another day.`
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
    </div>
  )
}
