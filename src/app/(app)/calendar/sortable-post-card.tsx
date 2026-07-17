"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { format, parseISO } from "date-fns"
import { motion, useReducedMotion } from "framer-motion"

import { spring } from "@/lib/motion"

import type { DemoPost } from "./demo-posts"
import { PostCard } from "./post-card"

type SortablePostCardProps = {
  post: DemoPost
}

/** Draggable month-grid card: dnd-kit handles positioning, Framer Motion handles the pick-up/settle feel. */
export function SortablePostCard({ post }: SortablePostCardProps) {
  const reduceMotion = useReducedMotion()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: post.id,
    transition: { duration: 250, easing: "cubic-bezier(0.34, 1.3, 0.64, 1)" },
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
        {...attributes}
        {...listeners}
        aria-roledescription="Draggable post"
        aria-label={`${time} post. Press space or enter to pick up, then use arrow keys to move it to another day.`}
        className="w-full cursor-grab touch-none rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
      >
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: isDragging ? 1.03 : 1 }}
          transition={spring}
          className={isDragging ? "rounded-lg shadow-raised" : undefined}
        >
          <PostCard post={post} variant="compact" isDragging={isDragging} />
        </motion.div>
      </button>
    </div>
  )
}
