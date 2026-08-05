// Named AI-transparency states — never a numeric confidence score, always
// icon + text together (color is never the only signal). See "AI
// transparency rules" in docs/design-briefs/phase-2-inbox-frontdesk-crm.md.

import { PenLine, Sparkles, TriangleAlert, User } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import type { ConversationAiState } from "@/lib/types"

const AI_STATE_META: Record<
  ConversationAiState,
  { label: string; sentence: string; icon: LucideIcon; className: string }
> = {
  ai_answered: {
    label: "AI answered",
    sentence: "The AI answered this conversation on its own.",
    icon: Sparkles,
    className: "bg-success/10 text-success",
  },
  ai_draft: {
    label: "AI drafted — needs review",
    sentence: "The AI drafted a reply — review it before it's sent.",
    icon: PenLine,
    className: "bg-warning/10 text-warning",
  },
  escalated: {
    label: "Escalated to you",
    sentence: "The AI escalated this conversation for you to handle.",
    icon: TriangleAlert,
    className: "bg-destructive/10 text-destructive",
  },
  human: {
    label: "Human",
    sentence: "A human is handling this conversation, not the AI.",
    icon: User,
    className: "bg-secondary text-secondary-foreground",
  },
}

type AiStateChipProps = {
  state: ConversationAiState
  className?: string
}

/** Sized h-8 (redesign wave R3, item 2) to match the thread header's status Select and AiModeToggle on the unified controls row. */
export function AiStateChip({ state, className }: AiStateChipProps) {
  const meta = AI_STATE_META[state]
  const Icon = meta.icon
  return (
    <span
      title={meta.sentence}
      className={cn(
        "inline-flex h-8 w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap",
        meta.className,
        className
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {meta.label}
      <span className="sr-only"> — {meta.sentence}</span>
    </span>
  )
}
