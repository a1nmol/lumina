"use client"

// Greeting + after-hours script — two save-on-blur textareas, same shape as
// ./../frontdesk-auto-reply-card.tsx's "AI intro" block (dirty-state Save
// button appears only once the text actually differs from what's saved, so
// typing never fires a network call per keystroke).

import { useState } from "react"
import { Clock3, MessageSquareText } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardIcon, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

import { saveVoiceSettings } from "../voice-actions"

const MAX_SCRIPT_LENGTH = 500

type VoiceScriptsCardProps = {
  initialGreeting: string
  initialAfterHoursScript: string
  /** False in demo mode (Supabase unconfigured) — edits only update local state. */
  isLive: boolean
  className?: string
}

export function VoiceScriptsCard({ initialGreeting, initialAfterHoursScript, isLive, className }: VoiceScriptsCardProps) {
  const [greeting, setGreeting] = useState(initialGreeting)
  const [savedGreeting, setSavedGreeting] = useState(initialGreeting)
  const [savingGreeting, setSavingGreeting] = useState(false)

  const [afterHours, setAfterHours] = useState(initialAfterHoursScript)
  const [savedAfterHours, setSavedAfterHours] = useState(initialAfterHoursScript)
  const [savingAfterHours, setSavingAfterHours] = useState(false)

  async function persistGreeting() {
    const trimmed = greeting.trim()
    if (trimmed === savedGreeting.trim()) return

    if (!isLive) {
      setSavedGreeting(greeting)
      toast.success("Greeting updated", { description: "Demo mode — changes aren't saved." })
      return
    }

    setSavingGreeting(true)
    try {
      const result = await saveVoiceSettings({ greeting })
      if (!result.ok) {
        toast.error("Couldn't save greeting", { description: "Please try again." })
        return
      }
      setSavedGreeting(greeting)
      toast.success("Greeting updated")
    } catch {
      toast.error("Couldn't save greeting", { description: "Please try again." })
    } finally {
      setSavingGreeting(false)
    }
  }

  async function persistAfterHours() {
    const trimmed = afterHours.trim()
    if (trimmed === savedAfterHours.trim()) return

    if (!isLive) {
      setSavedAfterHours(afterHours)
      toast.success("After-hours script updated", { description: "Demo mode — changes aren't saved." })
      return
    }

    setSavingAfterHours(true)
    try {
      const result = await saveVoiceSettings({ afterHoursScript: afterHours })
      if (!result.ok) {
        toast.error("Couldn't save after-hours script", { description: "Please try again." })
        return
      }
      setSavedAfterHours(afterHours)
      toast.success("After-hours script updated")
    } catch {
      toast.error("Couldn't save after-hours script", { description: "Please try again." })
    } finally {
      setSavingAfterHours(false)
    }
  }

  const greetingDirty = greeting.trim() !== savedGreeting.trim()
  const afterHoursDirty = afterHours.trim() !== savedAfterHours.trim()

  return (
    <Card size="sm" className={cn("rounded-2xl shadow-raised ring-1 ring-border/40", className)}>
      <CardHeader className="gap-1">
        <div className="flex items-center gap-2">
          <CardIcon size="sm">
            <MessageSquareText />
          </CardIcon>
          <CardTitle className="text-sm">Greeting</CardTitle>
        </div>
        <CardDescription className="text-xs">
          Your greeting follows the required &quot;this call may be recorded&quot; AI-assistant disclosure line —
          write what comes right after it, like the question you&apos;d normally open with.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <Textarea
          value={greeting}
          onChange={(event) => setGreeting(event.target.value.slice(0, MAX_SCRIPT_LENGTH))}
          onBlur={persistGreeting}
          placeholder="How can I help you today?"
          aria-label="Greeting"
          disabled={savingGreeting}
          className="min-h-16"
        />
        <div className="flex items-center justify-end gap-2">
          {greetingDirty && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-6 px-2 text-xs"
              disabled={savingGreeting}
              onClick={persistGreeting}
            >
              {savingGreeting ? "Saving…" : "Save"}
            </Button>
          )}
          <span className="text-[0.7rem] text-muted-foreground tabular-nums">
            {greeting.length}/{MAX_SCRIPT_LENGTH}
          </span>
        </div>
      </CardContent>

      <div className="mx-4 border-t border-border" aria-hidden="true" />

      <CardHeader className="gap-1">
        <div className="flex items-center gap-2">
          <CardIcon size="sm">
            <Clock3 />
          </CardIcon>
          <CardTitle className="text-sm">After-hours script</CardTitle>
        </div>
        <CardDescription className="text-xs">
          Used instead of the greeting above when a call comes in outside your business hours. Leave blank to use
          the same greeting around the clock.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <Textarea
          value={afterHours}
          onChange={(event) => setAfterHours(event.target.value.slice(0, MAX_SCRIPT_LENGTH))}
          onBlur={persistAfterHours}
          placeholder="Thanks for calling — we're closed right now, but I can take a message and we'll follow up first thing."
          aria-label="After-hours script"
          disabled={savingAfterHours}
          className="min-h-16"
        />
        <div className="flex items-center justify-end gap-2">
          {afterHoursDirty && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-6 px-2 text-xs"
              disabled={savingAfterHours}
              onClick={persistAfterHours}
            >
              {savingAfterHours ? "Saving…" : "Save"}
            </Button>
          )}
          <span className="text-[0.7rem] text-muted-foreground tabular-nums">
            {afterHours.length}/{MAX_SCRIPT_LENGTH}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
