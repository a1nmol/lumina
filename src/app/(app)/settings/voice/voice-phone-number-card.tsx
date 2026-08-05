"use client"

// Phone number section — shows the bound Lumina number when one exists
// (plus the dial-once forwarding codes computed FROM that number);
// otherwise explains the two paths without letting the owner generate
// anything yet. UX fix (owner confusion, 2026-08-04): the forwarding codes
// embed the LUMINA number (the forward-to target) — before one exists there
// is nothing meaningful to generate, and a free-form input here led the
// owner to type their own cell and get codes that would forward their phone
// to itself. The target is therefore locked to the bound number, never
// typed. Nothing here writes to the server — forwarding is dialed from the
// owner's own phone, not configured through Lumina.

import { useState } from "react"
import { Check, Copy, Hash, PhoneIncoming, ShoppingBag } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardIcon, CardTitle } from "@/components/ui/card"
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
            <CardIcon>
              <Hash />
            </CardIcon>
            <CardTitle>Phone number</CardTitle>
          </div>
          <CardDescription>Calls to this number ring your AI Receptionist.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* A phone number is a numeral display, not a headline — font-mono + tabular-nums, not the display serif. */}
          <p className="font-mono text-lg font-semibold text-foreground tabular-nums">{phoneNumber}</p>
          <ForwardingInstructions luminaNumber={phoneNumber} />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardIcon>
            <Hash />
          </CardIcon>
          <CardTitle>Phone number</CardTitle>
        </div>
        <CardDescription>Your AI Receptionist needs a number to answer. Here&apos;s how it works.</CardDescription>
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
            Available once calling is configured
          </Button>
        </div>

        <div className="flex flex-col gap-2 rounded-xl bg-muted/30 p-4 ring-1 ring-foreground/10">
          <div className="flex items-center gap-2">
            <PhoneIncoming aria-hidden="true" className="size-4 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Keep your own number</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Once your Lumina number is ready, a dial-once forwarding code will appear right here. You dial it from
            your phone one time, and only the calls you <span className="font-medium text-foreground">don&apos;t</span>{" "}
            answer go to your AI. Your phone stays yours — a second code turns it off anytime.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function ForwardingInstructions({ luminaNumber }: { luminaNumber: string }) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  const codes = formatForwardingCodes(luminaNumber)
  if (!codes) return null

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
        <p className="text-sm font-medium text-foreground">Forward your own number here</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Want calls to your existing number answered too? Dial the code for your carrier once, from{" "}
        <span className="font-medium text-foreground">your</span> phone. It&apos;s conditional forwarding — only
        calls you don&apos;t answer reach your AI, and the &quot;off&quot; code undoes it anytime.
      </p>

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
    </div>
  )
}
