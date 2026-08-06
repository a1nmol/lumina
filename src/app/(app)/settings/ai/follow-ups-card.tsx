"use client"

// "Proactive follow-ups" card — Settings hub -> AI behaviour (redesign R2,
// migration 0022 `business_brain.follow_ups_enabled`). This is the real,
// honest toggle for src/lib/follow-ups.ts's daily scan: once a day (folded
// into the morning-brief cron), Lumina looks for conversations the business
// answered and the customer went quiet on for 2-7 days, and drafts a short
// check-in nudge — always as a draft, never sent automatically. The
// "[no-followups]" standing-order token (src/app/(app)/settings/ai/
// standing-orders-card.tsx) still works as a legacy escape hatch on top of
// this toggle. Persists via saveFollowUpsEnabled
// (src/app/(app)/settings/brain/actions.ts), same standalone-card pattern as
// ./auto-replies-card.tsx.

import { useState } from "react"
import { MessagesSquare } from "lucide-react"
import { toast } from "sonner"

import { Card, CardContent, CardDescription, CardHeader, CardIcon, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

import { saveFollowUpsEnabled } from "../brain/actions"

type FollowUpsCardProps = {
  initialEnabled: boolean
  /** False in demo mode (Supabase unconfigured) — the toggle only updates local state. */
  isLive: boolean
  className?: string
}

export function FollowUpsCard({ initialEnabled, isLive, className }: FollowUpsCardProps) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [isSaving, setIsSaving] = useState(false)

  async function persist(next: boolean) {
    const previous = enabled
    setEnabled(next)

    const successMessage = next ? "Proactive follow-ups enabled" : "Proactive follow-ups disabled"

    if (!isLive) {
      toast.success(successMessage, { description: "Demo mode — changes aren't saved." })
      return
    }

    setIsSaving(true)
    try {
      const result = await saveFollowUpsEnabled(next)
      if (!result.ok) {
        setEnabled(previous)
        toast.error("Couldn't save follow-ups setting", { description: "Please try again." })
        return
      }
      toast.success(successMessage)
    } catch {
      setEnabled(previous)
      toast.error("Couldn't save follow-ups setting", { description: "Please try again." })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card size="sm" className={cn("gap-3 rounded-2xl shadow-raised ring-1 ring-border/40", className)}>
      <CardHeader className="gap-1">
        <div className="flex items-center gap-2">
          <CardIcon size="sm">
            <MessagesSquare />
          </CardIcon>
          <CardTitle className="text-sm">Proactive follow-ups</CardTitle>
        </div>
        <CardDescription className="text-xs">
          Once a day, I check for conversations you answered that went quiet for a few days and draft a short
          check-in — always a draft in your Inbox, never sent without you.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-2">
        <Switch
          id="follow-ups-toggle"
          checked={enabled}
          onCheckedChange={(checked) => persist(Boolean(checked))}
          disabled={isSaving}
          aria-label="Proactive follow-ups"
        />
        <span aria-hidden="true" className="text-xs font-medium text-muted-foreground">
          {enabled ? "On" : "Off"}
        </span>
      </CardContent>
    </Card>
  )
}
