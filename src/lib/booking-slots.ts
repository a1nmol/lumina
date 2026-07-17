// Pure helpers for the Booking MVP dialog (src/components/booking-dialog.tsx)
// — 30-minute appointment slot generation from a Business Brain's weekly
// hours. No server-only imports so it can run directly in the client dialog.

import type { BusinessHours } from "@/lib/types"

const DAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const

export const DAY_LABELS: Record<(typeof DAY_KEYS)[number], string> = {
  sunday: "Sunday",
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
}

const SLOT_MINUTES = 30

export type TimeSlot = { value: string; label: string }

/** Lowercase day-of-week key (e.g. "monday") matching BusinessHours' keys, for a given Date. */
export function dayKeyForDate(date: Date): (typeof DAY_KEYS)[number] {
  return DAY_KEYS[date.getDay()]!
}

/** Parses a Brain-stored "HH:MM" (24-hour) hours value into minutes-since-midnight. Returns null if malformed. */
function parseTimeToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

function minutesToLabel(minutes: number): string {
  const hours24 = Math.floor(minutes / 60)
  const mins = minutes % 60
  const period = hours24 >= 12 ? "PM" : "AM"
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12
  return `${hours12}:${String(mins).padStart(2, "0")} ${period}`
}

function minutesToValue(minutes: number): string {
  const hours24 = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${String(hours24).padStart(2, "0")}:${String(mins).padStart(2, "0")}`
}

/**
 * 30-minute slot options within a day's open/close hours (from the Business
 * Brain). Returns [] when the business is closed that day, or hours are
 * missing/malformed for that day — callers should treat an empty result as
 * "closed, pick another day".
 */
export function getTimeSlotsForDay(hours: BusinessHours | undefined, date: Date): TimeSlot[] {
  const day = hours?.[dayKeyForDate(date)]
  if (!day || day.closed || !day.open || !day.close) return []

  const start = parseTimeToMinutes(day.open)
  const end = parseTimeToMinutes(day.close)
  if (start == null || end == null || start >= end) return []

  const slots: TimeSlot[] = []
  for (let minutes = start; minutes + SLOT_MINUTES <= end; minutes += SLOT_MINUTES) {
    slots.push({ value: minutesToValue(minutes), label: minutesToLabel(minutes) })
  }
  return slots
}

/** Combines a calendar date with a "HH:MM" time-of-day into a single Date, in local time. Returns null if `time` is malformed. */
export function combineDateAndTime(date: Date, time: string): Date | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time)
  if (!match) return null
  const combined = new Date(date)
  combined.setHours(Number(match[1]), Number(match[2]), 0, 0)
  return combined
}
