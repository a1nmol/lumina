"use client"

// Small settings card at the top of the Reviews section — the "auto-publish
// threshold" rule from docs/design-briefs/phase-3-analytics-reviews.md:
// auto-send AI replies for reviews at/above a chosen star rating, manual
// approval otherwise. Persists via saveReviewSettings (business_brain.
// connected_channels.review_auto_reply — see src/app/(app)/growth/actions.ts).

import { useState } from "react"
import { Sparkles } from "lucide-react"
import { toast } from "sonner"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

import { saveReviewSettings, type ReviewAutoReplySettings } from "./actions"

const MIN_STARS_OPTIONS: { value: "5" | "4" | "3"; label: string }[] = [
  { value: "5", label: "5★ only" },
  { value: "4", label: "4★ and up" },
  { value: "3", label: "3★ and up" },
]

interface AutoReplySettingsCardProps {
  initialSettings: ReviewAutoReplySettings
  className?: string
}

export function AutoReplySettingsCard({ initialSettings, className }: AutoReplySettingsCardProps) {
  const [settings, setSettings] = useState(initialSettings)
  const [isSaving, setIsSaving] = useState(false)

  async function persist(next: ReviewAutoReplySettings) {
    const previous = settings
    setSettings(next)
    setIsSaving(true)
    try {
      const result = await saveReviewSettings(next)
      if (!result.ok) {
        setSettings(previous)
        toast.error("Couldn't save auto-reply settings", { description: "Please try again." })
        return
      }
      toast.success(next.enabled ? "Auto-reply enabled" : "Auto-reply disabled")
    } catch {
      setSettings(previous)
      toast.error("Couldn't save auto-reply settings", { description: "Please try again." })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card size="sm" className={cn("gap-3", className)}>
      <CardHeader className="gap-1">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
          >
            <Sparkles className="size-3.5" />
          </span>
          <CardTitle className="text-sm">Auto-reply with AI</CardTitle>
        </div>
        <CardDescription className="text-xs">
          Auto-send AI-drafted replies at or above this rating; lower ratings always wait for you.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Switch
            id="review-auto-reply-toggle"
            checked={settings.enabled}
            onCheckedChange={(checked) => persist({ ...settings, enabled: Boolean(checked) })}
            disabled={isSaving}
            aria-label="Auto-reply with AI"
          />
          {/* Supplementary text only — Switch already carries the full aria-label; not a <label for> since base-ui's switch root is a button, not a native input. */}
          <span aria-hidden="true" className="text-xs font-medium text-muted-foreground">
            {settings.enabled ? "On" : "Off"}
          </span>
        </div>
        <Select
          value={String(settings.minStars)}
          onValueChange={(value) => persist({ ...settings, minStars: Number(value) as 3 | 4 | 5 })}
          disabled={isSaving || !settings.enabled}
        >
          <SelectTrigger size="sm" aria-label="Minimum star rating for auto-reply" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MIN_STARS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  )
}
