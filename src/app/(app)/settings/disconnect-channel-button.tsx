"use client"

// Small client island for the Channels card's per-connection "Disconnect"
// button — pending state + toast feedback, mirroring the persist() pattern
// in ./faq-card.tsx. Calls the disconnectSocialConnection server action
// (src/lib/social/actions.ts), which deletes via the service-role admin
// client (social_connections has no client-writable RLS policy).

import { useState, useTransition } from "react"
import { Loader2, Unlink } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { disconnectSocialConnection } from "@/lib/social/actions"

type DisconnectChannelButtonProps = {
  connectionId: string
  /** Page name (or a fallback like "this channel") for the confirm/toast copy. */
  label: string
}

export function DisconnectChannelButton({ connectionId, label }: DisconnectChannelButtonProps) {
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)

  function handleClick() {
    if (!confirming) {
      setConfirming(true)
      return
    }

    startTransition(async () => {
      const result = await disconnectSocialConnection(connectionId)
      setConfirming(false)
      if (result.ok) {
        toast.success(`Disconnected ${label}`)
      } else {
        toast.error("Couldn't disconnect", { description: "Please try again." })
      }
    })
  }

  return (
    <Button
      type="button"
      variant={confirming ? "destructive" : "ghost"}
      size="sm"
      onClick={handleClick}
      onBlur={() => setConfirming(false)}
      disabled={isPending}
      className="shrink-0 gap-1.5"
    >
      {isPending ? (
        <Loader2 aria-hidden="true" data-icon="inline-start" className="size-3.5 animate-spin" />
      ) : (
        <Unlink aria-hidden="true" data-icon="inline-start" className="size-3.5" />
      )}
      {isPending ? "Disconnecting…" : confirming ? "Confirm" : "Disconnect"}
    </Button>
  )
}
