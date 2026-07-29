"use client"

// Org-wide default for new FrontDesk conversations — "AI auto-replies for
// new conversations" (migration 0011 `business_brain.frontdesk_auto_reply`).
// Sets the starting `ai_mode` ('auto' vs 'off') new conversations are
// created with in src/app/api/frontdesk/chat/route.ts and
// src/app/api/twilio/sms/route.ts; the owner can always override any single
// thread from the Inbox via AiModeToggle regardless of this default.
// Persists via saveFrontdeskAutoReply (src/app/(app)/settings/brain/actions.ts),
// same standalone-card pattern as ./faq-card.tsx (local-only update + the
// standard "Demo mode — changes aren't saved." toast when Supabase isn't
// configured).

import { useState } from "react"
import { Sparkles } from "lucide-react"
import { toast } from "sonner"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

import { saveFrontdeskAutoReply } from "./brain/actions"

type FrontdeskAutoReplyCardProps = {
  initialEnabled: boolean
  /** False in demo mode (Supabase unconfigured) — the toggle only updates local state. */
  isLive: boolean
  className?: string
}

export function FrontdeskAutoReplyCard({ initialEnabled, isLive, className }: FrontdeskAutoReplyCardProps) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [isSaving, setIsSaving] = useState(false)

  async function persist(next: boolean) {
    const previous = enabled
    setEnabled(next)

    const successMessage = next
      ? "AI auto-replies enabled for new conversations"
      : "AI auto-replies disabled for new conversations"

    if (!isLive) {
      toast.success(successMessage, { description: "Demo mode — changes aren't saved." })
      return
    }

    setIsSaving(true)
    try {
      const result = await saveFrontdeskAutoReply(next)
      if (!result.ok) {
        setEnabled(previous)
        toast.error("Couldn't save AI auto-reply setting", { description: "Please try again." })
        return
      }
      toast.success(successMessage)
    } catch {
      setEnabled(previous)
      toast.error("Couldn't save AI auto-reply setting", { description: "Please try again." })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card size="sm" className={cn("max-w-2xl gap-3", className)}>
      <CardHeader className="gap-1">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
          >
            <Sparkles className="size-3.5" />
          </span>
          <CardTitle className="text-sm">AI auto-replies for new conversations</CardTitle>
        </div>
        <CardDescription className="text-xs">
          When a new conversation starts, Lumina can reply on its own — or just draft a reply and wait for you to
          send it. You can always override this for any single conversation from the Inbox.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-2">
        <Switch
          id="frontdesk-auto-reply-toggle"
          checked={enabled}
          onCheckedChange={(checked) => persist(Boolean(checked))}
          disabled={isSaving}
          aria-label="AI auto-replies for new conversations"
        />
        {/* Supplementary text only — Switch already carries the full aria-label; not a <label for> since base-ui's switch root is a button, not a native input. */}
        <span aria-hidden="true" className="text-xs font-medium text-muted-foreground">
          {enabled ? "On" : "Off"}
        </span>
      </CardContent>
    </Card>
  )
}
