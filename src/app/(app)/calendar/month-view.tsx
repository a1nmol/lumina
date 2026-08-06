"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragCancelEvent,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable"
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  parseISO,
  set,
  startOfMonth,
  startOfWeek,
} from "date-fns"
import Link from "next/link"
import { Plus } from "lucide-react"
import { useReducedMotion } from "framer-motion"
import { toast } from "sonner"

import { PostDetailSheet } from "@/components/calendar/post-detail-sheet"
import { cn } from "@/lib/utils"

import { reschedulePost } from "./actions"
import { dayKeyOfPost } from "./calendar-utils"
import type { DemoPost } from "./demo-posts"
import { PostCard } from "./post-card"
import { SortablePostCard } from "./sortable-post-card"

const DAY_PREFIX = "day:"
const containerId = (dayKey: string) => `${DAY_PREFIX}${dayKey}`
const isContainerId = (id: string) => id.startsWith(DAY_PREFIX)
const dayKeyFromContainerId = (id: string) => id.slice(DAY_PREFIX.length)
const headingFromKey = (key: string) => format(parseISO(`${key}T00:00:00`), "EEEE, MMMM d")

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

type MonthViewProps = {
  posts: DemoPost[]
  onPostsChange: (posts: DemoPost[]) => void
  /** True when `posts` are real Supabase content_items — persists cross-day moves via reschedulePost. */
  isLive?: boolean
}

