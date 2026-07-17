"use client"

import { useState } from "react"
import { CalendarDays } from "lucide-react"

import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { DEMO_POSTS, type DemoPost } from "./demo-posts"
import { MonthView } from "./month-view"
import { QueueView } from "./queue-view"
import { WeekView } from "./week-view"

type ViewMode = "month" | "week" | "queue"

/** Calendar/Queue page shell: view segmented control + month/week/queue surfaces over shared post state. */
export function CalendarView() {
  const [posts, setPosts] = useState<DemoPost[]>(DEMO_POSTS)
  const [view, setView] = useState<ViewMode>("month")

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader
        title="Calendar"
        description="Plan, drag-drop, and schedule posts across every channel."
        actions={
          <Tabs value={view} onValueChange={(value) => setView(value as ViewMode)}>
            <TabsList aria-label="Calendar view">
              <TabsTrigger value="month">Month</TabsTrigger>
              <TabsTrigger value="week">Week</TabsTrigger>
              <TabsTrigger value="queue">Queue</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      {posts.length === 0 ? (
        <EmptyState
          icon={<CalendarDays aria-hidden="true" className="size-6" />}
          title="Plan your content calendar"
          description="Drag, drop, and schedule posts across every channel from one queue — drafts, reminders, and evergreen posts included."
          actionLabel="Schedule a post"
          actionHref="/studio"
        />
      ) : view === "month" ? (
        <MonthView posts={posts} onPostsChange={setPosts} />
      ) : view === "week" ? (
        <WeekView posts={posts} />
      ) : (
        <QueueView posts={posts} />
      )}
    </div>
  )
}
