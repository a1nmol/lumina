"use client"

// Phone number section — shows the bound Lumina number when one exists;
// otherwise offers two paths: buy a Lumina number (disabled — purchasing
// isn't wired up yet, see src/lib/voice/retell.ts#importTwilioNumber's
// header) or forward an existing business line to whatever number Lumina
// eventually assigns, using the two standard carrier dial-code families
// (src/lib/voice/forwarding-codes.ts). Nothing here writes to the server —
// forwarding is dialed from the owner's own phone, not configured through
// Lumina.

import { useState } from "react"
import { Check, Copy, Hash, PhoneIncoming, ShoppingBag } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatForwardingCodes } from "@/lib/voice/forwarding-codes"

const COPY_RESET_MS = 1500

type VoicePhoneNumberCardProps = {
  phoneNumber: string | null
  className?: string
}

export function VoicePhoneNumberCard({ phoneNumber, className }: VoicePhoneNumberCardProps) {
  if (phoneNumber) {
    return (
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
            >
              <Hash className="size-4" />
            </span>
            <CardTitle>Phone number</CardTitle>
          </div>
          <CardDescription>Calls to this number ring your AI Receptionist.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="font-heading text-lg font-semibold text-foreground">{phoneNumber}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
          >
            <Hash className="size-4" />
          </span>
          <CardTitle>Phone number</CardTitle>
        </div>
        <CardDescription>Your AI Receptionist needs a number to answer. Pick one of the two options below.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 rounded-xl bg-muted/30 p-4 ring-1 ring-foreground/10">
          <div className="flex items-center gap-2">
            <ShoppingBag aria-hidden="true" className="size-4 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Get a Lumina number</p>
          </div>
          <p className="text-xs text-muted-foreground">
            We provision a dedicated number for your business — nothing to forward, works instantly.
          </p>
          <Button type="button" variant="outline" size="sm" disabled className="mt-1 self-start">
            Available once calling is configured — ~$1.15/mo
          </Button>
        </div>

        <ForwardingInstructions />
      </CardContent>
    </Card>
  )
}

function ForwardingInstructions() {
  const [targetNumber, setTargetNumber] = useState("")
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  const codes = formatForwardingCodes(targetNumber)

  async function handleCopy(id: string, code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedCode(id)
      toast.success("Code copied")
      window.setTimeout(() => setCopiedCode((current) => (current === id ? null : current)), COPY_RESET_MS)
    } catch {
      toast.error("Couldn't copy automatically — select the code and copy manually.")
    }
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-xl bg-muted/30 p-4 ring-1 ring-foreground/10">
      <div className="flex items-center gap-2">
        <PhoneIncoming aria-hidden="true" className="size-4 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">Forward your existing number</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Keep your current business number — forward it to your Lumina number instead. These are dialed from{" "}
        <span className="font-medium text-foreground">your</span> phone once; it&apos;s conditional forwarding
        only, so you lose nothing if you change your mind (just dial the deactivate code).
      </p>

      <div className="flex flex-col gap-1">
        <Label htmlFor="voice-forward-target" className="text-xs text-muted-foreground">
          Number to forward calls to
        </Label>
        <Input
          id="voice-forward-target"
          type="tel"
          value={targetNumber}
          onChange={(event) => setTargetNumber(event.target.value)}
          placeholder="(555) 020-2000"
          className="max-w-56"
        />
      </div>

      {codes && (
        <ul className="flex flex-col gap-2">
          {codes.map((code) => (
            <li
              key={code.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{code.carrierLabel}</p>
                <p className="font-mono text-sm text-foreground">{code.activateCode}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[0.7rem] text-muted-foreground">off: {code.deactivateCode}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  onClick={() => handleCopy(code.id, code.activateCode)}
                  aria-label={`Copy ${code.carrierLabel} forwarding code`}
                >
                  {copiedCode === code.id ? (
                    <Check aria-hidden="true" className="size-3.5" />
                  ) : (
                    <Copy aria-hidden="true" className="size-3.5" />
                  )}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
