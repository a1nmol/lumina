// Read-only "which channels are connected" indicator — reused by the
// Accounts table's icon row and the org-detail Sheet's Channels section
// (design brief item 6: "Channels: read-only connected badges"). Reuses the
// same channel catalog as the Business Brain onboarding wizard's channels
// step (src/app/(app)/settings/brain/constants.ts) rather than inventing a
// second list.

import { CHANNEL_OPTIONS } from "@/app/(app)/settings/brain/constants"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { ConnectedChannels } from "@/lib/types"

interface ChannelIconRowProps {
  connectedChannels: ConnectedChannels
  className?: string
}

/** Compact icon row for the Accounts table — connected channels are solid, everything else is faint. Never color-only: each icon has an accessible name via its Tooltip. */
export function ChannelIconRow({ connectedChannels, className }: ChannelIconRowProps) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {CHANNEL_OPTIONS.map(({ key, label, icon: Icon }) => {
        const connected = Boolean(connectedChannels[key])
        return (
          <Tooltip key={key}>
            <TooltipTrigger
              render={
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-md",
                    connected ? "bg-primary/10 text-primary" : "text-muted-foreground/40"
                  )}
                />
              }
            >
              <Icon aria-hidden="true" className="size-3" />
              <span className="sr-only">
                {label} — {connected ? "connected" : "not connected"}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {label} — {connected ? "connected" : "not connected"}
            </TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}

/** Fuller read-only badge list for the Sheet's Channels section. */
export function ChannelBadgeList({ connectedChannels, className }: ChannelIconRowProps) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {CHANNEL_OPTIONS.map(({ key, label, icon: Icon }) => {
        const connected = Boolean(connectedChannels[key])
        return (
          <span
            key={key}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
              connected
                ? "border-primary/20 bg-primary/10 text-primary"
                : "border-border text-muted-foreground"
            )}
          >
            <Icon aria-hidden="true" className="size-3" />
            {label}
          </span>
        )
      })}
    </div>
  )
}
