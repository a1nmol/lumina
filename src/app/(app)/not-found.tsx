// Shared 404 for every route under the (app) group — also what renders
// (inside the app shell, dock intact) whenever a page calls Next's
// notFound(), e.g. /admin and /wick-preview's isPlatformAdmin() gate.

import { Compass } from "lucide-react"

import { EmptyState } from "@/components/empty-state"

export default function AppNotFound() {
  return (
    <EmptyState
      icon={<Compass className="size-6" />}
      title="Can't find that page"
      description="It may have moved, or the link is out of date. Head back to the Command Center to keep going."
      actionLabel="Back to Command Center"
      actionHref="/dashboard"
    />
  )
}
