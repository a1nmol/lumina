"use client"

// Web chat widget embed card — Settings hub -> Channels & phone
// (MASTER_PLAN.md §4.D / docs/design-briefs/phase-2-inbox-frontdesk-crm.md
// "Web chat widget"). Shows the one-line embed snippet (copyable) plus a
// live preview of this org's own widget in a new tab. Relocated here in
// redesign R2 from the Growth page, where it was stranded in a 3-col grid
// alongside nothing else — now stacks with its Channels siblings at the
// same max-w-2xl width.

import { useState } from "react"
import { Check, Copy, ExternalLink, MessageCircle } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardIcon, CardTitle } from "@/components/ui/card"

const COPIED_RESET_MS = 2000

interface WidgetEmbedCardProps {
  /** This deployment's own origin, resolved server-side (src/app/(app)/growth/page.tsx) so the snippet works without a client effect. */
  origin: string
  /** This org's public slug (src/app/(app)/growth/page.tsx) — empty only in the unreachable orphaned-user case, in which case the snippet/preview link is left slug-less rather than pointing at another org's widget. */
  orgSlug: string
}

export function WidgetEmbedCard({ origin, orgSlug }: WidgetEmbedCardProps) {
  const [copied, setCopied] = useState(false)

  const snippet = `<script src="${origin}/widget.js" data-org="${orgSlug}" defer></script>`

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(snippet)
      setCopied(true)
      toast.success("Embed code copied")
      window.setTimeout(() => setCopied(false), COPIED_RESET_MS)
    } catch {
      toast.error("Couldn't copy automatically — select the code and copy manually.")
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardIcon>
            <MessageCircle />
          </CardIcon>
          <CardTitle>Web chat widget</CardTitle>
        </div>
        <CardDescription>
          Paste one line into your site to add an AI-answered chat bubble, branded to your Business Brain.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="relative">
          <pre className="overflow-x-auto rounded-lg bg-muted px-3 py-2.5 pr-10 font-mono text-xs text-foreground/90">
            <code>{snippet}</code>
          </pre>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="absolute top-1.5 right-1.5"
            onClick={handleCopy}
            aria-label="Copy embed code"
          >
            {copied ? <Check aria-hidden="true" className="size-3.5" /> : <Copy aria-hidden="true" className="size-3.5" />}
          </Button>
        </div>
        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={() => window.open(`/widget/${orgSlug}`, "_blank", "noopener,noreferrer")}
        >
          <ExternalLink aria-hidden="true" data-icon="inline-start" />
          Preview widget
        </Button>
      </CardContent>
    </Card>
  )
}
