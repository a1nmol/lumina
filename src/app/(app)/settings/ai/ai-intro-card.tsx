"use client"

// "Honest AI intro" card — Settings hub -> AI behaviour (migration 0013
// `business_brain.ai_intro_enabled` / `.ai_intro_text`) — the owner's own
// one-time disclosure line, sent by src/lib/ai/intro.ts#getIntroToSend at
// the start of a new conversation or after a long quiet gap, never on every
// message. Persists via saveAiIntro; the Switch saves immediately, the
// Textarea saves on blur (typing shouldn't fire a network call per
// keystroke).
//
// Redesign R2: split out of the old, misleadingly-titled
// "AI auto-replies for new conversations" card — see ./auto-replies-card.tsx
// and ./always-on-card.tsx for the other two. Behavior here is unchanged,
// just its own honestly-scoped card.

import { useState } from "react"
import { MessageSquareText } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardIcon, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

import { saveAiIntro } from "../brain/actions"

const MAX_AI_INTRO_TEXT = 500

type AiIntroCardProps = {
  initialIntroEnabled: boolean
  initialIntroText: string
  /** False in demo mode (Supabase unconfigured) — edits only update local state. */
  isLive: boolean
  className?: string
}

export function AiIntroCard({ initialIntroEnabled, initialIntroText, isLive, className }: AiIntroCardProps) {
  const [introEnabled, setIntroEnabled] = useState(initialIntroEnabled)
  const [introText, setIntroText] = useState(initialIntroText)
  const [savedIntroText, setSavedIntroText] = useState(initialIntroText)
  const [isSavingIntro, setIsSavingIntro] = useState(false)

  async function persistIntro(nextEnabled: boolean, nextText: string) {
    const previousEnabled = introEnabled
    const previousText = introText
    setIntroEnabled(nextEnabled)
    setIntroText(nextText)

    const successMessage = nextEnabled ? "Honest AI intro enabled" : "Honest AI intro disabled"

    if (!isLive) {
      setSavedIntroText(nextText)
      toast.success(successMessage, { description: "Demo mode — changes aren't saved." })
      return
    }

    setIsSavingIntro(true)
    try {
      const result = await saveAiIntro(nextEnabled, nextText)
      if (!result.ok) {
        setIntroEnabled(previousEnabled)
        setIntroText(previousText)
        toast.error("Couldn't save the AI intro", { description: "Please try again." })
        return
      }
      setSavedIntroText(nextText)
      toast.success(successMessage)
    } catch {
      setIntroEnabled(previousEnabled)
      setIntroText(previousText)
      toast.error("Couldn't save the AI intro", { description: "Please try again." })
    } finally {
      setIsSavingIntro(false)
    }
  }

  const hasUnsavedIntroText = introText.trim() !== savedIntroText.trim()

  function handleIntroTextBlur() {
    if (!hasUnsavedIntroText) return
    void persistIntro(introEnabled, introText)
  }

  return (
    <Card size="sm" className={cn("gap-3 rounded-2xl shadow-raised ring-1 ring-border/40", className)}>
      <CardHeader className="gap-1">
        <div className="flex items-center gap-2">
          <CardIcon size="sm">
            <MessageSquareText />
          </CardIcon>
          <CardTitle className="text-sm">Honest AI intro</CardTitle>
        </div>
        <CardDescription className="text-xs">
          I&apos;ll send this once, at the start of a new conversation (or after 2+ quiet hours) — in your own words,
          so people know it&apos;s me they&apos;re talking to. Never added to every message.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Switch
            id="ai-intro-toggle"
            checked={introEnabled}
            onCheckedChange={(checked) => persistIntro(Boolean(checked), introText)}
            disabled={isSavingIntro}
            aria-label="Honest AI intro"
          />
          <span aria-hidden="true" className="text-xs font-medium text-muted-foreground">
            {introEnabled ? "On" : "Off"}
          </span>
        </div>
        {introEnabled && introText.trim().length === 0 && (
          <p role="status" className="text-xs text-warning">
            Nothing will be sent until you write your intro below.
          </p>
        )}
        <div className="flex flex-col gap-1">
          <Textarea
            id="ai-intro-text"
            value={introText}
            onChange={(event) => setIntroText(event.target.value.slice(0, MAX_AI_INTRO_TEXT))}
            onBlur={handleIntroTextBlur}
            disabled={!introEnabled || isSavingIntro}
            placeholder="You're not chatting with me right now — this is an AI I set up. Leave your message and I'll see it soon."
            aria-label="Honest AI intro message"
            className="min-h-20"
          />
          <div className="flex items-center justify-end gap-2">
            {hasUnsavedIntroText && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-6 px-2 text-xs"
                disabled={isSavingIntro}
                onClick={() => persistIntro(introEnabled, introText)}
              >
                {isSavingIntro ? "Saving…" : "Save intro"}
              </Button>
            )}
            <span className="text-[0.7rem] text-muted-foreground tabular-nums">
              {introText.length}/{MAX_AI_INTRO_TEXT}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
