// Settings hub entry point for the AI Phone Receptionist (wave V2 — the
// full config surface lives at /settings/voice, a subpage rather than a
// card here since the hub is already carrying 7 cards). Server component —
// just a status badge + a link, no interactivity of its own. Mirrors
// ./brain-summary-card.tsx's "summary card links to the full surface"
// convention.

import Link from "next/link"
import { Phone } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardIcon, CardTitle } from "@/components/ui/card"
import type { OrgVoiceSettings } from "@/lib/types"

type VoiceEntryCardProps = {
  settings: OrgVoiceSettings | null
  retellConfigured: boolean
}

export function VoiceEntryCard({ settings, retellConfigured }: VoiceEntryCardProps) {
  const status = !retellConfigured
    ? { label: "Not configured", className: "border-border bg-muted text-muted-foreground" }
    : settings?.enabled
      ? { label: "On", className: "border-success/30 bg-success/10 text-success" }
      : { label: "Off", className: "border-border bg-muted text-muted-foreground" }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CardIcon>
              <Phone />
            </CardIcon>
            <CardTitle>AI Receptionist</CardTitle>
          </div>
          <Badge variant="outline" className={status.className}>
            {status.label}
          </Badge>
        </div>
        <CardDescription>
          A phone number that answers every call, texts back missed ones, and books appointments — even after
          hours.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {settings?.phone_number ? (
          <p className="text-sm text-muted-foreground">
            Bound number: <span className="font-medium text-foreground">{settings.phone_number}</span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No phone number connected yet.</p>
        )}
      </CardContent>
      <CardFooter className="justify-end">
        <Button render={<Link href="/settings/voice" />}>Configure</Button>
      </CardFooter>
    </Card>
  )
}
