"use client"

// Customer-facing chat surface for the embeddable web widget
// (MASTER_PLAN.md §4.D "web chat widget"; see
// docs/design-briefs/phase-2-inbox-frontdesk-crm.md "Web chat widget").
//
// Deliberately does NOT reuse the dashboard's Button/Input/Card primitives —
// those lean on the app-wide `bg-primary`/`border-border`/etc Tailwind
// utilities, whose values follow next-themes' `.dark` class (see
// ../widget.css for why this page can't use that). Everything here is
// styled off the `--lw-*` custom properties via Tailwind arbitrary values.
//
// Message history is intentionally client-only (component state), not
// fetched from the server on load — a fresh page load starts a fresh visible
// thread even though the same contact/conversation is reused server-side via
// the persisted visitorId. Good enough for the demo/MVP; a "load my past
// messages" GET endpoint is a natural follow-up once real embeds exist.

import { useEffect, useId, useRef, useState } from "react"
import { AlertCircle, Clock4, RotateCw, Send, Sparkles } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"

import { duration, easing } from "@/lib/motion"

const VISITOR_ID_KEY = "lw_visitor_id"
const MAX_MESSAGE_LENGTH = 1000

interface WidgetChatProps {
  orgSlug: string
  businessName: string
  /** First-person opening line shown before the visitor sends anything — never a blank thread. */
  greeting: string
}

type WidgetMessage = {
  id: string
  from: "visitor" | "business"
  body: string
  ai?: boolean
}

type SendState = "idle" | "sending" | "error" | "rate_limited"

function generateVisitorId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  // Fallback RFC4122-ish v4 for older browsers without crypto.randomUUID.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0
    const value = char === "x" ? random : (random & 0x3) | 0x8
    return value.toString(16)
  })
}

function getOrCreateVisitorId(): string {
  try {
    const existing = window.localStorage.getItem(VISITOR_ID_KEY)
    if (existing) return existing
    const created = generateVisitorId()
    window.localStorage.setItem(VISITOR_ID_KEY, created)
    return created
  } catch {
    // Storage disabled (private mode / iframe partitioning) — fall back to a
    // session-only id so the widget still works, just without persistence.
    return generateVisitorId()
  }
}