/** Month calendar grid with full dnd-kit drag-drop: between days, reorder within a day, keyboard-accessible. */
export function MonthView({ posts, onPostsChange, isLive = false }: MonthViewProps) {
  const reduceMotion = useReducedMotion()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  // Redesign wave R5 parity fix: month cards now open the same post-detail
  // sheet Queue's cards do. suppressClickRef guards against the click event
  // that (in some browsers) still fires on a card right after a real
  // pointer drag ends — armed on drag start, cleared shortly after drag
  // end/cancel, so a genuine drag never also pops the detail sheet open.
  const [detailPostId, setDetailPostId] = useState<string | null>(null)
  const suppressClickRef = useRef(false)
  const suppressClickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear any pending suppress window on unmount (review nit) — the ref
  // itself is harmless post-unmount, but dangling timers are untidy.
  useEffect(() => {
    return () => {
      if (suppressClickTimeoutRef.current) clearTimeout(suppressClickTimeoutRef.current)
    }
  }, [])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const { monthStart, days } = useMemo(() => {
    const start = startOfMonth(new Date())
    const gridStart = startOfWeek(start, { weekStartsOn: 0 })
    const gridEnd = endOfWeek(endOfMonth(start), { weekStartsOn: 0 })
    return { monthStart: start, days: eachDayOfInterval({ start: gridStart, end: gridEnd }) }
  }, [])

  const postsByDay = useMemo(() => {
    const map = new Map<string, DemoPost[]>()
    for (const post of posts) {
      const key = dayKeyOfPost(post)
      const list = map.get(key)
      if (list) list.push(post)
      else map.set(key, [post])
    }
    return map
  }, [posts])

  const activePost = activeId ? (posts.find((p) => p.id === activeId) ?? null) : null

  const announcements: Announcements = useMemo(
    () => ({
      onDragStart({ active }: DragStartEvent) {
        const post = posts.find((p) => p.id === active.id)
        if (!post) return undefined
        return `Picked up post scheduled for ${format(parseISO(post.date), "EEEE, MMMM d 'at' h:mm a")}.`
      },
      onDragOver({ active, over }: DragOverEvent) {
        if (!over) return "Post is no longer over a day."
        const overIdStr = String(over.id)
        const targetKey = isContainerId(overIdStr)
          ? dayKeyFromContainerId(overIdStr)
          : dayKeyOfPost(
              posts.find((p) => p.id === overIdStr) ?? posts.find((p) => p.id === active.id)!
            )
        return `Post is over ${headingFromKey(targetKey)}.`
      },
      onDragEnd({ active, over }: DragEndEvent) {
        const post = posts.find((p) => p.id === active.id)
        if (!post || !over) return "Post reschedule cancelled."
        const overIdStr = String(over.id)
        const targetKey = isContainerId(overIdStr)
          ? dayKeyFromContainerId(overIdStr)
          : dayKeyOfPost(posts.find((p) => p.id === overIdStr) ?? post)
        return `Post moved to ${headingFromKey(targetKey)}.`
      },
      onDragCancel({ active }: DragCancelEvent) {
        const post = posts.find((p) => p.id === active.id)
        return post ? "Reschedule cancelled. Post returned to its original day." : undefined
      },
    }),
    [posts]
  )

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
    suppressClickRef.current = true
    if (suppressClickTimeoutRef.current) clearTimeout(suppressClickTimeoutRef.current)
    // Cleared shortly after the drag settles — long enough to swallow the
    // trailing click some browsers still fire on drop, short enough to never
    // affect the NEXT unrelated click.
    suppressClickTimeoutRef.current = setTimeout(() => {
      suppressClickRef.current = false
    }, 300)
  }

  const handleOpenDetail = useCallback((postId: string) => {
    if (suppressClickRef.current) return
    setDetailPostId(postId)
  }, [])

  function handleMarkedPosted(postId: string) {
    onPostsChange(posts.map((post) => (post.id === postId ? { ...post, status: "posted" } : post)))
  }

  function handleDragOver(event: DragOverEvent) {
    setOverId(event.over ? String(event.over.id) : null)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)
    setOverId(null)
    if (!over) return

    const activeIdStr = String(active.id)
    const overIdStr = String(over.id)
    const draggedPost = posts.find((p) => p.id === activeIdStr)
    if (!draggedPost) return

    const originDayKey = dayKeyOfPost(draggedPost)
    let targetDayKey: string
    let overPostId: string | null = null

    if (isContainerId(overIdStr)) {
      targetDayKey = dayKeyFromContainerId(overIdStr)
    } else {
      const overPost = posts.find((p) => p.id === overIdStr)
      if (!overPost) return
      targetDayKey = dayKeyOfPost(overPost)
      overPostId = overPost.id
    }

    if (targetDayKey === originDayKey && overPostId === activeIdStr) return

    const next = [...posts]
    const fromIndex = next.findIndex((p) => p.id === activeIdStr)
    const [moved] = next.splice(fromIndex, 1)

    let updated = moved
    if (targetDayKey !== originDayKey) {
      // Rebuild on the target day using the original date's wall-clock
      // hours/minutes/seconds, then serialize back to a real UTC ISO string
      // — string-splicing a bare "yyyy-MM-ddTHH:mm:ss" (no offset) here would
      // leave DemoPost.date ambiguous about which timezone it's in.
      const originalDate = parseISO(moved.date)
      const targetDay = parseISO(`${targetDayKey}T00:00:00`)
      const rebuilt = set(targetDay, {
        hours: originalDate.getHours(),
        minutes: originalDate.getMinutes(),
        seconds: originalDate.getSeconds(),
      })
      updated = { ...moved, date: rebuilt.toISOString() }
    }

    let insertAt: number
    if (overPostId) {
      insertAt = next.findIndex((p) => p.id === overPostId)
      if (insertAt === -1) insertAt = next.length
    } else {
      let lastIndex = -1
      next.forEach((p, i) => {
        if (dayKeyOfPost(p) === targetDayKey) lastIndex = i
      })
      insertAt = lastIndex === -1 ? next.length : lastIndex + 1
    }

    const previousPosts = posts
    next.splice(insertAt, 0, updated)
    onPostsChange(next)

    if (targetDayKey !== originDayKey) {
      toast.success(`Moved to ${format(parseISO(`${targetDayKey}T00:00:00`), "EEE, MMM d")}`)

      if (isLive) {
        reschedulePost(updated.id, updated.date)
          .then((result) => {
            if (!result.ok) {
              onPostsChange(previousPosts)
              toast.error("Couldn't save the new date", {
                description: "Reverted — please try again.",
              })
            }
          })
          .catch(() => {
            onPostsChange(previousPosts)
            toast.error("Couldn't save the new date", {
              description: "Reverted — please try again.",
            })
          })
      }
    }
  }

  const detailPost = detailPostId ? (posts.find((p) => p.id === detailPostId) ?? null) : null

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          setActiveId(null)
          setOverId(null)
        }}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              "To pick up a post, press space or enter. While dragging, use the arrow keys to move it to another day or position. Press space or enter again to drop the post, or press escape to cancel.",
          },
        }}
      >
        <div className="overflow-x-auto">
          {/* Companion C3 — the month grid as the room's floating centerpiece
              panel: dropped the hard border for a faint edge ring + a
              stronger raised shadow, same language as Inbox's panes/Studio's
              phone pedestal (C2). */}
          <div className="min-w-[640px] overflow-hidden rounded-2xl bg-card shadow-overlay ring-1 ring-border/40">
            <div className="grid grid-cols-7 border-b border-border/70">
              {WEEKDAY_LABELS.map((label) => (
                <div
                  key={label}
                  className="px-2 py-2.5 text-center text-xs font-medium tracking-wide text-muted-foreground uppercase"
                >
                  {label}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day) => {
                const dayKey = format(day, "yyyy-MM-dd")
                const dayPosts = postsByDay.get(dayKey) ?? []
                return (
                  <DayCell
                    key={dayKey}
                    day={day}
                    dayKey={dayKey}
                    posts={dayPosts}
                    isCurrentMonth={isSameMonth(day, monthStart)}
                    isToday={isToday(day)}
                    overId={overId}
                    activeId={activeId}
                    onOpenDetail={handleOpenDetail}
                  />
                )
              })}
            </div>
          </div>
        </div>

        <DragOverlay dropAnimation={reduceMotion ? null : undefined}>
          {activePost ? (
            <div className="w-12 scale-[1.03] rounded-lg shadow-overlay">
              <PostCard post={activePost} variant="compact" isDragging />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <PostDetailSheet
        post={detailPost}
        open={detailPostId !== null}
        onOpenChange={(open) => {
          if (!open) setDetailPostId(null)
        }}
        onMarkedPosted={handleMarkedPosted}
      />
    </>
  )
}

