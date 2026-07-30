// TEMPORARY DIAGNOSTIC (Feature 2 — Honest-AI language mirroring). Calls the
// REAL draftCustomerReply() pipeline (real OpenRouter call, real Supabase
// allowance/usage bookkeeping against a live org) with a romanized-Nepali
// inbound message and logs the reply for the lead to eyeball. Mirrors
// scripts/design-post-theme.diag.test.ts's skipIf-when-unconfigured guard so
// CI (which runs keyless) skips cleanly.
import { describe, expect, it } from "vitest"

import { draftCustomerReply } from "../src/lib/ai/frontdesk-reply"
import type { Contact, Conversation, Message } from "../src/lib/types"

// An existing live org (queried directly from the `orgs` table) — used only
// so checkAllowance()/recordUsage() have a real row to read/write against,
// same org id scripts/design-post-theme.diag.test.ts already uses.
const REAL_ORG_ID = "e2a268ac-1150-43e2-ae39-27ca7e11ec44"

const ROMANIZED_NEPALI_MESSAGE =
  "namaste, malai haircut ko price kati ho bhanera sodhna man lagyo, ani bholi khulcha?"

describe("FrontDesk reply — romanized-language mirroring (real pipeline diagnostic)", () => {
  it.skipIf(!process.env.OPENROUTER_API_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)(
    "replies in the customer's own romanized language, not English or native script",
    async () => {
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

      const messages: Message[] = [
        {
          id: "diag-message-1",
          org_id: REAL_ORG_ID,
          conversation_id: conversation.id,
          direction: "inbound",
          kind: "message",
          body: ROMANIZED_NEPALI_MESSAGE,
          ai_handled: false,
          model: null,
          cost_usd: 0,
          metadata: {},
          created_at: now,
        },
      ]

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
})
