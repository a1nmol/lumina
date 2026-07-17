"use client"

import { useId, useState, type FormEvent } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Contact, ContactSource, ContactStatus } from "@/lib/types"

import { saveContactAction } from "./actions"
import { CONTACT_STATUSES, CONTACT_STATUS_META } from "@/components/inbox/status-pill"
import { SOURCE_META } from "./utils"

const SOURCES: ContactSource[] = [
  "manual",
  "web_chat",
  "form",
  "sms",
  "email",
  "instagram",
  "facebook",
  "google",
  "missed_call",
]

type AddContactDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (contact: Contact) => void
}

/** "Add contact" Dialog — name/phone/email/source/status → saveContactAction (upsertContact live, local fabrication in demo). */
export function AddContactDialog({ open, onOpenChange, onCreated }: AddContactDialogProps) {
  const formId = useId()
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [source, setSource] = useState<ContactSource>("manual")
  const [status, setStatus] = useState<ContactStatus>("lead")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  function reset() {
    setName("")
    setPhone("")
    setEmail("")
    setSource("manual")
    setStatus("lead")
    setError(null)
    setPending(false)
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()

    const trimmedName = name.trim()
    const trimmedPhone = phone.trim()
    const trimmedEmail = email.trim()

    if (!trimmedName && !trimmedPhone && !trimmedEmail) {
      setError("Add at least a name, phone, or email.")
      return
    }

    setError(null)
    setPending(true)

    const result = await saveContactAction({
      name: trimmedName || null,
      phone: trimmedPhone || null,
      email: trimmedEmail || null,
      source,
      status,
    })

    setPending(false)

    if (result.ok && result.contact) {
      onCreated(result.contact)
      toast.success(`${trimmedName || trimmedEmail || trimmedPhone} added to Contacts`)
      handleOpenChange(false)
    } else {
      toast.error("Couldn't add contact", { description: "Please try again in a moment." })
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add contact</DialogTitle>
          <DialogDescription>
            Add a lead or customer straight to your CRM — no import, just the essentials.
          </DialogDescription>
        </DialogHeader>

        <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${formId}-name`}>Name</Label>
            <Input
              id={`${formId}-name`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Jordan Lee"
              autoFocus
              autoComplete="off"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${formId}-phone`}>Phone</Label>
              <Input
                id={`${formId}-phone`}
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+1 (555) 000-0000"
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${formId}-email`}>Email</Label>
              <Input
                id={`${formId}-email`}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="jordan@example.com"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${formId}-source`}>Source</Label>
              <Select value={source} onValueChange={(value) => setSource(value as ContactSource)}>
                <SelectTrigger id={`${formId}-source`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {SOURCE_META[value].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${formId}-status`}>Status</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as ContactStatus)}>
                <SelectTrigger id={`${formId}-status`} className="w-full">
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
          </div>

          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={pending}>
            {pending ? "Adding…" : "Add contact"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
