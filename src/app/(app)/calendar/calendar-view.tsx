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
          <div className="flex flex-wrap items-center gap-2">
            <EnablePushButton />
            <Tabs value={view} onValueChange={(value) => setView(value as ViewMode)}>
              <TabsList aria-label="Calendar view">
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
      ) : view === "month" ? (
        <MonthView posts={posts} onPostsChange={setPosts} isLive={isLive} />
      ) : view === "week" ? (
        <WeekView posts={posts} />
      ) : (
        <QueueView posts={posts} onPostsChange={setPosts} />
      )}
    </div>
  )
}
