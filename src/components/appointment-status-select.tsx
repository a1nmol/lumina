"use client"

// Compact status Select for one appointment row — reads as a pastel
// StatusPill (see src/components/inbox/status-pill.tsx) but is itself the
// interactive control, used on the contact profile's Appointments card and
// the Inbox context pane's Linked appointments list.

import { APPOINTMENT_STATUS_META, APPOINTMENT_STATUSES, TONE_CLASSES } from "@/components/inbox/status-pill"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { AppointmentStatus } from "@/lib/types"

type AppointmentStatusSelectProps = {
  status: AppointmentStatus
  onStatusChange: (status: AppointmentStatus) => void
  /** Accessible label, e.g. "Status for Kids Baking Class". */
  label: string
  disabled?: boolean
  className?: string
}

export function AppointmentStatusSelect({
  status,
  onStatusChange,
  label,
  disabled,
  className,
}: AppointmentStatusSelectProps) {
  const tone = APPOINTMENT_STATUS_META[status].tone

  return (
    <Select
      value={status}
      onValueChange={(value) => onStatusChange(value as AppointmentStatus)}
      disabled={disabled}
    >
      <SelectTrigger
        size="sm"
        aria-label={label}
        className={cn(
          "h-5 min-w-0 shrink-0 gap-1 rounded-full border-none px-2 py-0 text-xs font-semibold shadow-none",
          TONE_CLASSES[tone],
          className
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {APPOINTMENT_STATUSES.map((value) => (
          <SelectItem key={value} value={value}>
            {APPOINTMENT_STATUS_META[value].label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
