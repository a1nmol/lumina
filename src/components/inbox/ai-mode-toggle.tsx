"use client"

// Per-thread AI autonomy control (migration 0011 `conversations.ai_mode`) —
// "AI replies: Auto / Off" in the conversation thread header. Auto = the AI
// may send replies on its own; Off = Lumina still drafts (ai_state flips to
// "ai_draft" server-side — see src/app/api/frontdesk/chat/route.ts and
// src/app/api/twilio/sms/route.ts), but only the owner sends from the
// composer. Same chip vocabulary as AiStateChip — tokens only, no magic
// numbers/hex.
//
// Redesign wave R3 (item 2/7): sized h-8 to sit at the same height as the
// thread header's status Select and AiStateChip on the unified controls row,
// and built on the shared roving-tabindex `Segmented` control
// (src/components/ui/segmented.tsx) — the "AI replies" micro-label stays a
// plain sibling span (not a radio option), so the pill background wraps both
// via `contents` display on the Segmented radiogroup rather than the
// radiogroup itself owning non-radio children.

import { Segmented, type SegmentedOption } from "@/components/ui/segmented"
import { cn } from "@/lib/utils"
import type { ConversationAiMode } from "@/lib/types"

const MODE_OPTIONS: SegmentedOption<ConversationAiMode>[] = [
  { value: "auto", label: "Auto", title: "Auto = Lumina may send replies itself" },
  { value: "off", label: "Off", title: "Off = Lumina drafts, you send" },
]

type AiModeToggleProps = {
  mode: ConversationAiMode
  onChange: (mode: ConversationAiMode) => void
  disabled?: boolean
  className?: string
}

export function AiModeToggle({ mode, onChange, disabled, className }: AiModeToggleProps) {
  return (
    <div
      title="Off = Lumina drafts, you send"
      className={cn(
        "inline-flex h-8 w-fit shrink-0 items-center gap-1 rounded-full bg-muted py-1 pr-1 pl-2.5 text-muted-foreground",
        disabled && "pointer-events-none opacity-60",
        className
      )}
    >
      <span aria-hidden="true" className="text-xs font-medium whitespace-nowrap text-muted-foreground/80">
        AI replies
      </span>
      <Segmented
        value={mode}
        onChange={onChange}
        options={MODE_OPTIONS}
        aria-label="AI replies"
        disabled={disabled}
        className="contents"
        itemClassName={() => "h-6 rounded-full px-2.5 text-xs font-semibold disabled:cursor-not-allowed"}
      />
    </div>
  )
}
