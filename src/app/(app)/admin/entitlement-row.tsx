"use client"

// The admin Sheet's core inherited-vs-overridden pattern for boolean feature
// flags (design brief, Outlast wave 4). Immediate-save + optimistic: the
// parent flips local state before the server call resolves and snaps back
// with a toast on failure — this component is purely presentational plus
// the two callbacks.

import { useId } from "react"
import { RotateCcw } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface EntitlementRowProps {
  label: string
  /** e.g. "Pro" — the plan currently assigned to this org. */
  planLabel: string
  /** This flag's value in the assigned plan's catalog defaults. */
  planValue: boolean
  /** True when this org has an explicit override for this flag. */
  overridden: boolean
  /** The value actually shown on the Switch — planValue when inherited, the override value when overridden. */
  effectiveValue: boolean
  /** Disables the Switch and reset button while a save is in flight. */
  disabled?: boolean
  onToggle: (next: boolean) => void
  onReset: () => void
}

export function EntitlementRow({
  label,
  planLabel,
  planValue,
  overridden,
  effectiveValue,
  disabled,
  onToggle,
  onReset,
}: EntitlementRowProps) {
  const id = useId()

  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="flex items-center gap-2.5">
        <Switch
          id={id}
          checked={effectiveValue}
          onCheckedChange={(checked) => onToggle(Boolean(checked))}
          disabled={disabled}
        />
        <Label htmlFor={id} className="flex flex-col items-start gap-0.5 font-normal">
          <span className="text-sm font-medium text-foreground">{label}</span>
          <span className="text-xs text-muted-foreground">
            {overridden ? `Custom value — plan default is ${planValue ? "on" : "off"}` : `Plan default (${planLabel})`}
          </span>
        </Label>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {overridden && (
          <>
            <Badge variant="outline" className="font-normal">
              Overridden
            </Badge>
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    onClick={onReset}
                    disabled={disabled}
                    aria-label={`Reset ${label} to plan default`}
                    className={cn(
                      "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
                    )}
                  />
                }
              >
                <RotateCcw aria-hidden="true" className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent>
                Removes the custom value — this org follows the plan going forward.
              </TooltipContent>
            </Tooltip>
          </>
        )}
      </div>
    </div>
  )
}
