"use client"

import Link from "next/link"
import { useState, type KeyboardEvent } from "react"
import { X } from "lucide-react"
import { toast } from "sonner"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
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
import { cn } from "@/lib/utils"
import type { Contact, ContactStatus } from "@/lib/types"

import { saveContactAction, updateStatusAction } from "./actions"
import { CONTACT_STATUSES, CONTACT_STATUS_META, StatusPill } from "@/components/inbox/status-pill"
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
        <SheetHeader className="border-b border-border">
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
              <StatusPill status={contact.status} />
            </div>
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

        <SheetFooter className="border-t border-border">
          <Button variant="outline" render={<Link href={`/contacts/${contact.id}`} />}>
            Open full profile
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
