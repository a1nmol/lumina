// Named AI-transparency states — never a numeric confidence score, always
// icon + text together (color is never the only signal). See "AI
// transparency rules" in docs/design-briefs/phase-2-inbox-frontdesk-crm.md.
//
// Companion C2 — storytelling pass: the visible `label` is written in the
// AI's own voice (a first-person sentence — "I answered this one" — rather
// than a status-label like "AI handled") wherever this chip appears; the
// longer `sentence` (title tooltip + sr-only elaboration) stays in the same
// voice for consistency. Semantic meaning is unchanged from the prior
// labels, just recast from third person ("The AI…") to first person.
// src/components/inbox/thread-row.tsx's AI sparkle badge reuses this same
// `label`/`sentence` pair so the two surfaces speak with one voice.

import { PenLine, Sparkles, TriangleAlert, User } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import type { ConversationAiState } from "@/lib/types"

export const AI_STATE_META: Record<
  ConversationAiState,
  { label: string; sentence: string; icon: LucideIcon; className: string }
> = {
  ai_answered: {
    label: "I answered this one",
    sentence: "I answered this conversation on my own.",
    icon: Sparkles,
    className: "bg-success/10 text-success",
  },
  ai_draft: {
    label: "I drafted a reply — your call",
    sentence: "I drafted a reply — review it before it's sent.",
    icon: PenLine,
    className: "bg-warning/10 text-warning",
  },
  escalated: {
    label: "I flagged this for you",
    sentence: "I escalated this conversation for you to handle.",
    icon: TriangleAlert,
    className: "bg-destructive/10 text-destructive",
  },
  human: {
    label: "You're driving",
    sentence: "A human is handling this conversation, not me.",
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
