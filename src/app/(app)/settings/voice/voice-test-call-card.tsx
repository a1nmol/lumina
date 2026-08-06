"use client"

// Test call — a one-off outbound call from the org's bound number to any
// number the owner types in, so they can hear the AI Receptionist before
// trusting it with real callers. Disabled with honest copy until the
// platform is configured AND voice is actually turned on (a test call needs
// a provisioned, enabled agent — see src/app/(app)/settings/voice-actions.ts#requestTestCall).

import { useState } from "react"
import { Loader2, PhoneCall } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardIcon, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

import { requestTestCall } from "../voice-actions"

// Mirrors src/app/api/frontdesk/_shared.ts's PHONE_RE (see the same note in
// ./voice-transfer-budget-card.tsx — that module is server-only).
const PHONE_RE = /^\+?[0-9()\-\s]{7,20}$/

type VoiceTestCallCardProps = {
  canTestCall: boolean
  /** False in demo mode (Supabase unconfigured). */
  isLive: boolean
  className?: string
}

export function VoiceTestCallCard({ canTestCall, isLive, className }: VoiceTestCallCardProps) {
  const [toNumber, setToNumber] = useState("")
  const [requesting, setRequesting] = useState(false)

  const disabled = !canTestCall || requesting || !PHONE_RE.test(toNumber.trim())

  async function handleTestCall() {
    if (!isLive) {
      toast.success("Test call requested", { description: "Demo mode — no real call is placed." })
      return
    }

    setRequesting(true)
    try {
      const result = await requestTestCall(toNumber.trim())
      if (!result.ok) {
        const description =
          result.reason === "not_configured"
            ? "Lumina's calling platform isn't configured yet."
            : (result.detail ?? "Please try again.")
        toast.error("Couldn't place test call", { description })
        return
      }
      toast.success("Test call on its way", { description: `Answer at ${toNumber.trim()} in a few seconds.` })
    } catch {
      toast.error("Couldn't place test call", { description: "Please try again." })
    } finally {
      setRequesting(false)
    }
  }

  return (
    <Card className={cn("rounded-2xl shadow-raised ring-1 ring-border/40", className)}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardIcon>
            <PhoneCall />
          </CardIcon>
          <CardTitle>Test call</CardTitle>
        </div>
        <CardDescription>Have the AI Receptionist call any number so you can hear it in action.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {!canTestCall && (
          <p className="text-xs text-muted-foreground">
            Turn on the AI Receptionist above to unlock test calls.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="voice-test-call-number" className="sr-only">
            Number to call
          </Label>
          <Input
            id="voice-test-call-number"
            type="tel"
            value={toNumber}
            onChange={(event) => setToNumber(event.target.value)}
            placeholder="(555) 010-1000"
            disabled={!canTestCall || requesting}
            className="max-w-48"
          />
          <Button type="button" onClick={handleTestCall} disabled={disabled} className="gap-1.5">
            {requesting ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin" /> : <PhoneCall aria-hidden="true" className="size-3.5" />}
            {requesting ? "Calling…" : "Call me"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
