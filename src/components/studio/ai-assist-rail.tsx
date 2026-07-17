"use client"

import { useState, type FormEvent } from "react"
import { Megaphone, MapPinned, Scissors, SendHorizontal, Smile, Wand2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

// Demo-mode canned transforms — stand in for a real conversational-refinement
// call to the model router. Each acts on the current caption only.
function shorten(caption: string): string {
  const match = caption.match(/^[^.!?]*[.!?]/)
  if (match) return match[0].trim()
  const words = caption.trim().split(/\s+/)
  return words.slice(0, 12).join(" ") + (words.length > 12 ? "…" : "")
}

function addEmoji(caption: string): string {
  const suffix = "🥐✨"
  return caption.trim().endsWith(suffix) ? caption : `${caption.trim()} ${suffix}`
}

function addLocalFlavor(caption: string): string {
  const suffix = "Made right here in the neighborhood, for the neighborhood."
  return caption.includes(suffix) ? caption : `${caption.trim()} ${suffix}`
}

function addCta(caption: string): string {
  const suffix = "Stop by today or order online!"
  return caption.includes(suffix) ? caption : `${caption.trim()} ${suffix}`
}

function applyFreeform(caption: string, instruction: string): string {
  const lower = instruction.toLowerCase()
  if (lower.includes("short")) return shorten(caption)
  if (lower.includes("emoji")) return addEmoji(caption)
  if (lower.includes("local")) return addLocalFlavor(caption)
  if (lower.includes("cta") || lower.includes("call to action") || lower.includes("order") || lower.includes("book"))
    return addCta(caption)
  return `${caption.trim()} ✨`
}

const QUICK_ACTIONS = [
  { id: "shorter", label: "Shorter", icon: Scissors, apply: shorten },
  { id: "emoji", label: "Add emoji", icon: Smile, apply: addEmoji },
  { id: "local", label: "More local flavor", icon: MapPinned, apply: addLocalFlavor },
  { id: "cta", label: "Add a CTA", icon: Megaphone, apply: addCta },
] as const

type AiAssistRailProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  caption: string
  disabled: boolean
  onApply: (nextCaption: string) => void
}

/** Right-hand Sheet for conversational refinement of the current draft. */
export function AiAssistRail({ open, onOpenChange, caption, disabled, onApply }: AiAssistRailProps) {
  const [instruction, setInstruction] = useState("")

  function runQuickAction(id: string, apply: (value: string) => string) {
    if (disabled) {
      toast.info("Generate a post first", { description: "AI Assist works on your current draft." })
      return
    }
    onApply(apply(caption))
    toast.success("Applied", {
      description: QUICK_ACTIONS.find((action) => action.id === id)?.label,
    })
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = instruction.trim()
    if (!trimmed) return
    if (disabled) {
      toast.info("Generate a post first", { description: "AI Assist works on your current draft." })
      return
    }
    onApply(applyFreeform(caption, trimmed))
    toast.success("Applied", { description: trimmed })
    setInstruction("")
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-[360px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-1.5">
            <Wand2 aria-hidden="true" className="size-4 text-primary" />
            AI Assist
          </SheetTitle>
          <SheetDescription>
            Refine the current draft — pick a quick action or describe a change.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4">
          <div className="flex flex-wrap gap-2">
            {QUICK_ACTIONS.map(({ id, label, icon: Icon, apply }) => (
              <Button
                key={id}
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={() => runQuickAction(id, apply)}
                className="gap-1.5"
              >
                <Icon aria-hidden="true" className="size-3.5" />
                {label}
              </Button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <Input
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              disabled={disabled}
              placeholder="e.g. make it about the weekend special"
              aria-label="Describe a change to the current draft"
            />
            <Button
              type="submit"
              size="icon"
              variant="outline"
              disabled={disabled || instruction.trim().length === 0}
              aria-label="Apply"
            >
              <SendHorizontal aria-hidden="true" />
            </Button>
          </form>

          {disabled && (
            <p className="text-xs text-muted-foreground">
              Generate a post first — AI Assist refines your current draft.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
