"use client"

import { useState } from "react"
import { CalendarDays } from "lucide-react"

import { EnablePushButton } from "@/components/calendar/enable-push-button"
import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { DEMO_POSTS, type DemoPost } from "./demo-posts"
import { MonthView } from "./month-view"
import { QueueView } from "./queue-view"
import { WeekView } from "./week-view"

type ViewMode = "month" | "week" | "queue"

type CalendarViewProps = {
  /** Server-fetched posts (real content_items) or DEMO_POSTS when Supabase isn't configured. */
  initialPosts?: DemoPost[]
  /** True when `initialPosts` came from Supabase — enables server-persisted drag reschedule. */
  isLive?: boolean
}

/** Calendar/Queue page shell: view segmented control + month/week/queue surfaces over shared post state. */
export function CalendarView({ initialPosts = DEMO_POSTS, isLive = false }: CalendarViewProps) {
  const [posts, setPosts] = useState<DemoPost[]>(initialPosts)
  const [view, setView] = useState<ViewMode>("month")

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader
        title="Calendar"
        description="Plan, drag-drop, and schedule posts across every channel."
        actions={
          // Companion C3 — "view tabs + reminders button restyle into the
          // room header line": both controls sit inside one floating chrome
          // cluster (soft card fill, faint edge ring) so they read as a
          // continuation of the slim room header above, rather than two
          // stray controls, e.g. src/components/companion/room-header.tsx.
          <div className="flex flex-wrap items-center gap-2 rounded-full bg-card/70 p-1 ring-1 ring-border/40 shadow-soft">
            <EnablePushButton className="rounded-full" />
            <Tabs value={view} onValueChange={(value) => setView(value as ViewMode)}>
              <TabsList aria-label="Calendar view" className="bg-muted/70">
                <TabsTrigger value="month">Month</TabsTrigger>
                <TabsTrigger value="week">Week</TabsTrigger>
                <TabsTrigger value="queue">Queue</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        }
      />

      {posts.length === 0 ? (
        <EmptyState
          icon={<CalendarDays aria-hidden="true" className="size-6" />}
          title="Plan your content calendar"
          description="Drag, drop, and schedule posts across every channel from one queue — drafts, reminders, and evergreen posts included."
          actionLabel="Schedule a post"
          actionHref="/studio"
          withWick
        />
      ) : (
        // Companion C3 — the room canvas: a barely-there morning wash
        // (.room-canvas-morning, tokens-only — see globals.css) behind
        // whichever view is active, so the month grid / week columns /
        // queue list all read as floating panels on Calendar's own surface,
        // the same method Inbox's three panes use in C2.
        <div className="room-canvas-morning flex-1 rounded-3xl p-2 sm:p-3">
          {view === "month" ? (
            <MonthView posts={posts} onPostsChange={setPosts} isLive={isLive} />
          ) : view === "week" ? (
            <WeekView posts={posts} onPostsChange={setPosts} />
          ) : (
            <QueueView posts={posts} onPostsChange={setPosts} />
          )}
        </div>
      )}
    </div>
  )
}
