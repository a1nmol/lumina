"use client"

import { Check } from "lucide-react"

import type { BusinessBrain } from "@/lib/types"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { BRAND_PALETTE, TONE_OPTIONS, inferTone } from "../constants"

type VoiceBrandStepProps = {
  brain: BusinessBrain
  onChange: (patch: Partial<BusinessBrain>) => void
}

export function VoiceBrandStep({ brain, onChange }: VoiceBrandStepProps) {
  const selectedTone = inferTone(brain.tone)
  const selectedColor = brain.brand_kit.primary_color ?? BRAND_PALETTE[0].hex

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h3 id="brand-voice-label" className="text-sm font-medium text-foreground">
          Brand voice
        </h3>
        <div
          role="radiogroup"
          aria-labelledby="brand-voice-label"
          className="grid gap-3 sm:grid-cols-2"
        >
          {TONE_OPTIONS.map((tone) => {
            const isSelected = tone.id === selectedTone
            return (
              <button
                key={tone.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => onChange({ tone: tone.id })}
                className={cn(
                  "relative flex flex-col gap-1.5 rounded-xl p-4 text-left ring-1 outline-none transition-colors focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2",
                  isSelected
                    ? "bg-primary/5 ring-2 ring-primary"
                    : "bg-card ring-foreground/10 hover:bg-muted/50"
                )}
              >
                {isSelected && (
                  <span className="absolute top-3 right-3 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check aria-hidden="true" className="size-2.5" />
                  </span>
                )}
                <span className="text-sm font-medium text-foreground">{tone.label}</span>
                <span className="text-xs text-muted-foreground italic">{tone.example}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 id="brand-color-label" className="text-sm font-medium text-foreground">
          Brand color
        </h3>
        <div
          role="radiogroup"
          aria-labelledby="brand-color-label"
          className="flex flex-wrap gap-2.5"
        >
          {BRAND_PALETTE.map((swatch) => {
            const isSelected = swatch.hex === selectedColor
            return (
              <button
                key={swatch.hex}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() =>
                  onChange({ brand_kit: { ...brain.brand_kit, primary_color: swatch.hex } })
                }
                aria-label={`${swatch.name} — use as brand color`}
                className={cn(
                  "flex size-9 items-center justify-center rounded-full outline-none ring-2 ring-offset-2 ring-offset-background transition-all focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2",
                  isSelected ? "ring-foreground" : "ring-transparent hover:ring-foreground/30"
                )}
                style={{ backgroundColor: swatch.hex }}
              >
                {isSelected && (
                  <Check aria-hidden="true" className="size-4 text-white drop-shadow" />
                )}
              </button>
            )
          })}
        </div>
      </section>

      <section className="flex flex-col gap-1.5">
        <Label htmlFor="logo-url">Logo URL (optional)</Label>
        <Input
          id="logo-url"
          type="url"
          value={brain.brand_kit.logo_url ?? ""}
          onChange={(event) =>
            onChange({ brand_kit: { ...brain.brand_kit, logo_url: event.target.value } })
          }
          placeholder="https://yourbusiness.com/logo.png"
        />
        <p className="text-xs text-muted-foreground">
          Paste a link to your logo — you can add this later.
        </p>
      </section>
    </div>
  )
}
