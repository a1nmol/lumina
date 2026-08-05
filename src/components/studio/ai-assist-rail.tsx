"use client"

import { useId, useState, type FormEvent } from "react"
import { KeyRound, Loader2, MapPinned, Scissors, SendHorizontal, Smile, Wand2, Zap } from "lucide-react"
import { toast } from "sonner"

import { refineCaptionAction } from "@/app/(app)/studio/actions"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

// Redesign wave R5 — real AI Assist. This rail used to apply hard-coded
// string transforms (append a fixed emoji suffix, a fixed "neighborhood"
// sentence) to every caption and present that as AI — the worst finding of
// the design audit. Every quick action and the free-text field now route
// through refineCaptionAction (src/app/(app)/studio/actions.ts), which is
// real AI in a real configured org, and an honestly-labeled demo-mode
// fallback only when the whole app is running on seed data. See that
// action's header comment for the full three-path behavior.

const MAX_INSTRUCTION_LENGTH = 300

const QUICK_ACTIONS = [
  {
    id: "punchier",
    label: "Punchier",
    icon: Zap,
    instruction:
      "Make the caption punchier and more energetic — tighten the language and strengthen the opening line, but keep the core message and roughly the same length.",
  },
  {
    id: "shorter",
    label: "Shorter",
    icon: Scissors,
    instruction: "Make the caption noticeably shorter and more to the point — keep the core message.",
  },
  {
    id: "emoji",
    label: "More emoji",
    icon: Smile,
    instruction:
      "Add a couple of tasteful, relevant emoji throughout the caption — don't overdo it, and don't otherwise change the wording.",
  },
  {
    id: "local",
    label: "Add local flavor",
    icon: MapPinned,
    instruction:
      "Make the caption feel more specific to this local business's own neighborhood or city — draw on the business description you were given, if it mentions a location, without inventing any details that aren't true.",
  },
] as const

type AiAssistRailProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  caption: string
  /** No draft to refine yet — the composer hasn't generated a post this session. */
  disabled: boolean
  /** Server-computed (src/app/(app)/studio/actions.ts#isAiAssistAvailable) — false only for a real, signed-in org missing an OpenRouter key, the one case with no honest fallback available. */
  available: boolean
  onApply: (nextCaption: string) => void
}

/** Right-hand Sheet for real conversational refinement of the current draft. */
export function AiAssistRail({ open, onOpenChange, caption, disabled, available, onApply }: AiAssistRailProps) {
  const [instruction, setInstruction] = useState("")
  const [pendingId, setPendingId] = useState<string | null>(null)
  const instructionInputId = useId()

  const blocked = disabled || !available
  const isPending = pendingId !== null

  /** Returns true on a successful refinement — lets the free-text form clear itself only when there's nothing left to retry. */
  async function runRefine(id: string, instructionText: string): Promise<boolean> {
    if (blocked || isPending) return false
    setPendingId(id)
    try {
      const result = await refineCaptionAction(caption, instructionText, id)
      if ("error" in result) {
        if (result.error === "allowance") {
          toast.error("You've hit this month's generation limit", { description: result.message })
        } else {
          toast.error("Couldn't refine that caption", { description: result.message })
        }
        return false
      }
      onApply(result.caption)
      toast.success("Applied")
      return true
    } catch {
      toast.error("Couldn't refine that caption", { description: "Please try again." })
      return false
    } finally {
      setPendingId(null)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = instruction.trim()
    if (!trimmed) return
    void runRefine("freeform", trimmed).then((succeeded) => {
      if (succeeded) setInstruction("")
    })
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
            {QUICK_ACTIONS.map(({ id, label, icon: Icon, instruction: presetInstruction }) => (
              <Button
                key={id}
                type="button"
                variant="outline"
                size="sm"
                disabled={blocked || isPending}
                onClick={() => runRefine(id, presetInstruction)}
                className="gap-1.5"
              >
                {pendingId === id ? (
                  <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                ) : (
                  <Icon aria-hidden="true" className="size-3.5" />
                )}
                {label}
              </Button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
            <label htmlFor={instructionInputId} className="sr-only">
              Tell the AI what to change
            </label>
            <div className="flex items-start gap-2">
              <Textarea
                id={instructionInputId}
                value={instruction}
                onChange={(event) => setInstruction(event.target.value.slice(0, MAX_INSTRUCTION_LENGTH))}
                disabled={blocked || isPending}
                placeholder="Tell the AI what to change…"
                className="min-h-16 resize-none text-sm"
              />
              <Button
                type="submit"
                size="icon"
                variant="outline"
                disabled={blocked || isPending || instruction.trim().length === 0}
                aria-label="Apply"
                className="shrink-0"
              >
                {pendingId === "freeform" ? (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                ) : (
                  <SendHorizontal aria-hidden="true" />
                )}
              </Button>
            </div>
            <span
              className={cn(
                "self-end text-[0.7rem] tabular-nums text-muted-foreground",
                instruction.length >= MAX_INSTRUCTION_LENGTH && "text-warning"
              )}
            >
              {instruction.length}/{MAX_INSTRUCTION_LENGTH}
            </span>
          </form>

          {disabled ? (
            <p className="text-xs text-muted-foreground">
              Generate a post first — AI Assist refines your current draft.
            </p>
          ) : !available ? (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <KeyRound aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              Add your OpenRouter key in Settings to turn on AI Assist — real AI refinement isn&rsquo;t available yet
              for this account.
            </p>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
