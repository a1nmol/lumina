import type { Metadata } from "next"
import Link from "next/link"
import { UserX } from "lucide-react"

import { Button } from "@/components/ui/button"

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
      <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
        <span
          aria-hidden="true"
          className="flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-primary/15 via-primary/5 to-[var(--chart-2)]/10 text-primary ring-1 ring-primary/10"
        >
          <UserX className="size-6" />
        </span>
        <div className="flex max-w-sm flex-col gap-1.5">
          <h3 className="text-base font-medium text-foreground">Contact not found</h3>
          <p className="text-sm text-muted-foreground">
            This contact may have been removed, or the link is out of date.
          </p>
        </div>
        <Button render={<Link href="/contacts" />}>Back to Contacts</Button>
      </div>
    )
  }

  return <ContactProfileView initialContact={data.contact} timeline={data.timeline} />
}