export function WidgetChat({ orgSlug, businessName, greeting }: WidgetChatProps) {
  const reduceMotion = useReducedMotion()
  const listId = useId()
  const inputId = useId()
  const visitorIdRef = useRef<string>("")
  const [messages, setMessages] = useState<WidgetMessage[]>([
    { id: "greeting", from: "business", body: greeting, ai: true },
  ])
  const [draft, setDraft] = useState("")
  const [sendState, setSendState] = useState<SendState>("idle")
  const [lastFailed, setLastFailed] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    visitorIdRef.current = getOrCreateVisitorId()
  }, [])

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" })
  }, [messages, sendState, reduceMotion])

  // Tell the embedding loader script (public/widget.js) a business/AI
  // message just arrived, so it can spring in the unread badge on the FAB
  // when the panel is closed. "*" targetOrigin is safe here — this message
  // carries no sensitive data, only a notification tick.
  const lastNotifiedCountRef = useRef(0)
  useEffect(() => {
    const businessCount = messages.filter((message) => message.from === "business").length
    if (businessCount > lastNotifiedCountRef.current && window.parent !== window) {
      window.parent.postMessage({ source: "localos-widget", type: "message" }, "*")
    }
    lastNotifiedCountRef.current = businessCount
  }, [messages])

  async function sendMessage(body: string) {
    const trimmed = body.trim()
    if (!trimmed || sendState === "sending") return

    setDraft("")
    setLastFailed(null)
    setMessages((prev) => [...prev, { id: crypto.randomUUID?.() ?? `${Date.now()}`, from: "visitor", body: trimmed }])
    setSendState("sending")

    try {
      const response = await fetch("/api/frontdesk/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org: orgSlug, visitorId: visitorIdRef.current, message: trimmed }),
      })

      if (response.status === 429) {
        setSendState("rate_limited")
        setLastFailed(trimmed)
        return
      }

      if (!response.ok) {
        setSendState("error")
        setLastFailed(trimmed)
        return
      }

      const data = (await response.json()) as { intro?: string; reply?: string; ai?: boolean }
      if (!data.reply) {
        // A 2xx with no reply is NOT an error: the org has AI auto-replies
        // off for this thread (ai_mode 'off'), so the message was received
        // and queued for a human. Show a neutral ack instead of the retry
        // banner — the customer's message DID land.
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID?.() ?? `${Date.now()}-ack`,
            from: "business",
            body: "Got it! We'll get back to you shortly.",
            ai: false,
          },
        ])
        setSendState("idle")
        return
      }

      setMessages((prev) => [
        ...prev,
        // Honest-AI intro (owner-written, one-time-per-session) always
        // renders as its own bubble ABOVE the real reply, both AI-badged —
        // never merged into one message.
        ...(data.intro
          ? [{ id: crypto.randomUUID?.() ?? `${Date.now()}-intro`, from: "business" as const, body: data.intro, ai: true }]
          : []),
        { id: crypto.randomUUID?.() ?? `${Date.now()}-reply`, from: "business", body: data.reply!, ai: data.ai ?? true },
      ])
      setSendState("idle")
    } catch {
      setSendState("error")
      setLastFailed(trimmed)
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    void sendMessage(draft)
  }

  function handleRetry() {
    if (lastFailed) void sendMessage(lastFailed)
  }

  const isSending = sendState === "sending"

  return (
    <div className="flex h-dvh w-full flex-col">
      {/* Header */}
      <header className="flex shrink-0 items-center gap-3 border-b border-[var(--lw-border)] bg-[var(--lw-card)] px-4 py-3 shadow-[var(--lw-shadow-soft)]">
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--lw-primary)] text-[var(--lw-primary-fg)]"
        >
          <span className="text-sm font-semibold">{businessName.slice(0, 1).toUpperCase()}</span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--lw-fg)]">{businessName}</p>
          <p className="flex items-center gap-1 text-xs text-[var(--lw-muted-fg)]">
            <Clock4 aria-hidden="true" className="size-3" />
            Usually replies in minutes
          </p>
        </div>
      </header>

      {/* Message list */}
      <div
        ref={listRef}
        id={listId}
        role="log"
        aria-live="polite"
        aria-label={`Conversation with ${businessName}`}
        className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
      >
        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: duration.fast, ease: easing.out }}
              className={`flex flex-col gap-1 ${message.from === "visitor" ? "items-end" : "items-start"}`}
            >
              {message.from === "business" && message.ai && (
                <span className="flex items-center gap-1 px-1 text-[10px] font-medium tracking-wide text-[var(--lw-primary)] uppercase">
                  <Sparkles aria-hidden="true" className="size-3" />
                  AI
                </span>
              )}
              <div
                className={`max-w-[80%] rounded-[var(--lw-radius-2xl)] px-3.5 py-2.5 text-sm leading-relaxed break-words shadow-[var(--lw-shadow-soft)] ${
                  message.from === "visitor"
                    ? "rounded-br-[var(--lw-radius-lg)] bg-[var(--lw-primary)] text-[var(--lw-primary-fg)]"
                    : "rounded-bl-[var(--lw-radius-lg)] bg-[var(--lw-muted)] text-[var(--lw-fg)]"
                }`}
              >
                {message.body}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isSending && (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-start"
            aria-hidden="true"
          >
            <div className="flex items-center gap-1 rounded-[var(--lw-radius-2xl)] rounded-bl-[var(--lw-radius-lg)] bg-[var(--lw-muted)] px-3.5 py-3">
              {[0, 1, 2].map((dot) => (
                <span
                  key={dot}
                  className="lw-typing-dot size-1.5 rounded-full bg-[var(--lw-muted-fg)]"
                  style={{ animationDelay: `${dot * 0.15}s` }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </div>

      {/* Error / rate-limit banner */}
      {(sendState === "error" || sendState === "rate_limited") && (
        <div
          role="alert"
          className="mx-4 mb-2 flex items-center justify-between gap-2 rounded-[var(--lw-radius-lg)] bg-[var(--lw-danger-bg)] px-3 py-2 text-xs text-[var(--lw-danger)]"
        >
          <span className="flex items-center gap-1.5">
            <AlertCircle aria-hidden="true" className="size-3.5 shrink-0" />
            {sendState === "rate_limited"
              ? "You're sending messages a bit fast — give it a few seconds."
              : "Couldn't send that message. Please try again."}
          </span>
          {sendState === "error" && (
            <button
              type="button"
              onClick={handleRetry}
              className="flex shrink-0 items-center gap-1 rounded-[var(--lw-radius-lg)] border border-[var(--lw-danger)]/30 px-2 py-1 font-medium transition-colors hover:bg-[var(--lw-danger)]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lw-danger)]/50"
            >
              <RotateCw aria-hidden="true" className="size-3" />
              Retry
            </button>
          )}
        </div>
      )}

      {/* Composer */}
      <form
        onSubmit={handleSubmit}
        className="flex shrink-0 items-end gap-2 border-t border-[var(--lw-border)] bg-[var(--lw-card)] p-3"
      >
        <label htmlFor={inputId} className="sr-only">
          Message {businessName}
        </label>
        <textarea
          id={inputId}
          value={draft}
          onChange={(event) => setDraft(event.target.value.slice(0, MAX_MESSAGE_LENGTH))}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              void sendMessage(draft)
            }
          }}
          placeholder="Type a message…"
          rows={1}
          maxLength={MAX_MESSAGE_LENGTH}
          disabled={isSending}
          className="max-h-28 min-h-9 flex-1 resize-none rounded-[var(--lw-radius-xl)] border border-[var(--lw-border)] bg-[var(--lw-bg)] px-3 py-2 text-sm text-[var(--lw-fg)] outline-none placeholder:text-[var(--lw-muted-fg)] focus-visible:ring-2 focus-visible:ring-[var(--lw-primary)]/50 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={isSending || draft.trim().length === 0}
          aria-label="Send message"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--lw-primary)] text-[var(--lw-primary-fg)] transition-transform outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--lw-primary)]/50 motion-safe:active:scale-95 disabled:pointer-events-none disabled:opacity-40"
        >
          <Send aria-hidden="true" className="size-4" />
        </button>
      </form>
    </div>
  )
}
