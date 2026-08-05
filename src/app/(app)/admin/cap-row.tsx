"use client"

// The admin Sheet's inherited-vs-overridden pattern for numeric usage caps
// (design brief, Outlast wave 4). Unlike EntitlementRow, edits here are
// DRAFT-only — the parent Sheet holds the draft value and only calls the
// server once the sticky save bar's "Save N changes" is pressed. The reset
// button (clearing the override entirely) is still immediate, mirroring
// EntitlementRow.

import { useId } from "react"
import { RotateCcw } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface CapRowProps {
  label: string
  /** e.g. "Pro" — the plan currently assigned to this org. */
  planLabel: string
  /** This cap's value in the assigned plan's catalog defaults. */
  planValue: number | undefined
  /** True when this org has an explicit override for this cap. */
  overridden: boolean
  /** Current draft input value (string so an in-progress edit like "" or "1." can round-trip). */
  value: string
  /** True when the current draft value fails validation (non-numeric or negative) — disables Save for the whole section. */
  invalid?: boolean
  /** Disables the input and reset button while an immediate action (reset) or the batched save is in flight. */
  disabled?: boolean
  onChange: (raw: string) => void
  onReset: () => void
}

export function CapRow({
  label,
  planLabel,
  planValue,
  overridden,
  value,
  invalid,
  disabled,
  onChange,
  onReset,
}: CapRowProps) {
  const id = useId()

  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="flex flex-col gap-0.5">
        <Label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </Label>
        <span className="text-xs text-muted-foreground">
          {overridden ? `${planLabel} default: ${planValue ?? "—"}` : `Plan default (${planLabel})`}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {overridden && <Badge variant="outline" className="font-normal">Overridden</Badge>}
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          className={cn("w-24 text-right tabular-nums")}
        />
        {overridden && (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={onReset}
                  disabled={disabled}
                  aria-label={`Reset ${label} to plan default`}
                  className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
                />
              }
            >
              <RotateCcw aria-hidden="true" className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>Removes the custom value — this org follows the plan going forward.</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  )
}
