"use client"

// Split out from usage-card.tsx: the Progress primitives are client
// components, and their `getAriaValueText`/children-as-function props can't
// cross the server->client boundary as functions. UsageCard (a server
// component) computes plain, serializable values and hands them to this
// small client component instead.

import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress"

interface UsageBarProps {
  label: string
  percent: number
  valueText: string
  nearLimit: boolean
}

export function UsageBar({ label, percent, valueText, nearLimit }: UsageBarProps) {
  return (
    <Progress
      value={percent}
      getAriaValueText={() => `${label}: ${valueText}`}
      className="flex-col items-stretch gap-1.5"
    >
      <div className="flex items-center justify-between gap-2">
        <ProgressLabel className="text-sm text-foreground">{label}</ProgressLabel>
        <ProgressValue className={nearLimit ? "text-warning" : "text-muted-foreground"}>
          {() => valueText}
        </ProgressValue>
      </div>
    </Progress>
  )
}
