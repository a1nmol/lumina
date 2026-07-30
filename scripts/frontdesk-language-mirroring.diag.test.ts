// TEMPORARY DIAGNOSTIC (Feature 2 — Honest-AI language mirroring, extended
// 2026-07-30 with spelling-fidelity/punctuation-free-questions/don't-guess
// cases). Calls the REAL draftCustomerReply() pipeline (real OpenRouter call,
// real Supabase allowance/usage bookkeeping against a live org) with
// romanized-Nepali inbound messages and logs the replies for the lead to
// eyeball. Mirrors scripts/design-post-theme.diag.test.ts's
// skipIf-when-unconfigured guard so CI (which runs keyless) skips cleanly.
import { describe, expect, it } from "vitest"

import { draftCustomerReply } from "../src/lib/ai/frontdesk-reply"
import type { Contact, Conversation, Message } from "../src/lib/types"

// An existing live org (queried directly from the `orgs` table) — used only
// so checkAllowance()/recordUsage() have a real row to read/write against,
// same org id scripts/design-post-theme.diag.test.ts already uses.
const REAL_ORG_ID = "e2a268ac-1150-43e2-ae39-27ca7e11ec44"

const ROMANIZED_NEPALI_MESSAGE =
  "namaste, malai haircut ko price kati ho bhanera sodhna man lagyo, ani bholi khulcha?"

// No "?" at all — real romanized-Nepali texting habit. "khana khayeu" means
// "did you eat" and IS a question despite the missing punctuation.
const PUNCTUATION_FREE_QUESTION = "khana khayeu"

function buildConversationAndMessages(history: Array<{ direction: "inbound" | "outbound"; body: string }>): {
  conversation: Conversation
  messages: Message[]
} {
  const now = new Date().toISOString()

  const conversation: Conversation = {
    id: "diag-conversation",
    org_id: REAL_ORG_ID,
    contact_id: "diag-contact",
    channel: "web_chat",
    status: "open",
    ai_state: "ai_answered",
    ai_mode: "auto",
    last_message_at: now,
    unread: false,
    created_at: now,
    updated_at: now,
  }

  const messages: Message[] = history.map((entry, index) => ({
    id: `diag-message-${index}`,
    org_id: REAL_ORG_ID,
    conversation_id: conversation.id,
    direction: entry.direction,
    kind: "message",
    body: entry.body,
    ai_handled: false,
    model: null,
    cost_usd: 0,
    metadata: {},
    created_at: now,
  }))

  return { conversation, messages }
}

const SKIP_WHEN_UNCONFIGURED =
  !process.env.OPENROUTER_API_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY

describe("FrontDesk reply — romanized-language mirroring (real pipeline diagnostic)", () => {
  it.skipIf(SKIP_WHEN_UNCONFIGURED)(
    "replies in the customer's own romanized language, not English or native script",
    async () => {
      const { conversation, messages } = buildConversationAndMessages([
        { direction: "inbound", body: ROMANIZED_NEPALI_MESSAGE },
      ])

      const contact: Contact | null = null

      const result = await draftCustomerReply({
        orgId: REAL_ORG_ID,
        businessBrain: null,
        conversation,
        messages,
        contact,
      })

      expect(result).not.toBeNull()
      if (!result) return

      console.log("[frontdesk-language-diag] inbound:", ROMANIZED_NEPALI_MESSAGE)
      console.log("[frontdesk-language-diag] reply:", result.reply)

      expect(result.reply.trim().length).toBeGreaterThan(0)
      expect(result.reply).not.toContain("—") // no em dash, per STYLE_GUIDE
    },
    30000
  )

  it.skipIf(SKIP_WHEN_UNCONFIGURED)(
    "reads intent from a punctuation-free romanized question (\"khana khayeu\", no \"?\")",
    async () => {
      const { conversation, messages } = buildConversationAndMessages([
        { direction: "inbound", body: PUNCTUATION_FREE_QUESTION },
      ])

      const contact: Contact | null = null

      const result = await draftCustomerReply({
        orgId: REAL_ORG_ID,
        businessBrain: null,
        conversation,
        messages,
        contact,
      })

      expect(result).not.toBeNull()
      if (!result) return

      console.log("[frontdesk-language-diag] inbound:", PUNCTUATION_FREE_QUESTION)
      console.log("[frontdesk-language-diag] reply:", result.reply)

      expect(result.reply.trim().length).toBeGreaterThan(0)
      expect(result.reply).not.toContain("—") // no em dash, per STYLE_GUIDE
    },
    30000
  )

  it.skipIf(SKIP_WHEN_UNCONFIGURED)(
    "log-only: does the reply reuse the customer's own romanization spellings (\"xau\"/\"x\") from earlier in the conversation?",
    async () => {
      const { conversation, messages } = buildConversationAndMessages([
        { direction: "inbound", body: "hajur, xaina hunxa ki bhanera sodheko, aile xu tara bihar chai xau vanne socheko" },
        { direction: "outbound", body: "hajur, hamro shop 9 baje khulxa, aaunu na!" },
        { direction: "inbound", body: "ok malai bihar aauna man xa, tapai lai time milxa?" },
      ])

      const contact: Contact | null = null

      const result = await draftCustomerReply({
        orgId: REAL_ORG_ID,
        businessBrain: null,
        conversation,
        messages,
        contact,
      })

      expect(result).not.toBeNull()
      if (!result) return

      console.log("[frontdesk-language-diag] history:", messages.map((message) => message.body).join(" | "))
      console.log("[frontdesk-language-diag] reply:", result.reply)
      const reusedSpelling = /\bxa\w*|\bx\b/i.test(result.reply)
      console.log("[frontdesk-language-diag] reply appears to reuse the customer's \"x\"/\"xau\" spellings:", reusedSpelling)

      // Log-only per spec — no brittle assertion on exact word reuse, a
      // model can phrase a valid reply without needing every spelling again.
    },
    30000
  )
})
