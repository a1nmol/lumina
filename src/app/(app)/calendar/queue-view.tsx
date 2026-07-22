"use client"

import { useState } from "react"
import { parseISO } from "date-fns"

import { CopyCaptionButton, ReminderButton } from "@/components/calendar/reminder-button"
import { PostDetailSheet } from "@/components/calendar/post-detail-sheet"

import { dayKeyOfPost, queueHeading } from "./calendar-utils"
import type { DemoPost } from "./demo-posts"
import { PostCard } from "./post-card"

type QueueViewProps = {
  posts: DemoPost[]
  /** Lets the post-detail sheet's "Mark as posted" reflect immediately in the list above it. */
  onPostsChange?: (posts: DemoPost[]) => void
}

type QueueGroup = {
  key: string
  heading: string
  posts: DemoPost[]
}

/** Linear list grouped by day heading ("Today", "Tomorrow", then dates) — the reminder-to-post deep-link target. */
export function QueueView({ posts, onPostsChange }: QueueViewProps) {
  const [detailPostId, setDetailPostId] = useState<string | null>(null)

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

  const detailPost = detailPostId ? (posts.find((p) => p.id === detailPostId) ?? null) : null

  function handleMarkedPosted(postId: string) {
    onPostsChange?.(posts.map((post) => (post.id === postId ? { ...post, status: "posted" } : post)))
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
              <PostCard
                key={post.id}
                post={post}
                variant="full"
                onOpenDetail={() => setDetailPostId(post.id)}
                actions={
                  <>
                    <ReminderButton post={post} />
                    <CopyCaptionButton post={post} />
                  </>
                }
              />
            ))}
          </div>
        </div>
      ))}

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
