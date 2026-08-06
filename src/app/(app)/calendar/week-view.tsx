"use client"

import { useState } from "react"
import { eachDayOfInterval, endOfWeek, format, isToday, startOfWeek } from "date-fns"

import { PostDetailSheet } from "@/components/calendar/post-detail-sheet"
import { EmptyState } from "@/components/empty-state"
import { cn } from "@/lib/utils"

import { groupPostsByDayKey } from "./calendar-utils"
import type { DemoPost } from "./demo-posts"
import { PostCard } from "./post-card"

type WeekViewProps = {
  posts: DemoPost[]
  /** Lets the post-detail sheet's "Mark as posted" reflect immediately in the grid above it — mirrors QueueView's own onPostsChange. */
  onPostsChange?: (posts: DemoPost[]) => void
}

/**
 * Current week, 7 columns (stacked on mobile) — fuller cards with caption +
 * time + platform badges. Redesign wave R5 parity fix: cards now open the
 * same shared post-detail sheet Queue's cards do (audit finding: week was
 * read-only while month/queue weren't).
 */
export function WeekView({ posts, onPostsChange }: WeekViewProps) {
  const [detailPostId, setDetailPostId] = useState<string | null>(null)
  const today = new Date()
  const days = eachDayOfInterval({
    start: startOfWeek(today, { weekStartsOn: 0 }),
    end: endOfWeek(today, { weekStartsOn: 0 }),
  })
  const grouped = groupPostsByDayKey(posts)
  const detailPost = detailPostId ? (posts.find((post) => post.id === detailPostId) ?? null) : null

  function handleMarkedPosted(postId: string) {
    onPostsChange?.(posts.map((post) => (post.id === postId ? { ...post, status: "posted" } : post)))
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-7">
      {days.map((day) => {
        const key = format(day, "yyyy-MM-dd")
        const dayPosts = grouped.get(key) ?? []
        const current = isToday(day)

        return (
          <div key={key} className="flex min-w-0 flex-col gap-2">
            <div className="flex items-center justify-between px-0.5">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {format(day, "EEE")}
              </span>
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full text-xs font-medium tabular-nums",
                  current
                    ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
                    : "text-foreground"
                )}
              >
                {format(day, "d")}
              </span>
            </div>
            {/* Companion C3 — softened to the room's floating-panel language: a fainter dashed edge over a faint card wash instead of a flat bordered slot. */}
            <div className="flex min-h-24 flex-col gap-2 rounded-2xl border border-dashed border-border/50 bg-card/40 p-2">
              {dayPosts.length === 0 ? (
                <EmptyState compact title="No posts" description="" className="flex-1 border-none py-3" />
              ) : (
                dayPosts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    variant="full"
                    onOpenDetail={() => setDetailPostId(post.id)}
                  />
                ))
              )}
            </div>
          </div>
        )
      })}

      <PostDetailSheet
        post={detailPost}
        open={detailPostId !== null}
        onOpenChange={(open) => {
          if (!open) setDetailPostId(null)
        }}
        onMarkedPosted={handleMarkedPosted}
      />
    </div>
  )
}
