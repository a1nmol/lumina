"use client"

import { useEffect, useState } from "react"
import { CalendarClock, CalendarPlus, Plus, StickyNote, User } from "lucide-react"
import { toast } from "sonner"

import { updateAppointmentStatusAction } from "@/app/(app)/contacts/booking-actions"
import { AppointmentStatusSelect } from "@/components/appointment-status-select"
import { BookingDialog } from "@/components/booking-dialog"
import { Accordion, AccordionItem, AccordionPanel, AccordionTrigger } from "@/components/ui/accordion"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { VipToggle } from "@/components/vip-toggle"
import { cn } from "@/lib/utils"
import type { Appointment, AppointmentStatus, Contact, ContactStatus } from "@/lib/types"

import { getAppointmentsForContact, type ThreadListConversation } from "@/app/(app)/inbox/actions"

import { ChannelGlyph } from "./channel-glyphs"
import { getThreadSnippet, initialsFromName } from "./inbox-filters"
import { formatRelativeTime } from "./relative-time"
import { CONTACT_STATUS_META, StatusPill } from "./status-pill"

const PIPELINE_STATUSES: ContactStatus[] = ["lead", "contacted", "booked", "customer"]

type ContextPaneProps = {
  contact: Contact | null
  currentConversationId: string
  conversations: ThreadListConversation[]
  onSelectConversation: (id: string) => void
  onStatusChange: (status: ContactStatus) => void
  onAddTag: (tag: string) => void
  onAddNote: () => void
  onToggleVip: () => void
  className?: string
}

