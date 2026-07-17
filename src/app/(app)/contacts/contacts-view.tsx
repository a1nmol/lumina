"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { MessageCircle, MoreHorizontal, Plus, Search, Users, X } from "lucide-react"
import { toast } from "sonner"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { BookingDialog } from "@/components/booking-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { PageHeader } from "@/components/page-header"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { duration, easing } from "@/lib/motion"
import type { Contact, ContactStatus } from "@/lib/types"

import { AddContactDialog } from "./add-contact-dialog"
import { ContactDrawer } from "./contact-drawer"
import { CONTACT_STATUSES, CONTACT_STATUS_META, StatusPill } from "@/components/inbox/status-pill"
import { displayName, initials, relativeTime, SOURCE_META } from "./utils"

const MAX_VISIBLE_TAGS = 2

type ContactsViewProps = {
  initialContacts: Contact[]
  isLive: boolean
}

export function ContactsView({ initialContacts, isLive }: ContactsViewProps) {
  const [contacts, setContacts] = useState<Contact[]>(initialContacts)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<ContactStatus | "all">("all")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [bookingContact, setBookingContact] = useState<Contact | null>(null)
  const reduceMotion = useReducedMotion()

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return contacts.filter((contact) => {
      if (statusFilter !== "all" && contact.status !== statusFilter) return false
      if (!term) return true
      return (
        (contact.name?.toLowerCase().includes(term) ?? false) ||
        (contact.email?.toLowerCase().includes(term) ?? false) ||
        (contact.phone?.toLowerCase().includes(term) ?? false)
      )
    })
  }, [contacts, search, statusFilter])

  const selected = contacts.find((contact) => contact.id === selectedId) ?? null

  function handleCreated(contact: Contact) {
    setContacts((prev) => [contact, ...prev])
  }

  function handleContactChange(updated: Contact) {
    setContacts((prev) => prev.map((contact) => (contact.id === updated.id ? updated : contact)))
  }

  function handleCopy(value: string, label: string) {
    void navigator.clipboard.writeText(value)
    toast.success(`${label} copied`)
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader
        title="Contacts"
        description="Every lead and customer in one simple CRM."
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <Plus aria-hidden="true" data-icon="inline-start" />
            Add contact
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <InputGroup className="w-full sm:max-w-xs">
          <InputGroupAddon>
            <Search aria-hidden="true" className="size-4" />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, email, or phone"
            aria-label="Search contacts"
          />
        </InputGroup>

        <Select
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as ContactStatus | "all")}
        >
          <SelectTrigger className="w-full sm:w-40" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {CONTACT_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {CONTACT_STATUS_META[status].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {contacts.length === 0 ? (
        <EmptyContactsState onAdd={() => setAddOpen(true)} />
      ) : filtered.length === 0 ? (
        <NoSearchResults
          onClear={() => {
            setSearch("")
            setStatusFilter("all")
          }}
        />
      ) : (
        <>
          {/* Desktop / tablet: real table */}
          <div className="hidden overflow-hidden rounded-xl ring-1 ring-foreground/10 md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="py-3">Contact</TableHead>
                  <TableHead className="py-3">Source</TableHead>
                  <TableHead className="py-3">Status</TableHead>
                  <TableHead className="py-3">Tags</TableHead>
                  <TableHead className="py-3">Last activity</TableHead>
                  <TableHead className="py-3 text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((contact) => (
                  <ContactRow
                    key={contact.id}
                    contact={contact}
                    onOpen={() => setSelectedId(contact.id)}
                    onBook={() => setBookingContact(contact)}
                    onCopy={handleCopy}
                  />
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: card list */}
          <ul className="flex flex-col gap-2.5 md:hidden">
            {filtered.map((contact, index) => (
              <ContactCard
                key={contact.id}
                contact={contact}
                index={index}
                reduceMotion={reduceMotion}
                onOpen={() => setSelectedId(contact.id)}
                onBook={() => setBookingContact(contact)}
              />
            ))}
          </ul>
        </>
      )}

      <AddContactDialog open={addOpen} onOpenChange={setAddOpen} onCreated={handleCreated} />

      <ContactDrawer
        contact={selected}
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null)
        }}
        onContactChange={handleContactChange}
      />

      <BookingDialog
        contact={bookingContact}
        open={bookingContact !== null}
        onOpenChange={(open) => {
          if (!open) setBookingContact(null)
        }}
      />

      {!isLive && (
        <p className="sr-only" aria-live="polite">
          Showing demo contacts — connect Supabase to sync your real CRM.
        </p>
      )}
    </div>
  )
}

function TagChips({ tags }: { tags: string[] }) {
  if (tags.length === 0) return <span className="text-muted-foreground">—</span>

  const visible = tags.slice(0, MAX_VISIBLE_TAGS)
  const overflow = tags.length - visible.length

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
        >
          {tag}
        </span>
      ))}
      {overflow > 0 && (
        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          +{overflow}
        </span>
      )}
    </div>
  )
}

