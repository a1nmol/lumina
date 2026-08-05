"use client"

// Per-thread AI autonomy control (migration 0011 `conversations.ai_mode`) —
// "AI replies: Auto / Off" in the conversation thread header. Auto = the AI
// may send replies on its own; Off = Lumina still drafts (ai_state flips to
// "ai_draft" server-side — see src/app/api/frontdesk/chat/route.ts and
// src/app/api/twilio/sms/route.ts), but only the owner sends from the
// composer. Same two-state segmented-pill shape as the reply composer's
// Reply/Note toggle (role="radiogroup" of role="radio" pills, roving
// tabindex, arrow-key nav) and the same chip vocabulary as AiStateChip —
// tokens only, no magic numbers/hex.

import { type KeyboardEvent, useRef } from "react"

import { cn } from "@/lib/utils"
import type { ConversationAiMode } from "@/lib/types"

const MODE_OPTIONS: { value: ConversationAiMode; label: string; title: string }[] = [
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
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([])

  function selectAndFocus(index: number) {
    const option = MODE_OPTIONS[index]
    if (!option) return
    onChange(option.value)
    buttonRefs.current[index]?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const currentIndex = MODE_OPTIONS.findIndex((option) => option.value === mode)
    if (currentIndex === -1) return

    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault()
        selectAndFocus((currentIndex + 1) % MODE_OPTIONS.length)
        break
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault()
        selectAndFocus((currentIndex - 1 + MODE_OPTIONS.length) % MODE_OPTIONS.length)
        break
      case "Home":
        event.preventDefault()
        selectAndFocus(0)
        break
      case "End":
        event.preventDefault()
        selectAndFocus(MODE_OPTIONS.length - 1)
        break
      default:
        break
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label="AI replies"
      title="Off = Lumina drafts, you send"
      onKeyDown={handleKeyDown}
      className={cn(
        "inline-flex h-6 w-fit shrink-0 items-center gap-1 rounded-full bg-muted py-[3px] pr-[3px] pl-2 text-muted-foreground",
        disabled && "pointer-events-none opacity-60",
        className
      )}
    >
      <span aria-hidden="true" className="text-[11px] font-medium whitespace-nowrap text-muted-foreground/80">
        AI replies
      </span>
      {MODE_OPTIONS.map(({ value, label, title }, index) => {
        const isSelected = mode === value
        return (
          <button
            key={value}
            ref={(el) => {
              buttonRefs.current[index] = el
            }}
            type="button"
            role="radio"
            aria-checked={isSelected}
            tabIndex={isSelected ? 0 : -1}
            disabled={disabled}
            title={title}
            onClick={() => onChange(value)}
            className={cn(
              "relative inline-flex h-[18px] items-center justify-center rounded-full border border-transparent px-2 text-[11px] font-semibold whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:cursor-not-allowed",
              isSelected
                ? "bg-background text-foreground shadow-soft dark:border-input dark:bg-input/30"
                : "text-foreground/60 hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground"
            )}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
