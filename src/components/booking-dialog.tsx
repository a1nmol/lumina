"use client"

// Shared booking Dialog — service (from the Business Brain), date, 30-minute
// time slot (within that day's hours), and an optional note. Reused from the
// Contacts table row action, the contact quick-view drawer, the contact
// profile header, and the Inbox context pane's quick action.
//
// TODO(V2): no external calendar sync yet (Google Calendar / etc. need API
// keys and a Business Brain connection) — this only writes to the
// `appointments` table via createAppointmentAction.

import { useEffect, useId, useState, type FormEvent } from "react"
import { CalendarIcon } from "lucide-react"
import { toast } from "sonner"

import { getBusinessBrain } from "@/app/(app)/settings/brain/actions"
import { createAppointmentAction } from "@/app/(app)/contacts/booking-actions"
import { displayName } from "@/app/(app)/contacts/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { combineDateAndTime, DAY_LABELS, dayKeyForDate, getTimeSlotsForDay } from "@/lib/booking-slots"
import type { Appointment, BusinessBrain, Contact } from "@/lib/types"

const MAX_NOTE_LENGTH = 500
const DEFAULT_DURATION_MINUTES = 30

type BookingDialogProps = {
  contact: Contact | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called with the newly booked appointment — callers optimistically append it to any visible appointment list. */
  onBooked?: (appointment: Appointment) => void
}

export function BookingDialog({ contact, open, onOpenChange, onBooked }: BookingDialogProps) {
  const formId = useId()
  const [brain, setBrain] = useState<BusinessBrain | null>(null)
  const [loadingBrain, setLoadingBrain] = useState(false)
  const [service, setService] = useState("")
  const [date, setDate] = useState<Date | undefined>(undefined)
  const [time, setTime] = useState("")
  const [note, setNote] = useState("")
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!open) return

    let cancelled = false
    // Deliberate setState-in-effect: arms the loading state for the fetch
    // kicked off immediately below — see src/components/inbox/context-pane.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingBrain(true)
    getBusinessBrain()
      .then((result) => {
        if (!cancelled) setBrain(result)
      })
      .finally(() => {
        if (!cancelled) setLoadingBrain(false)
      })

    return () => {
      cancelled = true
    }
  }, [open])

  function reset() {
    setService("")
    setDate(undefined)
    setTime("")
    setNote("")
    setPending(false)
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  if (!contact) return null

  const services = brain?.services ?? []
  const slots = date && brain ? getTimeSlotsForDay(brain.hours, date) : []
  const isClosedDay = Boolean(date) && brain !== null && !loadingBrain && slots.length === 0

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!contact || !service || !date || !time) return

    const startsAtDate = combineDateAndTime(date, time)
    if (!startsAtDate) return

    const selectedService = services.find((s) => s.name === service)
    const durationMinutes = selectedService?.duration_minutes ?? DEFAULT_DURATION_MINUTES
    const endsAtDate = new Date(startsAtDate.getTime() + durationMinutes * 60_000)
    const trimmedNote = note.trim()

    setPending(true)
    const result = await createAppointmentAction({
      contactId: contact.id,
      service,
      startsAt: startsAtDate.toISOString(),
      endsAt: endsAtDate.toISOString(),
      notes: trimmedNote || null,
    })
    setPending(false)

    if (result.ok && result.appointment) {
      const label = startsAtDate.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
      toast.success(`Booked ${service} for ${label}`)
      onBooked?.(result.appointment)
      handleOpenChange(false)
    } else {
      toast.error("Couldn't book appointment", { description: "Please try again in a moment." })
    }
  }

  const canSubmit = Boolean(service && date && time) && !isClosedDay

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Book an appointment</DialogTitle>
          <DialogDescription>
            Schedule time for {displayName(contact)} — pulled straight from your Business Brain.
          </DialogDescription>
        </DialogHeader>

        <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${formId}-service`}>Service</Label>
            {loadingBrain ? (
              <Skeleton className="h-8 w-full rounded-lg" />
            ) : services.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No services set up yet — add one in Settings &amp; Brain.
              </p>
            ) : (
              <Select value={service} onValueChange={(value) => setService(value ?? "")}>
                <SelectTrigger id={`${formId}-service`} className="w-full">
                  <SelectValue placeholder="Choose a service" />
                </SelectTrigger>
                <SelectContent>
                  {services.map((s) => (
                    <SelectItem key={s.name} value={s.name}>
                      {s.name}
                      {s.price ? ` · ${s.price}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${formId}-date`}>Date</Label>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger
                  id={`${formId}-date`}
                  render={<Button type="button" variant="outline" className="w-full justify-start font-normal" />}
                >
                  <CalendarIcon aria-hidden="true" data-icon="inline-start" />
                  {date
                    ? date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
                    : "Pick a date"}
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(nextDate) => {
                      setDate(nextDate)
                      setTime("")
                      setCalendarOpen(false)
                    }}
                    disabled={{ before: new Date(new Date().setHours(0, 0, 0, 0)) }}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${formId}-time`}>Time</Label>
              <Select value={time} onValueChange={(value) => setTime(value ?? "")} disabled={!date || isClosedDay}>
                <SelectTrigger id={`${formId}-time`} className="w-full">
                  <SelectValue placeholder={!date ? "Pick a date first" : isClosedDay ? "Closed" : "Choose a time"} />
                </SelectTrigger>
                <SelectContent>
                  {slots.map((slot) => (
                    <SelectItem key={slot.value} value={slot.value}>
                      {slot.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isClosedDay && date && (
            <p role="status" className="text-xs text-warning">
              Closed on {DAY_LABELS[dayKeyForDate(date)]} — pick another day.
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${formId}-note`}>Note (optional)</Label>
            <Textarea
              id={`${formId}-note`}
              value={note}
              onChange={(event) => setNote(event.target.value.slice(0, MAX_NOTE_LENGTH))}
              placeholder="Anything the business should know…"
              className="min-h-16"
            />
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={!canSubmit || pending}>
            {pending ? "Booking…" : "Book appointment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
