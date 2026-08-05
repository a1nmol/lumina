"use client"

/**
 * Internal dev tool — NOT linked from any nav, and gated behind
 * isPlatformAdmin() by ../page.tsx (a server component; this file stays a
 * client component for the Wick state hooks below). Visit /wick-preview to
 * eyeball every Wick state side by side. Safe to delete once Wick has enough
 * real call-sites to review in context instead.
 */

import { useState } from "react"

import { useWickCelebration, Wick, type WickState } from "@/components/brand/wick"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"

const STATES: Array<{ state: WickState; label: string; description: string }> = [
  { state: "idle", label: "Idle", description: "Gentle hover bob + slow tail-glow pulse." },
  { state: "curious", label: "Curious", description: "Leans toward lookAt, pupil shifts, quicker bob." },
  { state: "thinking", label: "Thinking", description: "Heartbeat glow pulse, bob nearly paused." },
  { state: "sleeping", label: "Sleeping", description: "Settles down, wings still, dim slow glow, closed eye." },
  { state: "oops", label: "Oops", description: "Glow flickers twice, tiny head shake, then settles." },
  { state: "celebrating", label: "Celebrating", description: "One-shot loop-de-loop + amber sparkle trail." },
]

export function WickPreviewView() {
  const [triggered, setTriggered] = useState<Record<string, WickState>>({})
  const { celebrate } = useWickCelebration()

  function playOneShot(state: "celebrating" | "oops") {
    setTriggered((prev) => ({ ...prev, [state]: state }))
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Wick preview"
        description="Dev-only showcase of every Wick state. Not linked from navigation — see src/components/brand/wick.tsx."
      />

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card/40 p-4">
        <Button type="button" size="sm" onClick={() => celebrate()}>
          Fire corner celebration
        </Button>
        <p className="text-sm text-muted-foreground">
          Uses <code className="rounded bg-muted px-1 py-0.5 text-xs">useWickCelebration()</code> — flies a one-shot
          Wick in the bottom-right corner of the viewport, then auto-removes.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {STATES.map(({ state, label, description }) => {
          const isOneShot = state === "celebrating" || state === "oops"
          const renderedState = isOneShot ? (triggered[state] ?? "idle") : state

          return (
            <div
              key={state}
              className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card/40 p-6 text-center"
            >
              <div className="flex h-24 items-center justify-center">
                <Wick
                  state={renderedState}
                  size={80}
                  lookAt={state === "curious" ? "left" : "right"}
                  onComplete={
                    isOneShot ? () => setTriggered((prev) => ({ ...prev, [state]: "idle" })) : undefined
                  }
                />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-medium text-foreground">{label}</h3>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
              {isOneShot && (
                <Button type="button" variant="outline" size="xs" onClick={() => playOneShot(state)}>
                  Play
                </Button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
