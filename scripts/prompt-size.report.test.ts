// Prompt-size regression guard (Outlast cost-trim wave, owner-authorized
// 2026-08-02: "make prompts small, don't be afraid"). Builds the SAME system
// prompt draftCustomerReply sends the model, via the real buildSystemPrompt,
// with a maximally-populated set of fabricated inputs — a fully filled-out
// Business Brain (6 services, 6 FAQs, the model-allowed max of both), both
// memories (conversation + person), a relationship line, a style-examples
// block, a standing-orders block, and an active wind-down directive — so this
// always measures the WORST-CASE (largest realistic) prompt, not a lucky-thin
// one. Chars are used as a cheap proxy for tokens (~4 chars/token for English
// prose) since it needs no tokenizer dependency.
//
// This is a permanent size-regression guard, not a one-off report: the
// ceiling assertion below fails the suite if a future change silently
// bloats the prompt back up. Run with `npm test` (included via
// vitest.config.ts's `include: ["scripts/**/*.test.ts"]`), or directly:
//   npx vitest run scripts/prompt-size.report.test.ts

import { describe, expect, it } from "vitest"

import { buildSystemPrompt, windDownDirectiveForStage } from "@/lib/ai/frontdesk-reply"
import { renderStandingOrdersBlock } from "@/lib/standing-orders"
import { renderStyleExamplesBlock } from "@/lib/ai/style-examples"
import type { BusinessBrain, Contact, Conversation, Message } from "@/lib/types"

// ---------------------------------------------------------------------------
// Fabricated worst-case inputs
// ---------------------------------------------------------------------------

const now = new Date("2026-08-02T12:00:00.000Z").toISOString()

const BRAIN: BusinessBrain = {
  org_id: "org-report",
  business_name: "Riverstone Barbershop & Grooming Co.",
  category: "barbershop and grooming studio",
  description:
    "A full-service barbershop and grooming studio in the heart of downtown, offering classic cuts, modern fades, beard sculpting, hot towel shaves, and kids' cuts in a relaxed, no-rush atmosphere with a small team of longtime local barbers who know most of their regulars by name.",
  hours: {
    monday: { open: "09:00", close: "19:00" },
    tuesday: { open: "09:00", close: "19:00" },
    wednesday: { open: "09:00", close: "19:00" },
    thursday: { open: "09:00", close: "20:00" },
    friday: { open: "09:00", close: "20:00" },
    saturday: { open: "08:00", close: "17:00" },
    sunday: { closed: true, open: "", close: "" },
  },
  services: [
    { name: "Classic Haircut", price: "$35", description: "Scissor or clipper cut, wash, and style.", duration_minutes: 30 },
    { name: "Skin Fade", price: "$40", description: "Precision fade with a razor-clean finish.", duration_minutes: 40 },
    { name: "Beard Trim & Shape", price: "$20", description: "Line-up and shape with hot towel finish.", duration_minutes: 20 },
    { name: "Hot Towel Shave", price: "$45", description: "Traditional straight-razor shave.", duration_minutes: 45 },
    { name: "Kids Cut (12 & under)", price: "$25", description: "Patient, quick cuts for kids.", duration_minutes: 25 },
    { name: "Cut + Beard Combo", price: "$50", description: "Full haircut with beard trim and shape.", duration_minutes: 50 },
  ],
  prices: {},
  faq: [
    { question: "Do you take walk-ins?", answer: "Yes, but appointments get priority — booking ahead means less wait." },
    { question: "Do you accept card payments?", answer: "Yes, we take all major cards, tap, and cash." },
    { question: "Is parking available?", answer: "Free 2-hour street parking right out front, plus a lot two blocks north." },
    { question: "Can I request a specific barber?", answer: "Absolutely, just mention their name when you book." },
    { question: "What's your cancellation policy?", answer: "Please give us at least 2 hours notice or a small fee may apply." },
    { question: "Do you do kids' cuts?", answer: "Yes, we're happy to take kids of any age, just budget extra patience time." },
  ],
  tone: "warm, easygoing, a little playful, never stiff or corporate",
  brand_kit: {},
  connected_channels: { web_chat: true, instagram: true, sms: true },
  onboarding_step: 5,
  completed: true,
  updated_at: now,
  frontdesk_auto_reply: true,
  ai_intro_enabled: true,
  ai_intro_text: null,
  ai_always_on: true,
}

const CONVERSATION_MEMORY = {
  facts: [
    "prefers a skin fade with a hard part",
    "usually books Saturday mornings",
    "has a standing 3pm slot most weeks",
    "mentioned a wedding coming up in October",
  ],
  open_threads: ["still deciding between the classic combo and just a fade", "asked about a group booking for groomsmen"],
  vibe: "friendly regular, texts casually, uses a lot of \"lol\" and \"fr\"",
  summary:
    "Long-running regular who's been coming in for about a year, usually books through Instagram DM, prefers the same barber (Marco) when available, and is currently trying to plan a groomsmen group booking around an October wedding while also deciding on his own cut for the day.",
  updated_at: now,
  message_count: 42,
}

