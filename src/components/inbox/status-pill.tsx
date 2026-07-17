// Generic pastel status pill — soft bg + bold text, status is never conveyed
// by color alone (the label is always rendered). Supports both conversation status
// (open/pending/resolved) and CRM pipeline (lead/contacted/booked/customer).

import { cn } from "@/lib/utils"
import type { AppointmentStatus, ContactStatus, ConversationStatus } from "@/lib/types"

export type StatusPillTone = "neutral" | "info" | "warning" | "success" | "brand" | "danger"

export const TONE_CLASSES: Record<StatusPillTone, string> = {
  neutral: "bg-secondary text-secondary-foreground",
  info: "bg-info/10 text-info",
  warning: "bg-warning/10 text-warning",
  success: "bg-success/10 text-success",
  brand: "bg-primary/10 text-primary",
  danger: "bg-destructive/10 text-destructive",
}

export const CONVERSATION_STATUS_META: Record<ConversationStatus, { label: string; tone: StatusPillTone }> = {
  open: { label: "Open", tone: "info" },
  pending: { label: "Pending", tone: "warning" },
  resolved: { label: "Resolved", tone: "success" },
}

export const CONTACT_STATUS_META: Record<ContactStatus, { label: string; tone: StatusPillTone }> = {
  lead: { label: "Lead", tone: "info" },
  contacted: { label: "Contacted", tone: "warning" },
  booked: { label: "Booked", tone: "brand" },
  customer: { label: "Customer", tone: "success" },
}

export const CONTACT_STATUSES: ContactStatus[] = ["lead", "contacted", "booked", "customer"]

export const APPOINTMENT_STATUS_META: Record<AppointmentStatus, { label: string; tone: StatusPillTone }> = {
  scheduled: { label: "Scheduled", tone: "info" },
  completed: { label: "Completed", tone: "success" },
  cancelled: { label: "Cancelled", tone: "danger" },
  no_show: { label: "No-show", tone: "warning" },
}

export const APPOINTMENT_STATUSES: AppointmentStatus[] = ["scheduled", "completed", "cancelled", "no_show"]

// Overloaded signatures for flexibility: either pass (label + tone) or (status)
type StatusPillPropsWithTone = {
  status?: never
  label: string
  tone: StatusPillTone
  className?: string
}

type StatusPillPropsWithStatus = {
  status: ContactStatus
  label?: never
  tone?: never
  className?: string
}

type StatusPillProps = StatusPillPropsWithTone | StatusPillPropsWithStatus

/** Soft pastel status pill. Pass either (status) or (label + tone). */
export function StatusPill(props: StatusPillProps) {
  let label: string
  let tone: StatusPillTone

  if ("status" in props && props.status) {
    const meta = CONTACT_STATUS_META[props.status]
    label = meta.label
    tone = meta.tone
  } else if ("label" in props && "tone" in props && props.label && props.tone) {
    label = props.label
    tone = props.tone
  } else {
    throw new Error("StatusPill: must provide either (status) or both (label + tone)")
  }

  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center rounded-full px-2 text-xs font-semibold whitespace-nowrap",
        TONE_CLASSES[tone],
        props.className
      )}
    >
      {label}
    </span>
  )
}