type DayCellProps = {
  day: Date
  dayKey: string
  posts: DemoPost[]
  isCurrentMonth: boolean
  isToday: boolean
  overId: string | null
  activeId: string | null
  onOpenDetail: (postId: string) => void
}

const DayCell = memo(function DayCell({
  day,
  dayKey,
  posts,
  isCurrentMonth,
  isToday: today,
  overId,
  activeId,
  onOpenDetail,
}: DayCellProps) {
  const { setNodeRef, isOver } = useDroppable({ id: containerId(dayKey) })
  const items = useMemo(() => posts.map((p) => p.id), [posts])
  const isDragActive = activeId !== null
  const showTrailingLine =
    isDragActive &&
    posts.length > 0 &&
    (overId === containerId(dayKey) || (isOver && overId !== null && !items.includes(overId)))

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group/day relative flex min-h-28 flex-col gap-1.5 border-r border-b border-border/70 p-1.5 transition-colors duration-150 last:border-r-0 sm:min-h-32",
        !isCurrentMonth && "bg-muted/30",
        isOver && "bg-primary/5"
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "flex size-6 items-center justify-center rounded-full text-xs font-medium tabular-nums",
            today
              ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
              : isCurrentMonth
                ? "text-foreground"
                : "text-muted-foreground/50"
          )}
        >
          {format(day, "d")}
        </span>
        <Link
          href="/studio"
          aria-label={`Create a post for ${format(day, "EEEE, MMMM d")}`}
          className="flex size-5 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity duration-150 hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/day:opacity-100"
        >
          <Plus aria-hidden="true" className="size-3.5" />
        </Link>
      </div>

      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <div className="flex flex-1 flex-col gap-2">
          {posts.map((post) => (
            <div key={post.id} className="relative">
              {isDragActive && overId === post.id && activeId !== post.id && (
                <span
                  aria-hidden="true"
                  className="absolute -top-1 right-0 left-0 h-0.5 rounded-full bg-primary"
                />
              )}
              <SortablePostCard post={post} onOpenDetail={() => onOpenDetail(post.id)} />
            </div>
          ))}
          {showTrailingLine && (
            <span aria-hidden="true" className="-mt-1 h-0.5 rounded-full bg-primary" />
          )}
        </div>
      </SortableContext>
    </div>
  )
})
