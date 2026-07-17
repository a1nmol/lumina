import type { Metadata } from "next"

import { listContactsAction } from "./actions"
import { ContactsView } from "./contacts-view"

export const metadata: Metadata = { title: "Contacts" }

export default async function ContactsPage() {
  const { contacts, isLive } = await listContactsAction()

  return <ContactsView initialContacts={contacts} isLive={isLive} />
}
