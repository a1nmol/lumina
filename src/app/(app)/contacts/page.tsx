import type { Metadata } from "next"
import { Users } from "lucide-react"

import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"

export const metadata: Metadata = { title: "Contacts" }

export default function ContactsPage() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader
        title="Contacts"
        description="Every lead and customer in one simple CRM."
      />
      <EmptyState
        icon={<Users aria-hidden="true" className="size-6" />}
        title="Build your customer list"
        description="Every lead and customer gets a contact record — synced automatically from content and FrontDesk."
        actionLabel="Add a contact"
      />
    </div>
  )
}