const PERSON_MEMORY = {
  facts: ["goes by Jay", "works nearby downtown, usually comes on lunch breaks", "getting married in October"],
  relationship: "regular for about a year, friendly rapport, usually jokes around a bit",
  topics: ["fades", "the upcoming wedding", "groomsmen group booking"],
  updated_at: now,
}

const CONTACT: Contact = {
  id: "contact-report",
  org_id: "org-report",
  name: "Jay Martinez",
  phone: "+15555550123",
  email: "jay@example.com",
  source: "instagram",
  status: "customer",
  tags: ["regular"],
  notes: null,
  custom: {},
  created_at: "2025-08-01T00:00:00.000Z",
  updated_at: now,
  ai_memory: PERSON_MEMORY as unknown as Record<string, unknown>,
  is_vip: false,
}

const CONVERSATION: Conversation = {
  id: "conversation-report",
  org_id: "org-report",
  contact_id: CONTACT.id,
  channel: "instagram",
  status: "open",
  ai_state: "ai_answered",
  ai_mode: "auto",
  last_message_at: now,
  unread: false,
  created_at: now,
  updated_at: now,
  ai_memory: CONVERSATION_MEMORY as unknown as Record<string, unknown>,
  last_follow_up_at: null,
}

/** A handful of alternating messages, including AI-handled outbound replies, so the banned-openers block also renders — the worst case includes it. */
const MESSAGES: Message[] = [
  { id: "m1", org_id: "org-report", conversation_id: CONVERSATION.id, direction: "inbound", kind: "message", body: "yo you guys open sat morning?", ai_handled: false, model: null, cost_usd: 0, metadata: {}, created_at: now },
  { id: "m2", org_id: "org-report", conversation_id: CONVERSATION.id, direction: "outbound", kind: "message", body: "yep we open at 8 on saturdays, want me to grab you a spot", ai_handled: true, model: "test", cost_usd: 0, metadata: {}, created_at: now },
  { id: "m3", org_id: "org-report", conversation_id: CONVERSATION.id, direction: "inbound", kind: "message", body: "yeah pencil me in, same as usual", ai_handled: false, model: null, cost_usd: 0, metadata: {}, created_at: now },
  { id: "m4", org_id: "org-report", conversation_id: CONVERSATION.id, direction: "outbound", kind: "message", body: "done, saturday 9am with marco, see you then", ai_handled: true, model: "test", cost_usd: 0, metadata: {}, created_at: now },
  { id: "m5", org_id: "org-report", conversation_id: CONVERSATION.id, direction: "inbound", kind: "message", body: "also wondering about a group thing for the wedding", ai_handled: false, model: null, cost_usd: 0, metadata: {}, created_at: now },
]

const STYLE_EXAMPLES_BLOCK = renderStyleExamplesBlock([
  { aiDraft: "I'd be happy to assist you with booking that appointment for Saturday morning!", ownerText: "yep got you, sat morning works" },
  { aiDraft: "Thank you for reaching out, we truly appreciate your business.", ownerText: "thanks for the message!" },
  { aiDraft: "Please let us know if there is anything else we can help you with.", ownerText: "lmk if you need anything else" },
])

const STANDING_ORDERS_BLOCK = renderStandingOrdersBlock([
  { instruction: "I'm out sick this week — tell regulars appointments might run a little behind schedule." },
  { instruction: "We're fully booked for wedding season Saturdays through October, don't overbook group requests without checking with me first." },
])

const WIND_DOWN_DIRECTIVE = windDownDirectiveForStage("close")

// ---------------------------------------------------------------------------
// Size guard
// ---------------------------------------------------------------------------

/**
 * Ceiling in characters (~= tokens * 4). Set to the AFTER (post-trim) size
 * plus ~15% headroom for incidental future copy tweaks — NOT generous enough
 * to silently re-absorb a whole new verbose block.
 *
 * Outlast cost-trim wave (owner-authorized, 2026-08-02) BEFORE/AFTER on this
 * exact worst-case fixture: 9966 chars (~2492 tokens) -> 7542 chars
 * (~1886 tokens), a ~24% reduction, from compressing STYLE_GUIDE/
 * ESCALATION_GUIDE/the identity block/block headers — no change to any JSON
 * output contract, behavioral rule's substance, PII routing, model choice, or
 * existing MAX_* cap. 7542 * 1.15 ≈ 8673, rounded up.
 */
const MAX_SYSTEM_PROMPT_CHARS = 8700

describe("frontdesk system prompt size", () => {
  it("stays under the size-regression ceiling for a maximally-populated worst-case prompt", () => {
    const prompt = buildSystemPrompt(
      BRAIN,
      CONVERSATION,
      MESSAGES,
      CONTACT,
      WIND_DOWN_DIRECTIVE,
      STYLE_EXAMPLES_BLOCK,
      STANDING_ORDERS_BLOCK
    )

    const chars = prompt.length
    const approxTokens = Math.round(chars / 4)
    console.log(`[prompt-size] worst-case frontdesk system prompt: ${chars} chars (~${approxTokens} tokens)`)

    expect(chars).toBeGreaterThan(0)
    expect(chars).toBeLessThanOrEqual(MAX_SYSTEM_PROMPT_CHARS)
  })
})
