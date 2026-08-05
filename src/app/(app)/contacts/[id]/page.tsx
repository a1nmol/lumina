import type { Metadata } from "next"
import { UserX } from "lucide-react"

import { EmptyState } from "@/components/empty-state"

import { getContactAction } from "../actions"
import { displayName } from "../utils"
import { ContactProfileView } from "./contact-profile-view"

type ContactProfilePageProps = {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: ContactProfilePageProps): Promise<Metadata> {
  const { id } = await params
  const { data } = await getContactAction(id)
  return { title: data ? displayName(data.contact) : "Contact" }
}

export default async function ContactProfilePage({ params }: ContactProfilePageProps) {
  const { id } = await params
  const { data } = await getContactAction(id)

  if (!data) {
    return (
      <EmptyState
        icon={<UserX className="size-6" />}
        title="Contact not found"
        description="This contact may have been removed, or the link is out of date."
        actionLabel="Back to Contacts"
        actionHref="/contacts"
      />
    )
  }

  return <ContactProfileView initialContact={data.contact} timeline={data.timeline} />
}
