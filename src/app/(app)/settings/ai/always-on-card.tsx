"use client"

// "Always on" card — Settings hub -> AI behaviour (Commander update,
// migration 0015 `business_brain.ai_always_on`): the AI never fully hands a
// conversation off, even when it flags a topic for the owner (see the
// smart-escalation contract in src/lib/ai/frontdesk-reply.ts's
// ESCALATION_GUIDE). Persists via saveAiAlwaysOn immediately on toggle.
//
// Redesign R2: split out of the old, misleadingly-titled
// "AI auto-replies for new conversations" card — see ./auto-replies-card.tsx
// and ./ai-intro-card.tsx for the other two. Behavior here is unchanged,
// just its own honestly-scoped card.

import { useState } from "react"
import { Infinity as InfinityIcon } from "lucide-react"
import { toast } from "sonner"

import { Card, CardContent, CardDescription, CardHeader, CardIcon, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

import { saveAiAlwaysOn } from "../brain/actions"

type AlwaysOnCardProps = {
  initialAlwaysOn: boolean
  /** False in demo mode (Supabase unconfigured) — the toggle only updates local state. */
  isLive: boolean
  className?: string
}

export function AlwaysOnCard({ initialAlwaysOn, isLive, className }: AlwaysOnCardProps) {
  const [alwaysOn, setAlwaysOn] = useState(initialAlwaysOn)
  const [isSavingAlwaysOn, setIsSavingAlwaysOn] = useState(false)

  async function persistAlwaysOn(next: boolean) {
    const previous = alwaysOn
    setAlwaysOn(next)

    const successMessage = next ? "Always on enabled" : "Always on disabled"

    if (!isLive) {
      toast.success(successMessage, { description: "Demo mode — changes aren't saved." })
      return
    }

    setIsSavingAlwaysOn(true)
    try {
      const result = await saveAiAlwaysOn(next)
      if (!result.ok) {
        setAlwaysOn(previous)
        toast.error("Couldn't save the Always on setting", { description: "Please try again." })
        return
      }
      toast.success(successMessage)
    } catch {
      setAlwaysOn(previous)
      toast.error("Couldn't save the Always on setting", { description: "Please try again." })
    } finally {
      setIsSavingAlwaysOn(false)
    }
  }

  return (
    <Card size="sm" className={cn("gap-3 rounded-2xl shadow-raised ring-1 ring-border/40", className)}>
      <CardHeader className="gap-1">
        <div className="flex items-center gap-2">
          <CardIcon size="sm">
            <InfinityIcon />
          </CardIcon>
          <CardTitle className="text-sm">Always on</CardTitle>
        </div>
        <CardDescription className="text-xs">
          I never go quiet. I can still flag topics for you, but I keep the conversation going instead of stopping.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-2">
        <Switch
          id="ai-always-on-toggle"
          checked={alwaysOn}
          onCheckedChange={(checked) => persistAlwaysOn(Boolean(checked))}
          disabled={isSavingAlwaysOn}
          aria-label="Always on"
        />
        <span aria-hidden="true" className="text-xs font-medium text-muted-foreground">
          {alwaysOn ? "On" : "Off"}
        </span>
      </CardContent>
    </Card>
  )
}
