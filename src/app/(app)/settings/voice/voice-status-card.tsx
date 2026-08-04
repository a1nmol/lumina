"use client"

// Master on/off switch for the AI Phone Receptionist + status line — the
// first card on /settings/voice. Everything here is env-gated on
// RETELL_API_KEY (src/lib/voice/retell.ts#isRetellConfigured): when it's
// unset the switch is disabled with a designed "waiting on platform
// configuration" explanation rather than a broken/confusing control, per
// the wave's directive. Mirrors ./../frontdesk-auto-reply-card.tsx's
// Switch-with-optimistic-revert pattern.

import { useState } from "react"
import { Phone, TriangleAlert } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"

import { disableVoice, enableVoice } from "../voice-actions"

type VoiceStatusCardProps = {
  initialEnabled: boolean
  phoneNumber: string | null
  retellConfigured: boolean
  /** False in demo mode (Supabase unconfigured) — the switch only updates local state. */
  isLive: boolean
  className?: string
}

export function VoiceStatusCard({ initialEnabled, phoneNumber, retellConfigured, isLive, className }: VoiceStatusCardProps) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [saving, setSaving] = useState(false)

  const hasNumber = Boolean(phoneNumber)
  // Turning ON requires both the platform configured and a bound number;
  // turning an already-on receptionist OFF is always allowed regardless.
  const switchDisabled = saving || (!enabled && (!retellConfigured || !hasNumber))

  async function persist(next: boolean) {
    const previous = enabled
    setEnabled(next)

    if (!isLive) {
      toast.success(next ? "AI Receptionist enabled" : "AI Receptionist disabled", {
        description: "Demo mode — changes aren't saved.",
      })
      return
    }

    setSaving(true)
    try {
      const result = next ? await enableVoice() : await disableVoice()
      if (!result.ok) {
        setEnabled(previous)
        const fallbackDetail = "detail" in result ? result.detail : undefined
        const description =
          result.reason === "not_configured"
            ? "Lumina's calling platform isn't configured yet — this switch arms automatically once it is."
            : result.reason === "no_number"
              ? "Add a phone number first — see the Phone number section below."
              : (fallbackDetail ?? "Please try again.")
        toast.error(next ? "Couldn't turn on the AI Receptionist" : "Couldn't turn off the AI Receptionist", {
          description,
        })
        return
      }
      toast.success(next ? "AI Receptionist enabled" : "AI Receptionist disabled")
    } catch {
      setEnabled(previous)
      toast.error("Something went wrong", { description: "Please try again." })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
          >
            <Phone className="size-4" />
          </span>
          <CardTitle>AI Receptionist</CardTitle>
        </div>
        <CardDescription>
          Answers every call with the AI-assistant disclosure up front, texts back missed ones, and takes messages
          or books appointments — 24/7.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Switch
            id="voice-enabled-toggle"
            checked={enabled}
            onCheckedChange={(checked) => persist(Boolean(checked))}
            disabled={switchDisabled}
            aria-label="AI Receptionist"
          />
          <span aria-hidden="true" className="text-xs font-medium text-muted-foreground">
            {enabled ? "On" : "Off"}
          </span>
        </div>

        {!retellConfigured && (
          <Alert>
            <TriangleAlert aria-hidden="true" />
            <AlertDescription>
              Lumina&apos;s calling platform isn&apos;t configured yet — this switch arms automatically once it is.
            </AlertDescription>
          </Alert>
        )}

        {retellConfigured && !hasNumber && !enabled && (
          <p className="text-xs text-muted-foreground">
            Add a phone number first — see the Phone number section below.
          </p>
        )}

        <p className="text-sm text-muted-foreground">
          {phoneNumber ? (
            <>
              Bound number: <span className="font-medium text-foreground">{phoneNumber}</span>
            </>
          ) : (
            "No phone number connected yet."
          )}
        </p>
      </CardContent>
    </Card>
  )
}