export function ContextPane({
  contact,
  currentConversationId,
  conversations,
  onSelectConversation,
  onStatusChange,
  onAddTag,
  onAddNote,
  onToggleVip,
  className,
}: ContextPaneProps) {
  const [tagInput, setTagInput] = useState("")
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loadingAppointments, setLoadingAppointments] = useState(false)
  const [bookingOpen, setBookingOpen] = useState(false)
  const [pendingAppointmentId, setPendingAppointmentId] = useState<string | null>(null)

  const contactId = contact?.id

  useEffect(() => {
    // Deliberate setState-in-effect: clears the tag draft left over from the
    // previously selected contact — a one-time reset keyed on identity, not
    // state derivable from render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTagInput("")
  }, [contactId])

  useEffect(() => {
    if (!contactId) return

    let cancelled = false
    // Deliberate setState-in-effect: arms the loading state for the fetch
    // kicked off immediately below — see src/components/calendar/reminder-button.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingAppointments(true)
    getAppointmentsForContact(contactId)
      .then((result) => {
        if (!cancelled) setAppointments(result)
      })
      .finally(() => {
        if (!cancelled) setLoadingAppointments(false)
      })
    return () => {
      cancelled = true
    }
  }, [contactId])

  if (!contact) {
    return (
      <div className={cn("flex h-full flex-col items-center justify-center gap-2 p-6 text-center", className)}>
        <User aria-hidden="true" className="size-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No contact selected.</p>
      </div>
    )
  }

  const previousConversations = conversations.filter(
    (conversation) => conversation.contact_id === contact.id && conversation.id !== currentConversationId
  )

  function handleAddTag() {
    const trimmed = tagInput.trim()
    if (!trimmed) return
    onAddTag(trimmed)
    setTagInput("")
  }

  function handleBooked(appointment: Appointment) {
    setAppointments((prev) => [...prev, appointment])
  }

  async function handleAppointmentStatusChange(appointmentId: string, nextStatus: AppointmentStatus) {
    if (pendingAppointmentId) return
    const previous = appointments.find((appointment) => appointment.id === appointmentId)?.status
    if (!previous || previous === nextStatus) return

    setPendingAppointmentId(appointmentId)
    setAppointments((prev) =>
      prev.map((appointment) => (appointment.id === appointmentId ? { ...appointment, status: nextStatus } : appointment))
    )

    const result = await updateAppointmentStatusAction(appointmentId, nextStatus)
    if (!result.ok) {
      setAppointments((prev) =>
        prev.map((appointment) => (appointment.id === appointmentId ? { ...appointment, status: previous } : appointment))
      )
      toast.error("Couldn't update appointment status", { description: "Reverted — please try again." })
    }
    setPendingAppointmentId(null)
  }

  return (
    <div className={cn("flex h-full flex-col gap-5 overflow-y-auto p-4", className)}>
      {/* Contact identity block */}
      <div className="flex flex-col items-center gap-2 text-center">
        <Avatar size="lg">
          <AvatarFallback>{initialsFromName(contact.name)}</AvatarFallback>
        </Avatar>
        <div>
          <p className="text-sm font-semibold text-foreground">{contact.name ?? "Unknown contact"}</p>
          {contact.phone && <p className="text-xs text-muted-foreground">{contact.phone}</p>}
          {contact.email && <p className="text-xs text-muted-foreground">{contact.email}</p>}
        </div>
        <div className="flex items-center gap-1.5">
          <StatusPill {...CONTACT_STATUS_META[contact.status]} />
          <VipToggle isVip={contact.is_vip} onToggle={onToggleVip} />
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/40 p-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="context-pipeline-status" className="text-xs font-medium text-muted-foreground">
            Pipeline status
          </label>
          <Select value={contact.status} onValueChange={(value) => onStatusChange(value as ContactStatus)}>
            <SelectTrigger id="context-pipeline-status" size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PIPELINE_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {CONTACT_STATUS_META[status].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="context-add-tag" className="text-xs font-medium text-muted-foreground">
            Tags
          </label>
          <div className="flex flex-wrap gap-1">
            {contact.tags.length === 0 ? (
              <span className="text-xs text-muted-foreground">No tags yet.</span>
            ) : (
              contact.tags.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Input
              id="context-add-tag"
              value={tagInput}
              onChange={(event) => setTagInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  handleAddTag()
                }
              }}
              placeholder="Add a tag…"
              className="h-7 text-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={handleAddTag}
              disabled={!tagInput.trim()}
              aria-label="Add tag"
            >
              <Plus aria-hidden="true" className="size-3.5" />
            </Button>
          </div>
        </div>

        <Button type="button" variant="outline" size="sm" onClick={onAddNote} className="gap-1.5">
          <StickyNote aria-hidden="true" className="size-3.5" />
          Add internal note
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setBookingOpen(true)}
          className="gap-1.5"
        >
          <CalendarPlus aria-hidden="true" className="size-3.5" />
          Book appointment
        </Button>
      </div>

      {/* Linked appointments */}
      <div className="flex flex-col gap-2">
        <h4 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <CalendarClock aria-hidden="true" className="size-3.5" />
          Linked appointments
        </h4>
        {loadingAppointments ? (
          <Skeleton className="h-12 w-full rounded-lg" />
        ) : appointments.length === 0 ? (
          <p className="text-xs text-muted-foreground">No appointments booked yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {appointments.map((appointment) => (
              <li
                key={appointment.id}
                className="flex items-start justify-between gap-2 rounded-lg border border-border bg-card px-2.5 py-2 text-xs shadow-soft"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{appointment.service ?? "Appointment"}</p>
                  <p className="text-muted-foreground">
                    {new Date(appointment.starts_at).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <AppointmentStatusSelect
                  status={appointment.status}
                  onStatusChange={(status) => handleAppointmentStatusChange(appointment.id, status)}
                  label={`Status for ${appointment.service ?? "appointment"}`}
                  disabled={pendingAppointmentId === appointment.id}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Previous conversations */}
      <Accordion>
        <AccordionItem value="previous-conversations">
          <AccordionTrigger>
            Previous conversations
            {previousConversations.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {previousConversations.length}
              </Badge>
            )}
          </AccordionTrigger>
          <AccordionPanel>
            {previousConversations.length === 0 ? (
              <p className="text-xs text-muted-foreground">No other conversations with this contact yet.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {previousConversations.map((conversation) => (
                  <li key={conversation.id}>
                    <button
                      type="button"
                      onClick={() => onSelectConversation(conversation.id)}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <ChannelGlyph channel={conversation.channel} className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-foreground">
                        {getThreadSnippet(conversation)}
                      </span>
                      <span className="shrink-0 text-muted-foreground">
                        {formatRelativeTime(conversation.last_message_at)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </AccordionPanel>
        </AccordionItem>
      </Accordion>

      <BookingDialog contact={contact} open={bookingOpen} onOpenChange={setBookingOpen} onBooked={handleBooked} />
    </div>
  )
}
