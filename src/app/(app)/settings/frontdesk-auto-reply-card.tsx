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
//
// Same card also carries the Honest-AI intro block (migration 0013
// `business_brain.ai_intro_enabled` / `.ai_intro_text`) — the owner's own
// one-time disclosure line, sent by src/lib/ai/intro.ts#getIntroToSend at
// the start of a new conversation or after a long quiet gap, never on every
// message. Lives in this card (not its own) because it's a second lever on
// the exact same "how does the AI announce itself" decision. Persists via
// saveAiIntro; the Switch saves immediately like the auto-reply toggle
// above, the Textarea saves on blur (typing shouldn't fire a network call
// per keystroke).
//
// Third block — "Always on" (Commander update, migration 0015
// `business_brain.ai_always_on`): the AI never fully hands a conversation
// off, even when it flags a topic for the owner (see the smart-escalation
// contract in src/lib/ai/frontdesk-reply.ts's ESCALATION_GUIDE). Same
// icon-chip/title/description/Switch language as the two blocks above,
// persists via saveAiAlwaysOn immediately on toggle.

import { useState } from "react"
import { Infinity as InfinityIcon, MessageSquareText, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardIcon, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

import { saveAiAlwaysOn, saveAiIntro, saveFrontdeskAutoReply } from "./brain/actions"

const MAX_AI_INTRO_TEXT = 500

type FrontdeskAutoReplyCardProps = {
  initialEnabled: boolean
  initialIntroEnabled: boolean
  initialIntroText: string
  initialAlwaysOn: boolean
  /** False in demo mode (Supabase unconfigured) — the toggle only updates local state. */
  isLive: boolean
  className?: string
}

export function FrontdeskAutoReplyCard({
  initialEnabled,
  initialIntroEnabled,
  initialIntroText,
  initialAlwaysOn,
  isLive,
  className,
}: FrontdeskAutoReplyCardProps) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [isSaving, setIsSaving] = useState(false)

  const [introEnabled, setIntroEnabled] = useState(initialIntroEnabled)
  const [introText, setIntroText] = useState(initialIntroText)
  const [savedIntroText, setSavedIntroText] = useState(initialIntroText)
  const [isSavingIntro, setIsSavingIntro] = useState(false)

  const [alwaysOn, setAlwaysOn] = useState(initialAlwaysOn)
  const [isSavingAlwaysOn, setIsSavingAlwaysOn] = useState(false)

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
    <Card size="sm" className={cn("max-w-2xl gap-3", className)}>
      <CardHeader className="gap-1">
        <div className="flex items-center gap-2">
          <CardIcon size="sm">
            <Sparkles />
          </CardIcon>
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

      <div className="mx-4 border-t border-border" aria-hidden="true" />

      <CardHeader className="gap-1">
        <div className="flex items-center gap-2">
          <CardIcon size="sm">
            <MessageSquareText />
          </CardIcon>
          <CardTitle className="text-sm">Honest AI intro</CardTitle>
        </div>
        <CardDescription className="text-xs">
          Sent once at the start of a new conversation (or after 2+ quiet hours), in your own words, so people know
          when it&apos;s the AI talking. Never added to every message.
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

      <div className="mx-4 border-t border-border" aria-hidden="true" />

      <CardHeader className="gap-1">
        <div className="flex items-center gap-2">
          <CardIcon size="sm">
            <InfinityIcon />
          </CardIcon>
          <CardTitle className="text-sm">Always on</CardTitle>
        </div>
        <CardDescription className="text-xs">
          The AI never goes quiet. It can still flag topics for you, but it keeps the conversation going instead of
          stopping.
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
