"use client"

// Growth-page showcase for the FrontDesk web chat widget
// (MASTER_PLAN.md §4.D / docs/design-briefs/phase-2-inbox-frontdesk-crm.md
// "Web chat widget"). Shows the one-line embed snippet (copyable) plus a
// live preview of the demo org's widget in a new tab.

import { useState } from "react"
import { Check, Copy, ExternalLink, MessageCircle } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DEMO_ORG } from "@/lib/demo"

const COPIED_RESET_MS = 2000

interface WidgetEmbedCardProps {
  /** This deployment's own origin, resolved server-side (src/app/(app)/growth/page.tsx) so the snippet works without a client effect. */
  origin: string
}

export function WidgetEmbedCard({ origin }: WidgetEmbedCardProps) {
  const [copied, setCopied] = useState(false)

  const snippet = `<script src="${origin}/widget.js" data-org="${DEMO_ORG.slug}" defer></script>`

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
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
          >
            <MessageCircle className="size-4" />
          </span>
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
          onClick={() => window.open(`/widget/${DEMO_ORG.slug}`, "_blank", "noopener,noreferrer")}
        >
          <ExternalLink aria-hidden="true" data-icon="inline-start" />
          Preview widget
        </Button>
      </CardContent>
    </Card>
  )
}
