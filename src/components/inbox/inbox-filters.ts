import type { ConversationChannel, ConversationWithContact, Message } from "@/lib/types"

import { CHANNEL_GLYPHS } from "./channel-glyphs"

export type ThreadFilter = "all" | "needs_you" | "ai_handled"

export type ChannelFilterValue = ConversationChannel | "all"

export const THREAD_FILTERS: { value: ThreadFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "needs_you", label: "Needs you" },
  { value: "ai_handled", label: "AI handled" },
]

/**
 * "Needs you" = anything not resolved that the AI hasn't fully handled on its
 * own (escalated, an unreviewed AI draft, or a human-only thread) — the set
 * an owner should actually look at. "AI handled" = the AI answered it
 * outright.
 */
export function matchesThreadFilter(conversation: ConversationWithContact, filter: ThreadFilter): boolean {
  if (filter === "needs_you") return conversation.status !== "resolved" && conversation.ai_state !== "ai_answered"
  if (filter === "ai_handled") return conversation.ai_state === "ai_answered"
  return true
}

export function matchesChannelFilter(conversation: ConversationWithContact, channel: ChannelFilterValue): boolean {
  if (channel === "all") return true
  return conversation.channel === channel
}

/**
 * The thread list's 1-line snippet. Prefers the most recent message body
 * when it's available (demo data carries full history — see
 * ThreadListConversation in src/app/(app)/inbox/actions.ts) and otherwise
 * falls back to a generic "via <channel>" placeholder.
 */
export function getThreadSnippet(conversation: {
  channel: ConversationChannel
  messages?: Message[]
}): string {
  const lastMessage = conversation.messages?.[conversation.messages.length - 1]
  if (lastMessage?.body?.trim()) {
    const prefix = lastMessage.kind === "note" ? "Note: " : lastMessage.direction === "outbound" ? "You: " : ""
    return `${prefix}${lastMessage.body.trim()}`
  }
  return `via ${CHANNEL_GLYPHS[conversation.channel].label}`
}

/** Best-effort initials from a contact name (or "?" when there's none on file yet). */
export function initialsFromName(name: string | null): string {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}
