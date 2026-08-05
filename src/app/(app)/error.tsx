"use client"

// Shared error boundary for every route under the (app) group. Next.js
// requires error.tsx to be a Client Component (it needs the reset()
// callback) — the one deliberate exception to this wave's "keep loading
// states server-light" rule, since there's no server-only way to satisfy
// the framework's error-boundary contract.

import { useEffect } from "react"
import { AlertTriangle, RotateCw } from "lucide-react"

import { Button } from "@/components/ui/button"

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Server-side errors are already logged by Next; this just gets it into
    // the browser console too so a report from the owner includes it.
    console.error("[app] route error boundary:", error)
  }, [error])

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
      <span
        aria-hidden="true"
        className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive ring-1 ring-destructive/15"
      >
        <AlertTriangle className="size-6" />
      </span>
      <div className="flex max-w-sm flex-col gap-1.5">
        <h3 className="font-heading text-2xl leading-tight font-normal text-foreground">
          Something went sideways
        </h3>
        <p className="text-sm text-muted-foreground">
          This page ran into a problem loading. It&apos;s usually temporary — try again, and if it keeps
          happening, let us know what you were doing.
        </p>
      </div>
      <Button onClick={reset}>
        <RotateCw aria-hidden="true" data-icon="inline-start" />
        Try again
      </Button>
    </div>
  )
}
