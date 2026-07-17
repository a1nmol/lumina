"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { CalendarClock, MessageCircle, Pencil } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/components/page-header"
import type { AppointmentStatus, Contact, ContactTimelineEvent } from "@/lib/types"

import { ContactDrawer } from "../contact-drawer"
import { StatusPill } from "@/components/inbox/status-pill"
import { displayName, relativeTime, SOURCE_META } from "../utils"
import { ActivityTimeline } from "./activity-timeline"

const APPOINTMENT_STATUS_STYLE: Record<AppointmentStatus, string> = {
  scheduled: "bg-info/10 text-info",
  completed: "bg-success/10 text-success",
  cancelled: "bg-destructive/10 text-destructive",
  no_show: "bg-warning/10 text-warning",
}

const APPOINTMENT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
}

type ContactProfileViewProps = {
  initialContact: Contact
  timeline: ContactTimelineEvent[]
}

/** Full profile page shell — reuses ContactDrawer for editing, so the quick-view and profile stay in sync. */
export function ContactProfileView({ initialContact, timeline }: ContactProfileViewProps) {
  const [contact, setContact] = useState<Contact>(initialContact)
  const [editOpen, setEditOpen] = useState(false)

  const SourceIcon = SOURCE_META[contact.source].icon

  const appointments = useMemo(
    () =>
      timeline
        .filter((event): event is Extract<ContactTimelineEvent, { type: "appointment" }> => event.type === "appointment")
        .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()),
    [timeline]
  )

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader
        title={displayName(contact)}
        description={`${SOURCE_META[contact.source].label} · Last activity ${relativeTime(contact.updated_at)}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusPill status={contact.status} />
            <Button variant="outline" render={<Link href="/inbox" />}>
              <MessageCircle aria-hidden="true" data-icon="inline-start" />
              Message
            </Button>
            <Button onClick={() => setEditOpen(true)}>
              <Pencil aria-hidden="true" data-icon="inline-start" />
              Edit
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,320px)_1fr]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1 text-sm">
                {contact.phone && <p className="text-foreground">{contact.phone}</p>}
                {contact.email && <p className="text-foreground">{contact.email}</p>}
                {!contact.phone && !contact.email && (
                  <p className="text-muted-foreground">No phone or email on file.</p>
                )}
              </div>

              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <SourceIcon aria-hidden="true" className="size-3.5" />
                Sourced from {SOURCE_META[contact.source].label}
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Tags</span>
                {contact.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {contact.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">No tags yet.</span>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Notes</span>
                <p className="text-sm whitespace-pre-wrap text-foreground/90">
                  {contact.notes || <span className="text-muted-foreground">No notes yet.</span>}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Appointments</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {appointments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No appointments booked yet.</p>
              ) : (
                appointments.map(({ appointment }) => (
                  <div
                    key={appointment.id}
                    className="flex items-start gap-3 rounded-lg bg-muted/40 p-3"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-card text-muted-foreground ring-1 ring-border">
                      <CalendarClock aria-hidden="true" className="size-4" />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-sm font-medium text-foreground">
                        {appointment.service ?? "Appointment"}
                      </span>
                      <span className="text-xs text-muted-foreground">{relativeTime(appointment.starts_at)}</span>
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold ${APPOINTMENT_STATUS_STYLE[appointment.status]}`}
                    >
                      {APPOINTMENT_STATUS_LABEL[appointment.status]}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityTimeline events={timeline} />
          </CardContent>
        </Card>
      </div>

      <ContactDrawer
        contact={contact}
        open={editOpen}
        onOpenChange={setEditOpen}
        onContactChange={setContact}
      />
    </div>
  )
}
