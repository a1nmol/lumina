// Pure UI helper — derives a daily leads/bookings series for the Overview
// chart from loop pairs. Deliberately NOT in src/lib (per the build spec):
// this is a presentational bucketing of already-fetched LoopPair data, not a
// new data source.

import type { LoopPair } from "@/lib/types"

export type DailyPoint = {
  /** ISO date (day precision, local midnight) for this bucket. */
  date: string
  /** Short axis label, e.g. "Jul 14". */
  label: string
  leads: number
  bookings: number
}

// Day boundaries follow the server process's local timezone for now — both
// bucket keys and outcome keys are derived through the SAME local-date
// formatter below, so they line up even though the process tz may not match
// any given org's actual tz. TODO(org timezone): once orgs have a stored
// timezone setting, bucket by that instead of the process tz.
function dayKey(date: Date): string {
  // en-CA formats as YYYY-MM-DD, in the local timezone.
  return date.toLocaleDateString("en-CA")
}

/** Buckets loop-pair outcomes (leads/bookings) into one point per day for the trailing `rangeDays` window ending today. Calls that reached a lead/booking are counted under their own kind only — the chart's two series are leads and bookings, matching the roll-up stat strip. */
export function deriveDailySeries(loopPairs: LoopPair[], rangeDays: number): DailyPoint[] {
  const days = Math.max(rangeDays, 1)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const buckets: DailyPoint[] = []
  const indexByDayKey = new Map<string, number>()
  for (let offset = days - 1; offset >= 0; offset--) {
    const bucketDate = new Date(today)
    bucketDate.setDate(bucketDate.getDate() - offset)
    indexByDayKey.set(dayKey(bucketDate), buckets.length)
    buckets.push({
      date: bucketDate.toISOString(),
      label: bucketDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      leads: 0,
      bookings: 0,
    })
  }

  for (const pair of loopPairs) {
    for (const outcome of pair.outcomes) {
      const index = indexByDayKey.get(dayKey(new Date(outcome.occurredAt)))
      if (index === undefined) continue
      if (outcome.kind === "lead") buckets[index].leads += 1
      else if (outcome.kind === "booking") buckets[index].bookings += 1
    }
  }

  return buckets
}