type RowProps = {
  contact: Contact
  onOpen: () => void
  onBook: () => void
  onCopy: (value: string, label: string) => void
}

function ContactRow({ contact, onOpen, onBook, onCopy }: RowProps) {
  const SourceIcon = SOURCE_META[contact.source].icon

  return (
    <TableRow
      onClick={onOpen}
      className="group/row cursor-pointer transition-colors hover:bg-muted/50"
    >
      <TableCell className="py-3.5">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onOpen()
          }}
          className="-m-1 flex items-center gap-3 rounded-lg p-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Avatar>
            <AvatarFallback>{initials(contact.name)}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-foreground">{displayName(contact)}</span>
            <span className="truncate text-xs text-muted-foreground">
              {contact.email ?? contact.phone ?? "No contact info"}
            </span>
          </div>
        </button>
      </TableCell>
      <TableCell className="py-3.5">
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <SourceIcon aria-hidden="true" className="size-3.5" />
          {SOURCE_META[contact.source].label}
        </span>
      </TableCell>
      <TableCell className="py-3.5">
        <StatusPill status={contact.status} />
      </TableCell>
      <TableCell className="py-3.5">
        <TagChips tags={contact.tags} />
      </TableCell>
      <TableCell className="py-3.5 text-muted-foreground">
        {relativeTime(contact.updated_at)}
      </TableCell>
      <TableCell className="py-3.5 text-right">
        <div
          className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100 has-[[data-popup-open]]:opacity-100"
          onClick={(event) => event.stopPropagation()}
        >
          <Button variant="ghost" size="sm" render={<Link href="/inbox" />}>
            <MessageCircle aria-hidden="true" data-icon="inline-start" />
            Message
          </Button>
          <Button variant="ghost" size="sm" onClick={onBook}>
            Book
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${displayName(contact)}`} />
              }
            >
              <MoreHorizontal aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem render={<Link href={`/contacts/${contact.id}`} />}>
                Open full profile
              </DropdownMenuItem>
              {contact.email && (
                <DropdownMenuItem onClick={() => onCopy(contact.email!, "Email")}>
                  Copy email
                </DropdownMenuItem>
              )}
              {contact.phone && (
                <DropdownMenuItem onClick={() => onCopy(contact.phone!, "Phone")}>
                  Copy phone
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  )
}

type CardProps = {
  contact: Contact
  index: number
  reduceMotion: boolean | null
  onOpen: () => void
  onBook: () => void
}

function ContactCard({ contact, index, reduceMotion, onOpen, onBook }: CardProps) {
  const SourceIcon = SOURCE_META[contact.source].icon

  return (
    <motion.li
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.base, ease: easing.out, delay: reduceMotion ? 0 : index * 0.03 }}
    >
      <div className="flex flex-col gap-2.5 rounded-xl bg-card p-3.5 ring-1 ring-foreground/10 transition-colors hover:bg-muted/40">
        <button
          type="button"
          onClick={onOpen}
          className="flex items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Avatar>
            <AvatarFallback>{initials(contact.name)}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium text-foreground">{displayName(contact)}</span>
            <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
              <SourceIcon aria-hidden="true" className="size-3" />
              {SOURCE_META[contact.source].label} · {relativeTime(contact.updated_at)}
            </span>
          </div>
          <StatusPill status={contact.status} />
        </button>
        <TagChips tags={contact.tags} />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="flex-1" render={<Link href="/inbox" />}>
            <MessageCircle aria-hidden="true" data-icon="inline-start" />
            Message
          </Button>
          <Button variant="outline" size="sm" className="flex-1" onClick={onBook}>
            Book
          </Button>
        </div>
      </div>
    </motion.li>
  )
}

function EmptyContactsState({ onAdd }: { onAdd: () => void }) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.base, ease: easing.out }}
      className="flex flex-1 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border bg-card/40 px-6 py-16 text-center"
    >
      <span
        aria-hidden="true"
        className="flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-primary/15 via-primary/5 to-[var(--chart-2)]/10 text-primary ring-1 ring-primary/10"
      >
        <Users className="size-6" />
      </span>
      <div className="flex max-w-sm flex-col gap-1.5">
        <h3 className="text-base font-medium text-foreground">Build your customer list</h3>
        <p className="text-sm text-muted-foreground">
          Every lead and customer gets a contact record — synced automatically from content and
          FrontDesk, or added by hand right here.
        </p>
      </div>
      <Button onClick={onAdd}>Add a contact</Button>
    </motion.div>
  )
}

function NoSearchResults({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-6 py-14 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Search aria-hidden="true" className="size-4" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">No contacts match</p>
        <p className="text-sm text-muted-foreground">Try a different search term or clear your filters.</p>
      </div>
      <Button variant="ghost" size="sm" onClick={onClear}>
        <X aria-hidden="true" data-icon="inline-start" />
        Clear filters
      </Button>
    </div>
  )
}
