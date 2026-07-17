// Pure completeness scoring for the Business Brain — shared by the settings
// hub summary card. No server-only imports so it can run in either
// environment.

import type { BusinessBrain } from "@/lib/types"

export type CompletenessField = {
  label: string
  filled: boolean
}

export type Completeness = {
  percent: number
  fields: CompletenessField[]
}

export function computeBrainCompleteness(brain: BusinessBrain): Completeness {
  const hasHours = Object.values(brain.hours ?? {}).some(
    (day) => day && !day.closed && day.open && day.close
  )
  const hasChannel = Object.values(brain.connected_channels ?? {}).some(Boolean)

  const fields: CompletenessField[] = [
    { label: "Business name", filled: Boolean(brain.business_name) },
    { label: "Category", filled: Boolean(brain.category) },
    { label: "Description", filled: Boolean(brain.description) },
    { label: "Hours", filled: hasHours },
    { label: "Services", filled: (brain.services?.length ?? 0) > 0 },
    { label: "FAQ", filled: (brain.faq?.length ?? 0) > 0 },
    { label: "Voice & tone", filled: Boolean(brain.tone) },
    { label: "Brand color", filled: Boolean(brain.brand_kit?.primary_color) },
    { label: "Channels", filled: hasChannel },
  ]

  const filledCount = fields.filter((field) => field.filled).length
  const percent = Math.round((filledCount / fields.length) * 100)

  return { percent, fields }
}
