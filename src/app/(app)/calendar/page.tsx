import type { Metadata } from "next"
import { CalendarDays } from "lucide-react"

import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"

export const metadata: Metadata = { title: "Calendar" }

export default function CalendarPage() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader
        title="Calendar"
        description="Plan, drag-drop, and schedule posts across every channel."
      />
      <EmptyState
        icon={<CalendarDays aria-hidden="true" className="size-6" />}
        title="Plan your content calendar"
        description="Drag, drop, and schedule posts across every channel from one queue — drafts, reminders, and evergreen posts included."
        actionLabel="Schedule a post"
      />
    </div>
  )
}
