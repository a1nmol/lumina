"use client"

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent } from "react"
import { Loader2, RefreshCw, Send, Sparkles, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { Message, MessageKind } from "@/lib/types"

import { draftReply, sendReply } from "@/app/(app)/inbox/actions"

const AI_FAILURE_TOAST = "I couldn't answer this — flagging for you."

type ComposerMode = "reply" | "note"

/**
 * Reply/Note pill toggle — a single logical choice, not a tabbed panel set
 * (there's no separate panel content per mode), so `role="radiogroup"` of
 * `role="radio"` pills with roving-tabindex arrow-key nav is the correct
 * semantic. Mirrors src/components/studio/format-segmented.tsx's pattern;
 * visuals are unchanged from the prior Tabs-based implementation (including
 * the amber note tint, which lives on the composer's outer container).
 */
const MODE_OPTIONS: { value: ComposerMode; label: string }[] = [
  { value: "reply", label: "Reply" },
  { value: "note", label: "Note" },
]

/** Imperative handle so the context pane's "Add note" quick action can jump the composer into Note mode and focus it. */
export type ReplyComposerHandle = {
  focusNote: () => void
}

type ReplyComposerProps = {
  conversationId: string
  onSent: (message: Message) => void
  /** Fired when the AI draft flow escalates the thread (needsHuman) — parent flips ai_state locally + persists it for the matching conversation. */
  onEscalated: (conversationId: string, reason: string) => void
  className?: string
}

export const ReplyComposer = forwardRef<ReplyComposerHandle, ReplyComposerProps>(function ReplyComposer(
  { conversationId, onSent, onEscalated, className },
  ref
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isMountedRef = useRef(true)

  const [mode, setMode] = useState<ComposerMode>("reply")
  const [text, setText] = useState("")
  const [isDraftPending, setIsDraftPending] = useState(false)
  const [draftMeta, setDraftMeta] = useState<{ model?: string; costUsd?: number }>({})
  const [isDrafting, setIsDrafting] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [announcement, setAnnouncement] = useState("")

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Reset the composer whenever the selected conversation changes.
  useEffect(() => {
    setMode("reply")
    setText("")
    setIsDraftPending(false)
    setDraftMeta({})
    setIsDrafting(false)
    setIsSending(false)
  }, [conversationId])

  useEffect(() => {
    if (isDraftPending) textareaRef.current?.focus()
  }, [isDraftPending])

  useImperativeHandle(ref, () => ({
    focusNote: () => {
      setMode("note")
      requestAnimationFrame(() => textareaRef.current?.focus())
    },
  }))

  const modeButtonRefs = useRef<Array<HTMLButtonElement | null>>([])

  function selectModeAndFocus(index: number) {
    const option = MODE_OPTIONS[index]
    if (!option) return
    setMode(option.value)
    modeButtonRefs.current[index]?.focus()
  }

  function handleModeKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const currentIndex = MODE_OPTIONS.findIndex((option) => option.value === mode)
    if (currentIndex === -1) return

    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault()
        selectModeAndFocus((currentIndex + 1) % MODE_OPTIONS.length)
        break
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault()
        selectModeAndFocus((currentIndex - 1 + MODE_OPTIONS.length) % MODE_OPTIONS.length)
        break
      case "Home":
        event.preventDefault()
        selectModeAndFocus(0)
        break
      case "End":
        event.preventDefault()
        selectModeAndFocus(MODE_OPTIONS.length - 1)
        break
      default:
        break
    }
  }

  async function requestDraft() {
    // Captured at call time so a stale response (the user switched
    // conversations while the request was in flight) can be discarded even
    // though the composer already remounts per conversation via a `key`
    // prop on ConversationPane — belt-and-braces.
    const requestConversationId = conversationId

    setIsDrafting(true)
    setAnnouncement("Drafting a reply…")
    try {
      const result = await draftReply(requestConversationId)
      if (!isMountedRef.current || requestConversationId !== conversationId) return

      if ("error" in result) {
        if (result.error === "allowance") {
          toast.error("You're out of AI reply quota this month", { description: result.message })
        } else if (result.error === "not_found") {
          toast.error("Couldn't draft a reply", { description: result.message })
        } else {
          onEscalated(requestConversationId, result.message)
          toast.error(AI_FAILURE_TOAST, { description: result.message })
        }
        setAnnouncement("")
        return
      }

      setText(result.draft)
      setIsDraftPending(true)
      setDraftMeta({ model: result.model, costUsd: result.costUsd })
      setAnnouncement("AI draft ready")
    } catch {
      if (!isMountedRef.current || requestConversationId !== conversationId) return
      toast.error("Couldn't draft a reply", { description: "Please try again." })
      setAnnouncement("")
    } finally {
      if (isMountedRef.current && requestConversationId === conversationId) setIsDrafting(false)
    }
  }

  function handleDiscard() {
    setText("")
    setIsDraftPending(false)
    setDraftMeta({})
    textareaRef.current?.focus()
  }

  async function handleSend() {
    const trimmed = text.trim()
    if (!trimmed || isSending) return

    const kind: MessageKind = mode === "note" ? "note" : "message"
    const aiHandled = mode === "reply" && isDraftPending

    setIsSending(true)
    try {
      const message = await sendReply({
        conversationId,
        body: trimmed,
        kind,
        aiHandled,
        model: draftMeta.model ?? null,
        costUsd: draftMeta.costUsd,
      })
      if (!isMountedRef.current) return

      if (!message) {
        toast.error(kind === "note" ? "Couldn't add note" : "Couldn't send reply", {
          description: "Please try again.",
        })
        return
      }

      onSent(message)
      setText("")
      setIsDraftPending(false)
      setDraftMeta({})
      setAnnouncement(kind === "note" ? "Note added" : "Reply sent")
    } catch {
      if (!isMountedRef.current) return
      toast.error(kind === "note" ? "Couldn't add note" : "Couldn't send reply", { description: "Please try again." })
    } finally {
      if (isMountedRef.current) setIsSending(false)
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault()
      void handleSend()
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 rounded-2xl border p-3 shadow-soft transition-colors duration-150",
        mode === "note" ? "border-warning/40 bg-warning/10" : "border-border bg-card",
        className
      )}
    >
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <div
        role="radiogroup"
        aria-label="Reply or internal note"
        onKeyDown={handleModeKeyDown}
        className="inline-flex h-8 w-fit items-center justify-center rounded-lg bg-muted p-[3px] text-muted-foreground"
      >
        {MODE_OPTIONS.map(({ value: optionValue, label }, index) => {
          const isSelected = mode === optionValue
          return (
            <button
              key={optionValue}
              ref={(el) => {
                modeButtonRefs.current[index] = el
              }}
              type="button"
              role="radio"
              aria-checked={isSelected}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => setMode(optionValue)}
              className={cn(
                "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring",
                isSelected
                  ? "bg-background text-foreground shadow-sm dark:border-input dark:bg-input/30"
                  : "text-foreground/60 hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground"
              )}
            >
              {label}
            </button>
          )
        })}
      </div>

      <div className="relative">
        {isDraftPending && (
          <span className="absolute -top-2.5 left-3 z-10 rounded-full border border-primary/30 bg-card px-1.5 py-px text-[10px] font-medium text-primary">
            AI draft
          </span>
        )}
        <label htmlFor="inbox-composer-textarea" className="sr-only">
          {mode === "note" ? "Internal note" : "Reply"}
        </label>
        <Textarea
          id="inbox-composer-textarea"
          ref={textareaRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={mode === "note" ? "Add an internal note (not sent to the customer)…" : "Write a reply…"}
          disabled={isSending}
          className={cn(
            "min-h-24 resize-none bg-transparent",
            isDraftPending && "border-l-4 border-l-primary pl-3"
          )}
        />
      </div>

      {isDraftPending ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={handleSend} disabled={isSending || !text.trim()} className="gap-1.5">
            {isSending ? (
              <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
            ) : (
              <Send aria-hidden="true" className="size-3.5" />
            )}
            Send
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => textareaRef.current?.focus()}
            disabled={isSending}
          >
            Edit
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={requestDraft}
            disabled={isDrafting || isSending}
            className="gap-1.5"
          >
            {isDrafting ? (
              <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw aria-hidden="true" className="size-3.5" />
            )}
            Regenerate
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={handleDiscard}
            disabled={isSending}
            className="ml-auto gap-1.5 text-muted-foreground"
          >
            <X aria-hidden="true" className="size-3.5" />
            Discard
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          {mode === "reply" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={requestDraft}
              disabled={isDrafting}
              className="gap-1.5"
            >
              {isDrafting ? (
                <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
              ) : (
                <Sparkles aria-hidden="true" className="size-3.5" />
              )}
              {isDrafting ? "Drafting…" : "AI draft"}
            </Button>
          ) : (
            <span />
          )}
          <Button
            type="button"
            onClick={handleSend}
            disabled={isSending || !text.trim()}
            className="ml-auto gap-1.5"
          >
            {isSending ? (
              <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
            ) : (
              <Send aria-hidden="true" className="size-3.5" />
            )}
            {mode === "note" ? "Add note" : "Send"}
          </Button>
        </div>
      )}
    </div>
  )
})
