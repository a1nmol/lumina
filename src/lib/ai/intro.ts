// Honest-AI intro gating — shared by every FrontDesk auto-reply channel
// (Instagram DM webhook, the web-chat widget, SMS) so the "when do we send
// the owner's one-time AI disclosure" rule lives in exactly one place. Owner
// spec (2026-07-30): new/long-quiet conversations should open with a
// one-time, owner-written line disclosing that an AI is answering — WITHOUT
// watermarking every message. This module decides ONLY the "should we send
// it right now" question; the literal text always comes verbatim from
// business_brain.ai_intro_text (migration 0013) — never AI-generated, never
// modified by this module.
//
// Pure/no I/O by design (no "server-only" guard) so it's trivially unit
// testable and safe to import from a client-adjacent test file — callers
// (the three channel routes) do all the Supabase/Graph-API/Twilio work
// around it.

/**
 * A conversation is considered "fresh" again after this much silence — long
 * enough that a re-intro after a quiet gap reads as natural, short enough
 * that it never fires mid-conversation. One shared constant so every channel
 * agrees on the same window.
 */
export const INTRO_SESSION_GAP_MS = 2 * 60 * 60 * 1000 // 2 hours

/** The minimal message shape the gating logic needs — direction + timestamp + whether the AI sent it. Structurally compatible with `src/lib/types.ts`'s `Message`, but kept narrow so callers don't need a full row. */
export interface IntroGateMessage {
  direction: "inbound" | "outbound"
  created_at: string
  /**
   * Only AI-sent outbound messages count as "the AI already introduced
   * itself." A human owner replying manually (ai_mode 'off') must NOT
   * suppress the intro — otherwise flipping a human-handled thread to 'auto'
   * would let the AI's first reply pass as the same human.
   */
  ai_handled: boolean
}

export interface ShouldSendIntroInput {
  /** business_brain.ai_intro_enabled */
  aiIntroEnabled: boolean
  /** business_brain.ai_intro_text — the owner's literal words, never modified here. */
  aiIntroText: string | null | undefined
  /**
   * Every message in the conversation strictly BEFORE the inbound message
   * that's about to trigger this AI auto-reply. Order doesn't matter — this
   * function only looks at whether any is outbound and, if so, the most
   * recent timestamp among them.
   */
  priorMessages: IntroGateMessage[]
  /** Injectable clock for tests; defaults to `Date.now()`. */
  now?: number
}

/**
 * True when the AI is about to auto-reply and should send the owner's intro
 * FIRST, as its own separate outbound message, per the rule: the intro is
 * enabled with non-blank text, AND either (a) this conversation has no prior
 * AI-sent message at all (first-ever AI reply — a human owner's manual
 * replies don't count, so flipping a human-handled thread to 'auto' still
 * discloses), or (b) the most recent prior AI-sent message is older than
 * `INTRO_SESSION_GAP_MS`. This naturally re-introduces after long silences
 * or a long human-handled stretch, and never dupes mid-session.
 */
export function shouldSendIntro(input: ShouldSendIntroInput): boolean {
  if (!input.aiIntroEnabled) return false
  if (!input.aiIntroText || !input.aiIntroText.trim()) return false

  const priorAiMessages = input.priorMessages.filter(
    (message) => message.direction === "outbound" && message.ai_handled,
  )
  if (priorAiMessages.length === 0) return true // (a) first-ever AI reply

  const now = input.now ?? Date.now()
  const lastAiTimestamp = priorAiMessages.reduce<number | null>((latest, message) => {
    const timestamp = new Date(message.created_at).getTime()
    if (Number.isNaN(timestamp)) return latest
    return latest === null || timestamp > latest ? timestamp : latest
  }, null)

  if (lastAiTimestamp === null) return true // defensive — no usable timestamps, treat as a fresh conversation

  return now - lastAiTimestamp > INTRO_SESSION_GAP_MS // (b) quiet-gap re-intro
}

/**
 * The trimmed, ready-to-send intro text, or null when nothing should be sent
 * right now — combines `shouldSendIntro`'s gating with the actual text so
 * callers never re-derive it. Still the owner's literal words, untouched
 * beyond trimming whitespace.
 */
export function getIntroToSend(input: ShouldSendIntroInput): string | null {
  if (!shouldSendIntro(input)) return null
  return (input.aiIntroText as string).trim()
}
