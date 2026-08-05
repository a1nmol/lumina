"use client"

import { eachDayOfInterval, endOfWeek, format, isToday, startOfWeek } from "date-fns"

import { EmptyState } from "@/components/empty-state"
import { cn } from "@/lib/utils"

import { groupPostsByDayKey } from "./calendar-utils"
import type { DemoPost } from "./demo-posts"
import { PostCard } from "./post-card"

type WeekViewProps = {
  posts: DemoPost[]
}

/** Current week, 7 columns (stacked on mobile) — fuller cards with caption + time + platform badges. */
export function WeekView({ posts }: WeekViewProps) {
  const today = new Date()
  const days = eachDayOfInterval({
    start: startOfWeek(today, { weekStartsOn: 0 }),
    end: endOfWeek(today, { weekStartsOn: 0 }),
  })
  const grouped = groupPostsByDayKey(posts)

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
            <div className="flex min-h-24 flex-col gap-2 rounded-xl border border-dashed border-border/70 p-2">
              {dayPosts.length === 0 ? (
                <EmptyState compact title="No posts" description="" className="flex-1 border-none py-3" />
              ) : (
                dayPosts.map((post) => <PostCard key={post.id} post={post} variant="full" />)
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
