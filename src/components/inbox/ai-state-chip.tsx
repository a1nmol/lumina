// Named AI-transparency states — never a numeric confidence score, always
// icon + text together (color is never the only signal). See "AI
// transparency rules" in docs/design-briefs/phase-2-inbox-frontdesk-crm.md.

import { PenLine, Sparkles, TriangleAlert, User } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import type { ConversationAiState } from "@/lib/types"

const AI_STATE_META: Record<
  ConversationAiState,
  { label: string; icon: LucideIcon; className: string }
> = {
  ai_answered: {
    label: "AI answered",
    icon: Sparkles,
    className: "bg-success/10 text-success",
  },
  ai_draft: {
    label: "AI drafted — needs review",
    icon: PenLine,
    className: "bg-warning/10 text-warning",
  },
  escalated: {
    label: "Escalated to you",
    icon: TriangleAlert,
    className: "bg-destructive/10 text-destructive",
  },
  human: {
    label: "Human",
    icon: User,
    className: "bg-secondary text-secondary-foreground",
  },
}

type AiStateChipProps = {
  state: ConversationAiState
  className?: string
}

export function AiStateChip({ state, className }: AiStateChipProps) {
  const meta = AI_STATE_META[state]
  const Icon = meta.icon
  return (
    <span
      className={cn(
        "inline-flex h-6 w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap",
        meta.className,
        className
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {meta.label}
    </span>
  )
}
