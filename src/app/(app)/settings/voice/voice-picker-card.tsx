"use client"

// Voice picker — radio-card list from the curated stock-voice catalog
// (src/lib/voice/catalog.ts). Same role/keyboard/selected-ring pattern as
// src/app/(app)/settings/brain/steps/voice-brand-step.tsx's brand-voice
// picker, so the two "pick one of these tone options" surfaces in Settings
// read like the same family. Saves immediately on selection (optimistic,
// revert on failure) — there's nothing to draft here, just a choice.

import { useRef, useState } from "react"
import { Check, Crown } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { DEFAULT_VOICE_ID, VOICE_CATALOG } from "@/lib/voice/catalog"

import { saveVoiceSettings } from "../voice-actions"

type VoicePickerCardProps = {
  initialVoiceId: string | null
  /** False in demo mode (Supabase unconfigured) — selecting a voice only updates local state. */
  isLive: boolean
  className?: string
}

export function VoicePickerCard({ initialVoiceId, isLive, className }: VoicePickerCardProps) {
  const [voiceId, setVoiceId] = useState(initialVoiceId ?? DEFAULT_VOICE_ID)
  const radioRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [saving, setSaving] = useState(false)

  async function selectVoice(id: string) {
    if (id === voiceId || saving) return
    const previous = voiceId
    setVoiceId(id)

    if (!isLive) {
      toast.success("Voice updated", { description: "Demo mode — changes aren't saved." })
      return
    }

    setSaving(true)
    try {
      const result = await saveVoiceSettings({ voiceId: id })
      if (!result.ok) {
        setVoiceId(previous)
        toast.error("Couldn't save voice", { description: "Please try again." })
        return
      }
      toast.success("Voice updated")
    } catch {
      setVoiceId(previous)
      toast.error("Couldn't save voice", { description: "Please try again." })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className={cn("rounded-2xl shadow-raised ring-1 ring-border/40", className)}>
      <CardHeader>
        <CardTitle>Voice</CardTitle>
        <CardDescription>Who your AI Receptionist sounds like on the phone.</CardDescription>
      </CardHeader>
      <CardContent>
        <div
          role="radiogroup"
          aria-label="Voice"
          className="grid gap-2.5 sm:grid-cols-2"
          onKeyDown={(event) => {
            // Roving radiogroup arrow-nav (review nit) — one Tab stop, arrows
            // move selection, mirroring reply-composer's mode pills.
            const currentIndex = VOICE_CATALOG.findIndex((entry) => entry.id === voiceId)
            if (currentIndex === -1) return
            let nextIndex: number | null = null
            if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (currentIndex + 1) % VOICE_CATALOG.length
            if (event.key === "ArrowLeft" || event.key === "ArrowUp")
              nextIndex = (currentIndex - 1 + VOICE_CATALOG.length) % VOICE_CATALOG.length
            if (event.key === "Home") nextIndex = 0
            if (event.key === "End") nextIndex = VOICE_CATALOG.length - 1
            if (nextIndex === null) return
            event.preventDefault()
            const next = VOICE_CATALOG[nextIndex]
            if (next) {
              void selectVoice(next.id)
              radioRefs.current[nextIndex]?.focus()
            }
          }}
        >
          {VOICE_CATALOG.map((entry, index) => {
            const isSelected = entry.id === voiceId
            return (
              <button
                key={entry.id}
                ref={(el) => {
                  radioRefs.current[index] = el
                }}
                type="button"
                role="radio"
                aria-checked={isSelected}
                tabIndex={isSelected ? 0 : -1}
                disabled={saving}
                onClick={() => selectVoice(entry.id)}
                className={cn(
                  "relative flex flex-col gap-1 rounded-xl p-3.5 text-left ring-1 outline-none transition-colors focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
                  isSelected ? "bg-primary/5 ring-2 ring-primary" : "bg-card ring-border/40 hover:bg-muted/50"
                )}
              >
                {isSelected && (
                  <span className="absolute top-3 right-3 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check aria-hidden="true" className="size-2.5" />
                  </span>
                )}
                <span className="flex items-center gap-1.5 pr-6 text-sm font-medium text-foreground">
                  {entry.label}
                  <Badge variant="outline" className="font-normal capitalize">
                    {entry.gender}
                  </Badge>
                </span>
                <span className="text-xs text-muted-foreground">{entry.vibe}</span>
              </button>
            )
          })}

          <div
            aria-disabled="true"
            className="flex flex-col gap-1 rounded-xl p-3.5 text-left ring-1 ring-border/40 opacity-60"
          >
            <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              Your own voice
              <Badge variant="secondary" className="gap-1 font-normal">
                <Crown aria-hidden="true" className="size-3" />
                Premium — coming soon
              </Badge>
            </span>
            <span className="text-xs text-muted-foreground">Clone your own voice for the AI to speak in.</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
