"use client"

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent } from "react"
import { Loader2, PhoneOff, RefreshCw, Send, Sparkles, Wand2, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { ConversationChannel, Message, MessageKind } from "@/lib/types"

import { draftReply, rewriteDraft, sendReply, suggestReplies, whisperToConversation } from "@/app/(app)/inbox/actions"

const AI_FAILURE_TOAST = "I couldn't answer this — flagging for you."

type ComposerMode = "reply" | "note"

// Whisper commands (Commander update wave B2): a draft starting with "@ai "
// (case-insensitive, whitespace before the mention allowed) is a private
// instruction to the AI, not a message to send verbatim — see
// src/app/(app)/inbox/actions.ts#whisperToConversation. WHISPER_HINT_RE is
// looser (just "@ai" as a whole word) so the hint chip below appears the
// moment someone starts typing it, before they've added an instruction yet;
// WHISPER_SEND_RE requires the instruction text to actually extract one.
const WHISPER_HINT_RE = /^@ai\b/i
const WHISPER_SEND_RE = /^@ai\s+([\s\S]+)$/i

/** Pulls the instruction out of a "@ai <instruction>" draft, or null when the draft doesn't match that shape (no prefix, or prefix with nothing after it). Pure. */
function extractWhisperInstruction(value: string): string | null {
  const match = value.trim().match(WHISPER_SEND_RE)
  return match ? match[1].trim() : null
}

/** Mirrors src/lib/ai/reply-assist.ts's RewriteMode — kept as a local literal
 *  union (rather than importing that server-only module's type) so this
 *  client component has zero coupling to server-only code. */
type RewriteMode = "friendlier" | "shorter" | "more_formal" | "translate_es"

const REWRITE_MODE_OPTIONS: { value: RewriteMode; label: string }[] = [
  { value: "friendlier", label: "Friendlier" },
  { value: "shorter", label: "Shorter" },
  { value: "more_formal", label: "More formal" },
  { value: "translate_es", label: "Spanish" },
]

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
  /**
   * A finished phone call (channel "voice") can't receive a reply — Retell
   * has no live leg to deliver one to, and sendReply would throw honestly
   * if forced (see src/app/(app)/inbox/actions.ts#sendReply's voice guard).
   * This is the honest UI layer for that: voice threads default to and are
   * locked into Note mode, with the Reply pill hidden rather than shown
   * disabled-and-confusing. Optional so every other caller/test is
   * unaffected — undefined behaves exactly like every non-voice channel.
   */
  channel?: ConversationChannel
  onSent: (message: Message) => void
  /** Fired when the AI draft flow escalates the thread (needsHuman) — parent flips ai_state locally + persists it for the matching conversation. */
  onEscalated: (conversationId: string, reason: string) => void
  className?: string
}

