"use client"

// "What I remember about them" (Companion C3 review fix): contacts DO carry
// person-level AI memory (contacts.ai_memory, migration 0016 — see
// src/lib/ai/conversation-memory.ts's PersonMemory) and listContacts already
// fetches the full row, so surfacing it here is display-only. The parse below
// is a local, defensive display parse — same deliberate pattern as
// src/components/inbox/ai-memory-strip.tsx, because the shared parser lives
// in a server-only module a client component can't import.

import Link from "next/link"
import { useState, type KeyboardEvent } from "react"
import { X } from "lucide-react"
import { toast } from "sonner"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { BookingDialog } from "@/components/booking-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { VipToggle } from "@/components/vip-toggle"
import { cn } from "@/lib/utils"
import type { Contact, ContactStatus } from "@/lib/types"

import { saveContactAction, toggleContactVip, updateStatusAction } from "./actions"
import { CONTACT_STATUSES, CONTACT_STATUS_META, StatusPill } from "@/components/inbox/status-pill"

type PersonMemoryDisplay = { facts: string[]; relationship: string; topics: string[] }

/** Defensive display-only parse of contacts.ai_memory (never throws; null when nothing renderable). */
function parsePersonMemoryForDisplay(json: Record<string, unknown> | null): PersonMemoryDisplay | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null
  const facts = Array.isArray(json.facts)
    ? json.facts.filter((f): f is string => typeof f === "string" && f.trim().length > 0).slice(0, 6)
    : []
  const topics = Array.isArray(json.topics)
    ? json.topics.filter((t): t is string => typeof t === "string" && t.trim().length > 0).slice(0, 4)
    : []
  const relationship = typeof json.relationship === "string" ? json.relationship.trim() : ""
  if (facts.length === 0 && topics.length === 0 && !relationship) return null
  return { facts, relationship, topics }
}
import { displayName, initials, SOURCE_META } from "./utils"

type ContactDrawerProps = {
  contact: Contact | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called with the optimistically-updated contact immediately, and again with the original on a failed save (revert). */
  onContactChange: (contact: Contact) => void
}

/**
 * Right-hand Sheet quick view: identity, inline status change, tags editor,
 * notes (save on blur). Every edit applies optimistically via
 * `onContactChange` and reverts with a toast if the server call fails.
 */
