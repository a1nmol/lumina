"use client"

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react"
import { Loader2, RefreshCw, Send, Sparkles, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { Message, MessageKind } from "@/lib/types"

import { draftReply, sendReply } from "@/app/(app)/inbox/actions"

const AI_FAILURE_TOAST = "I couldn't answer this — flagging for you."

type ComposerMode = "reply" | "note"

/** Imperative handle so the context pane's "Add note" quick action can jump the composer into Note mode and focus it. */
export type ReplyComposerHandle = {
  focusNote: () => void
}

type ReplyComposerProps = {
  conversationId: string
  onSent: (message: Message) => void
  /** Fired when the AI draft flow escalates the thread (needsHuman) — parent flips ai_state locally + persists it. */
  onEscalated: (reason: string) => void
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

  async function requestDraft() {
    setIsDrafting(true)
    setAnnouncement("Drafting a reply…")
    try {
      const result = await draftReply(conversationId)
      if (!isMountedRef.current) return

      if ("error" in result) {
        if (result.error === "allowance") {
          toast.error("You're out of AI reply quota this month", { description: result.message })
        } else {
          onEscalated(result.message)
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
      if (!isMountedRef.current) return
      toast.error("Couldn't draft a reply", { description: "Please try again." })
      setAnnouncement("")
    } finally {
      if (isMountedRef.current) setIsDrafting(false)
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

      <Tabs
        value={mode}
        onValueChange={(value) => {
          setMode(value as ComposerMode)
        }}
      >
        <TabsList aria-label="Reply or internal note">
          <TabsTrigger value="reply">Reply</TabsTrigger>
          <TabsTrigger value="note">Note</TabsTrigger>
        </TabsList>
      </Tabs>

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
