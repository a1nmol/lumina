"use client"

// Transfer number + monthly minute budget — the two "how far does this go"
// knobs for the AI Receptionist. Save-on-blur for both fields (matching
// ./voice-scripts-card.tsx), plus a live usage bar for this month's voice
// minutes so the budget number isn't just abstract.

import { useState } from "react"
import { PhoneForwarded, Timer } from "lucide-react"
import { toast } from "sonner"

import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"

import { UsageBar } from "../usage-bar"
import { saveVoiceSettings } from "../voice-actions"

// Mirrors src/app/api/frontdesk/_shared.ts's PHONE_RE — that module is
// "server-only" and can't be imported from this client component, so this
// is a deliberate, documented duplicate for client-side validation only.
// The server action re-validates with the real PHONE_RE regardless.
const PHONE_RE = /^\+?[0-9()\-\s]{7,20}$/

const MIN_MAX_MINUTES = 5
const MAX_MAX_MINUTES = 1000

type VoiceTransferBudgetCardProps = {
  initialTransferNumber: string
  initialMaxMinutesMonth: number
  usedMinutesThisMonth: number
  /** False in demo mode (Supabase unconfigured) — edits only update local state. */
  isLive: boolean
  className?: string
}

export function VoiceTransferBudgetCard({
  initialTransferNumber,
  initialMaxMinutesMonth,
  usedMinutesThisMonth,
  isLive,
  className,
}: VoiceTransferBudgetCardProps) {
  const [transferNumber, setTransferNumber] = useState(initialTransferNumber)
  const [savedTransferNumber, setSavedTransferNumber] = useState(initialTransferNumber)
  const [savingTransfer, setSavingTransfer] = useState(false)
  const [transferError, setTransferError] = useState(false)

  const [maxMinutes, setMaxMinutes] = useState(String(initialMaxMinutesMonth))
  const [savedMaxMinutes, setSavedMaxMinutes] = useState(initialMaxMinutesMonth)
  const [savingMaxMinutes, setSavingMaxMinutes] = useState(false)

  async function persistTransferNumber() {
    const trimmed = transferNumber.trim()
    if (trimmed === savedTransferNumber.trim()) return

    if (trimmed !== "" && !PHONE_RE.test(trimmed)) {
      setTransferError(true)
      toast.error("That doesn't look like a valid phone number", { description: "Try including the area code." })
      return
    }
    setTransferError(false)

    if (!isLive) {
      setSavedTransferNumber(transferNumber)
      toast.success("Transfer number updated", { description: "Demo mode — changes aren't saved." })
      return
    }

    setSavingTransfer(true)
    try {
      const result = await saveVoiceSettings({ transferNumber })
      if (!result.ok) {
        toast.error("Couldn't save transfer number", { description: "Please try again." })
        return
      }
      setSavedTransferNumber(transferNumber)
      toast.success("Transfer number updated")
    } catch {
      toast.error("Couldn't save transfer number", { description: "Please try again." })
    } finally {
      setSavingTransfer(false)
    }
  }

  async function persistMaxMinutes() {
    const parsed = Number(maxMinutes)
    if (!Number.isFinite(parsed) || parsed < MIN_MAX_MINUTES || parsed > MAX_MAX_MINUTES) {
      toast.error("Enter a number between 5 and 1000 minutes")
      setMaxMinutes(String(savedMaxMinutes))
      return
    }
    const rounded = Math.round(parsed)
    if (rounded === savedMaxMinutes) {
      setMaxMinutes(String(rounded))
      return
    }

    if (!isLive) {
      setSavedMaxMinutes(rounded)
      setMaxMinutes(String(rounded))
      toast.success("Monthly minute budget updated", { description: "Demo mode — changes aren't saved." })
      return
    }

    setSavingMaxMinutes(true)
    try {
      const result = await saveVoiceSettings({ maxMinutesMonth: rounded })
      if (!result.ok) {
        toast.error("Couldn't save minute budget", { description: "Please try again." })
        setMaxMinutes(String(savedMaxMinutes))
        return
      }
      setSavedMaxMinutes(rounded)
      setMaxMinutes(String(rounded))
      toast.success("Monthly minute budget updated")
    } catch {
      toast.error("Couldn't save minute budget", { description: "Please try again." })
      setMaxMinutes(String(savedMaxMinutes))
    } finally {
      setSavingMaxMinutes(false)
    }
  }

  const cap = savedMaxMinutes
  const percent = cap > 0 ? Math.min(100, (usedMinutesThisMonth / cap) * 100) : 0
  const nearLimit = cap > 0 && usedMinutesThisMonth / cap >= 0.9

  return (
    <Card size="sm" className={className}>
      <CardHeader className="gap-1">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
          >
            <PhoneForwarded className="size-3.5" />
          </span>
          <CardTitle className="text-sm">Transfer to a human</CardTitle>
        </div>
        <CardDescription className="text-xs">
          Urgent calls get offered a transfer here — leave blank to always take a message instead.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5">
        <Label htmlFor="voice-transfer-number" className="sr-only">
          Transfer number
        </Label>
        <Input
          id="voice-transfer-number"
          type="tel"
          value={transferNumber}
          onChange={(event) => {
            setTransferNumber(event.target.value)
            setTransferError(false)
          }}
          onBlur={persistTransferNumber}
          placeholder="(555) 010-1000"
          disabled={savingTransfer}
          aria-invalid={transferError}
          className="max-w-64"
        />
      </CardContent>

      <div className="mx-4 border-t border-border" aria-hidden="true" />

      <CardHeader className="gap-1">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
          >
            <Timer className="size-3.5" />
          </span>
          <CardTitle className="text-sm">Monthly minute budget</CardTitle>
        </div>
        <CardDescription className="text-xs">
          The AI stops taking calls past this many minutes each month — you get an email first.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Label htmlFor="voice-max-minutes" className="sr-only">
            Monthly minute budget
          </Label>
          <Input
            id="voice-max-minutes"
            type="number"
            inputMode="numeric"
            min={MIN_MAX_MINUTES}
            max={MAX_MAX_MINUTES}
            value={maxMinutes}
            onChange={(event) => setMaxMinutes(event.target.value)}
            onBlur={persistMaxMinutes}
            disabled={savingMaxMinutes}
            className="w-24"
          />
          <span className="text-sm text-muted-foreground">minutes / month</span>
        </div>
        <UsageBar
          label="Voice minutes used"
          percent={percent}
          valueText={`${Math.round(usedMinutesThisMonth)} / ${cap} min`}
          nearLimit={nearLimit}
        />
      </CardContent>
    </Card>
  )
}