export function ContactDrawer({ contact, open, onOpenChange, onContactChange }: ContactDrawerProps) {
  const [notesDraft, setNotesDraft] = useState(contact?.notes ?? "")
  const [tagDraft, setTagDraft] = useState("")
  const [syncedContactId, setSyncedContactId] = useState(contact?.id ?? null)
  const [bookingOpen, setBookingOpen] = useState(false)

  // Reset the local drafts when a different contact is selected (adjusting
  // state during render, per React's guidance, instead of an effect —
  // avoids the extra render an effect-driven reset would cause).
  if (contact && contact.id !== syncedContactId) {
    setSyncedContactId(contact.id)
    setNotesDraft(contact.notes ?? "")
    setTagDraft("")
  }

  if (!contact) return null

  const SourceIcon = SOURCE_META[contact.source].icon

  async function handleStatusChange(nextStatus: ContactStatus) {
    if (!contact || nextStatus === contact.status) return
    const previous = contact
    onContactChange({ ...contact, status: nextStatus, updated_at: new Date().toISOString() })

    const result = await updateStatusAction(contact.id, nextStatus)
    if (!result.ok) {
      onContactChange(previous)
      toast.error("Couldn't update status", { description: "Reverted — please try again." })
    }
  }

  async function handleToggleVip() {
    if (!contact) return
    const previous = contact
    const nextIsVip = !contact.is_vip
    onContactChange({ ...contact, is_vip: nextIsVip, updated_at: new Date().toISOString() })

    const result = await toggleContactVip(contact.id, nextIsVip)
    if (!result.ok) {
      onContactChange(previous)
      toast.error("Couldn't update VIP status", { description: "Reverted — please try again." })
    }
  }

  async function commitTags(nextTags: string[]) {
    if (!contact) return
    const previous = contact
    onContactChange({ ...contact, tags: nextTags, updated_at: new Date().toISOString() })

    const result = await saveContactAction({ id: contact.id, tags: nextTags })
    if (!result.ok) {
      onContactChange(previous)
      toast.error("Couldn't update tags", { description: "Reverted — please try again." })
    }
  }

  function handleAddTag(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return
    event.preventDefault()
    const value = tagDraft.trim()
    if (!value || !contact) return
    if (contact.tags.includes(value)) {
      setTagDraft("")
      return
    }
    setTagDraft("")
    void commitTags([...contact.tags, value])
  }

  function handleRemoveTag(tag: string) {
    if (!contact) return
    void commitTags(contact.tags.filter((existing) => existing !== tag))
  }

  async function handleNotesBlur() {
    if (!contact) return
    const trimmed = notesDraft.trim()
    const nextNotes = trimmed.length > 0 ? trimmed : null
    if (nextNotes === contact.notes) return

    const previous = contact
    onContactChange({ ...contact, notes: nextNotes, updated_at: new Date().toISOString() })

    const result = await saveContactAction({ id: contact.id, notes: nextNotes })
    if (!result.ok) {
      onContactChange(previous)
      setNotesDraft(previous.notes ?? "")
      toast.error("Couldn't save notes", { description: "Reverted — please try again." })
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col gap-0 sm:max-w-md">
        <SheetHeader className="border-b border-border/60">
          <div className="flex items-start gap-3">
            <Avatar size="lg">
              <AvatarFallback>{initials(contact.name)}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <SheetTitle className="truncate">{displayName(contact)}</SheetTitle>
              <SheetDescription className="flex items-center gap-1.5">
                <SourceIcon aria-hidden="true" className="size-3.5" />
                {SOURCE_META[contact.source].label}
              </SheetDescription>
              <div className="flex items-center gap-1">
                <StatusPill status={contact.status} />
                {contact.is_vip && <span className="text-xs font-medium text-warning">VIP</span>}
              </div>
            </div>
            <VipToggle isVip={contact.is_vip} onToggle={handleToggleVip} />
          </div>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">
          <div className="flex flex-col gap-1.5 text-sm">
            {contact.phone && <p className="text-foreground">{contact.phone}</p>}
            {contact.email && <p className="text-foreground">{contact.email}</p>}
            {!contact.phone && !contact.email && (
              <p className="text-muted-foreground">No phone or email on file.</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contact-status">Change status</Label>
            <Select value={contact.status} onValueChange={(value) => handleStatusChange(value as ContactStatus)}>
              <SelectTrigger id="contact-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTACT_STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {CONTACT_STATUS_META[value].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contact-tag-input">Tags</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              {contact.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full bg-secondary py-0.5 pr-1 pl-2 text-xs font-medium text-secondary-foreground"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    aria-label={`Remove tag ${tag}`}
                  >
                    <X aria-hidden="true" className="size-2.5" />
                  </button>
                </span>
              ))}
            </div>
            <Input
              id="contact-tag-input"
              value={tagDraft}
              onChange={(event) => setTagDraft(event.target.value)}
              onKeyDown={handleAddTag}
              placeholder="Add a tag and press Enter"
            />
          </div>

          {(() => {
            const memory = parsePersonMemoryForDisplay(contact.ai_memory)
            if (!memory) return null
            return (
              <div className="flex flex-col gap-1.5 rounded-xl bg-muted/40 p-3 ring-1 ring-border/40">
                <p className="text-xs font-medium text-foreground">What I remember about them</p>
                {memory.relationship && <p className="text-xs text-muted-foreground">{memory.relationship}</p>}
                {memory.facts.length > 0 && (
                  <ul className="flex list-disc flex-col gap-0.5 pl-4 text-xs text-muted-foreground">
                    {memory.facts.map((fact) => (
                      <li key={fact}>{fact}</li>
                    ))}
                  </ul>
                )}
                {memory.topics.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {memory.topics.map((topic) => (
                      <span key={topic} className="rounded-full bg-card px-2 py-0.5 text-[11px] text-muted-foreground ring-1 ring-border/40">
                        {topic}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })()}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contact-notes">Notes</Label>
            <Textarea
              id="contact-notes"
              value={notesDraft}
              onChange={(event) => setNotesDraft(event.target.value)}
              onBlur={handleNotesBlur}
              placeholder="Anything worth remembering about this contact…"
              className={cn("min-h-24")}
            />
          </div>
        </div>

        <SheetFooter className="border-t border-border/60">
          <Button variant="outline" onClick={() => setBookingOpen(true)}>
            Book appointment
          </Button>
          <Button variant="outline" render={<Link href={`/contacts/${contact.id}`} />}>
            Open full profile
          </Button>
        </SheetFooter>
      </SheetContent>

      <BookingDialog contact={contact} open={bookingOpen} onOpenChange={setBookingOpen} />
    </Sheet>
  )
}
