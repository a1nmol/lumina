"use client"

import { parseISO } from "date-fns"

import { dayKeyOfPost, queueHeading } from "./calendar-utils"
import type { DemoPost } from "./demo-posts"
import { PostCard } from "./post-card"

type QueueViewProps = {
  posts: DemoPost[]
}

type QueueGroup = {
  key: string
  heading: string
  posts: DemoPost[]
}

/** Linear list grouped by day heading ("Today", "Tomorrow", then dates) — the reminder-to-post deep-link target. */
export function QueueView({ posts }: QueueViewProps) {
  const sorted = [...posts].sort((a, b) => a.date.localeCompare(b.date))
  const groups: QueueGroup[] = []

  for (const post of sorted) {
    const key = dayKeyOfPost(post)
    let group = groups.find((g) => g.key === key)
    if (!group) {
      group = { key, heading: queueHeading(parseISO(post.date)), posts: [] }
      groups.push(group)
    }
    group.posts.push(post)
  }

  if (groups.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
        No posts scheduled.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <div key={group.key} className="flex flex-col gap-2">
          <h3 className="px-0.5 text-sm font-semibold text-foreground">{group.heading}</h3>
          <div className="flex flex-col gap-2">
            {group.posts.map((post) => (
              <PostCard key={post.id} post={post} variant="full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
