"use client"

import type { BusinessBrain } from "@/lib/types"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import { CHANNEL_OPTIONS } from "../constants"

type ChannelsStepProps = {
  brain: BusinessBrain
  onChange: (patch: Partial<BusinessBrain>) => void
}

export function ChannelsStep({ brain, onChange }: ChannelsStepProps) {
  function toggleChannel(key: string, checked: boolean) {
    onChange({
      connected_channels: { ...brain.connected_channels, [key]: checked },
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Pick the channels LocalOS should watch and post to. Nothing connects yet — you can link
        real accounts any time from Settings.
      </p>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {CHANNEL_OPTIONS.map(({ key, label, icon: Icon }) => {
          const checked = Boolean(brain.connected_channels[key])
          return (
            <label
              key={key}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl p-4 ring-1 transition-colors",
                checked
                  ? "bg-primary/5 ring-2 ring-primary"
                  : "bg-card ring-foreground/10 hover:bg-muted/50"
              )}
            >
              <Checkbox
                checked={checked}
                onCheckedChange={(value) => toggleChannel(key, Boolean(value))}
                className="mt-0.5"
              />
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
                  {label}
                </span>
                <span className="text-xs text-muted-foreground">
                  Connect later — no live integration yet.
                </span>
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
