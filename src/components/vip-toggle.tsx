"use client"

// Shared VIP toggle button (Commander update wave B1, migration 0016
// contacts.is_vip) — reused wherever a contact's identity is shown: the
// Inbox context pane (src/components/inbox/context-pane.tsx) and the
// Contacts drawer quick-view (src/app/(app)/contacts/contact-drawer.tsx).
// Filled star = VIP (AI drafts only, never auto-sends — see the three
// channel routes' VIP gate + src/lib/email.ts#sendVipAlertEmail); outline
// star = not VIP. A single small button, not a segmented control, since
// this is a boolean flag, not a multi-state setting like AiModeToggle.

import { Star } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type VipToggleProps = {
  isVip: boolean
  onToggle: () => void
  disabled?: boolean
  className?: string
}

const TOOLTIP = "VIP: AI never auto-replies, you get alerted"

export function VipToggle({ isVip, onToggle, disabled, className }: VipToggleProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={isVip}
      title={TOOLTIP}
      aria-label={isVip ? `${TOOLTIP} — currently VIP, click to remove` : `${TOOLTIP} — not VIP, click to mark VIP`}
      className={cn(
        "shrink-0 transition-colors",
        isVip ? "text-warning hover:text-warning" : "text-muted-foreground hover:text-foreground",
        disabled && "pointer-events-none opacity-60",
        className
      )}
    >
      <Star aria-hidden="true" className={cn("size-4", isVip && "fill-current")} />
    </Button>
  )
}