export const ReplyComposer = forwardRef<ReplyComposerHandle, ReplyComposerProps>(function ReplyComposer(
  { conversationId, channel, onSent, onEscalated, className },
  ref
) {
  const isVoiceConversation = channel === "voice"
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isMountedRef = useRef(true)
  // Edit-learning (Outlast wave 2, Part A): the AI-drafted text that most
  // recently prefilled the composer verbatim — either from "AI draft"
  // (requestDraft) or a clicked suggestion chip (handleSelectSuggestion).
  // Compared against what actually gets sent (handleSend) so sendReply can
  // capture the pair as a style exemplar when the owner edited it. Cleared
  // whenever the box is emptied by hand (see the Textarea onChange below) —
  // clearing and typing a reply from scratch must never be attributed to a
  // draft that's no longer even in the box.
  const originalAiDraftRef = useRef<string | null>(null)

  const [mode, setMode] = useState<ComposerMode>("reply")
  const [text, setText] = useState("")
  const [isDraftPending, setIsDraftPending] = useState(false)
  const [draftMeta, setDraftMeta] = useState<{ model?: string; costUsd?: number }>({})
  const [isDrafting, setIsDrafting] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [announcement, setAnnouncement] = useState("")
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [isSuggesting, setIsSuggesting] = useState(false)
  const [isRewriting, setIsRewriting] = useState(false)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Reset the composer whenever the selected conversation changes. Voice
  // threads default straight to Note (see the `channel` prop doc above).
  useEffect(() => {
    setMode(isVoiceConversation ? "note" : "reply")
    setText("")
    setIsDraftPending(false)
    setDraftMeta({})
    setIsDrafting(false)
    setIsSending(false)
    setSuggestions([])
    setIsSuggesting(false)
    setIsRewriting(false)
    originalAiDraftRef.current = null
  }, [conversationId, isVoiceConversation])

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
      originalAiDraftRef.current = result.draft
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
    originalAiDraftRef.current = null
    textareaRef.current?.focus()
  }

  /** Fetches up to 3 quick-tap reply chips for the customer's latest message. Never auto-fills the composer — the human still has to tap one. */
  async function requestSuggestions() {
    const requestConversationId = conversationId

    setIsSuggesting(true)
    try {
      const result = await suggestReplies(requestConversationId)
      if (!isMountedRef.current || requestConversationId !== conversationId) return

      if ("error" in result) {
        toast.error("You're out of AI reply quota this month", { description: result.message })
        return
      }

      if (result.suggestions.length === 0) {
        toast.error("Couldn't come up with suggestions", { description: "Please try again." })
        return
      }

      setSuggestions(result.suggestions)
    } catch {
      if (!isMountedRef.current || requestConversationId !== conversationId) return
      toast.error("Couldn't get suggestions", { description: "Please try again." })
    } finally {
      if (isMountedRef.current && requestConversationId === conversationId) setIsSuggesting(false)
    }
  }

  /** A tapped suggestion chip REPLACES the compose text (never sends) and focuses the box so the human can edit before sending. Also counts as an "AI draft" for edit-learning purposes (see originalAiDraftRef above). */
  function handleSelectSuggestion(suggestion: string) {
    setText(suggestion)
    setSuggestions([])
    originalAiDraftRef.current = suggestion
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  function handleDismissSuggestion(index: number) {
    setSuggestions((current) => current.filter((_, i) => i !== index))
  }

  /** Rewrites whatever is currently in the compose box and replaces it in place, with a one-level "Undo" via the confirmation toast's action button. Never sends. */
  async function handleRewrite(mode: RewriteMode) {
    const trimmed = text.trim()
    if (!trimmed || isRewriting) return

    const previousText = text
    const previousAiDraft = originalAiDraftRef.current

    setIsRewriting(true)
    try {
      const result = await rewriteDraft(trimmed, mode)
      if (!isMountedRef.current) return

      if ("error" in result) {
        if (result.error === "allowance") {
          toast.error("You're out of AI reply quota this month", { description: result.message })
        } else {
          toast.error("Couldn't rewrite that", { description: result.message })
        }
        return
      }

      setText(result.text)
      // Edit-learning integrity (review-caught): the rewrite output is AI
      // text, not the owner's. The ref must now point at THIS text, so only
      // true manual keystrokes after the rewrite count as an owner edit —
      // otherwise "AI draft -> Rewrite -> Send" would store AI-on-AI pairs
      // as "how the owner really texts" and poison the style corpus.
      originalAiDraftRef.current = result.text
      requestAnimationFrame(() => textareaRef.current?.focus())
      toast("Rewrote your reply", {
        action: {
          label: "Undo",
          onClick: () => {
            setText(previousText)
            originalAiDraftRef.current = previousAiDraft
          },
        },
      })
    } catch {
      if (!isMountedRef.current) return
      toast.error("Couldn't rewrite that", { description: "Please try again." })
    } finally {
      if (isMountedRef.current) setIsRewriting(false)
    }
  }

  /** Whisper submit path — swaps in for a normal send when the draft matches "@ai <instruction>" (see WHISPER_SEND_RE above). Never sends the raw instruction text itself; the AI composes what actually goes to the customer. */
  async function handleWhisperSend(instruction: string) {
    setIsSending(true)
    try {
      const result = await whisperToConversation(conversationId, instruction)
      if (!isMountedRef.current) return

      if ("error" in result) {
        if (result.error === "allowance") {
          toast.error("You're out of AI reply quota this month", { description: result.message })
        } else {
          toast.error("Couldn't send that whisper", { description: result.message })
        }
        return
      }

      onSent(result.note)
      onSent(result.reply)
      setText("")
      setIsDraftPending(false)
      setDraftMeta({})
      setSuggestions([])
      originalAiDraftRef.current = null
      setAnnouncement("Whisper delivered")
    } catch (error) {
      if (!isMountedRef.current) return
      const description = error instanceof Error && error.message ? error.message : "Please try again."
      toast.error("Couldn't send that whisper", { description })
    } finally {
      if (isMountedRef.current) setIsSending(false)
    }
  }

  async function handleSend() {
    const trimmed = text.trim()
    if (!trimmed || isSending) return

    if (mode === "reply") {
      const whisperInstruction = extractWhisperInstruction(trimmed)
      if (whisperInstruction) {
        await handleWhisperSend(whisperInstruction)
        return
      }
      // A bare "@ai" with no instruction must never fall through to a normal
      // send — the customer would literally receive the text "@ai".
      if (WHISPER_HINT_RE.test(trimmed)) {
        toast.error("Add an instruction after @ai", {
          description: 'For example: "@ai tell them I\'ll be there around 5".',
        })
        return
      }
    }

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
        originalAiDraft: kind === "message" ? (originalAiDraftRef.current ?? undefined) : undefined,
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
      setSuggestions([])
      originalAiDraftRef.current = null
      setAnnouncement(kind === "note" ? "Note added" : "Reply sent")
    } catch (error) {
      if (!isMountedRef.current) return
      // sendReply throws a clear, human-readable message for a real delivery
      // failure (e.g. an Instagram messaging-window miss, SMS not
      // configured) — surface that instead of a generic "try again" when
      // one is available.
      const description = error instanceof Error && error.message ? error.message : "Please try again."
      toast.error(kind === "note" ? "Couldn't add note" : "Couldn't send reply", { description })
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

  const isWhisperIntent = mode === "reply" && WHISPER_HINT_RE.test(text.trimStart())

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

      {isVoiceConversation ? (
        <div className="flex items-center gap-1.5 rounded-lg border border-warning/30 bg-warning/10 px-2.5 py-1.5 text-xs font-medium text-warning">
          <PhoneOff aria-hidden="true" className="size-3.5 shrink-0" />
          Call transcript — replies can&apos;t reach a finished call. Notes are private to you.
        </div>
      ) : (
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
      )}

      {isWhisperIntent && (
        <div
          role="status"
          className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-xs font-medium text-primary"
        >
          <Sparkles aria-hidden="true" className="size-3.5 shrink-0" />
          Whisper — the AI will deliver this in its own words.
        </div>
      )}

      {mode === "reply" && suggestions.length > 0 && (
        <div role="list" aria-label="Suggested replies" className="flex flex-wrap gap-1.5">
          {suggestions.map((suggestion, index) => (
            <div key={`${index}-${suggestion}`} role="listitem" className="group relative">
              <button
                type="button"
                title={suggestion}
                onClick={() => handleSelectSuggestion(suggestion)}
                className="max-w-64 truncate rounded-full border border-border bg-muted/60 py-1 pr-6 pl-2.5 text-xs text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {suggestion}
              </button>
              <button
                type="button"
                aria-label="Dismiss suggestion"
                onClick={() => handleDismissSuggestion(index)}
                className="absolute top-1/2 right-1 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground/70 transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X aria-hidden="true" className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

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
          onChange={(event) => {
            const nextValue = event.target.value
            // Clearing the box back to empty is "starting from scratch" —
            // whatever gets typed next must never be attributed to a draft
            // that's no longer even in the composer (see originalAiDraftRef
            // above).
            if (nextValue === "") originalAiDraftRef.current = null
            setText(nextValue)
          }}
          onKeyDown={handleKeyDown}
          placeholder={
            mode === "note" ? "Add an internal note (not sent to the customer)…" : 'Write a reply… or "@ai " to whisper'
          }
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
        <div className="flex flex-wrap items-center gap-2">
          {mode === "reply" ? (
            <>
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={requestSuggestions}
                disabled={isSuggesting}
                className="gap-1.5"
              >
                {isSuggesting ? (
                  <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles aria-hidden="true" className="size-3.5" />
                )}
                {isSuggesting ? "Suggesting…" : "Suggest"}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!text.trim() || isRewriting}
                      className="gap-1.5"
                    />
                  }
                >
                  {isRewriting ? (
                    <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                  ) : (
                    <Wand2 aria-hidden="true" className="size-3.5" />
                  )}
                  Rewrite
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {REWRITE_MODE_OPTIONS.map((option) => (
                    <DropdownMenuItem key={option.value} onClick={() => handleRewrite(option.value)}>
                      {option.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
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
