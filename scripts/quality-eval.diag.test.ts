// QUALITY-EVAL HARNESS (Outlast wave 5, Part B) — the regression "ratchet"
// for the FrontDesk personality/escalation rules in
// src/lib/ai/frontdesk-reply.ts. This is a TEMPORARY-STYLE diagnostic in the
// same family as scripts/frontdesk-language-mirroring.diag.test.ts and
// scripts/design-post-theme.diag.test.ts (real OpenRouter + Supabase calls
// against a live org, skipped cleanly when unconfigured), NOT a cron job —
// there is no automated schedule for this (Vercel's Hobby-plan cron budget
// is already fully spent — see vercel.json). Run it by hand:
//
//   WHEN: before shipping a prompt/STYLE_GUIDE/ESCALATION_GUIDE change, and
//   after any model swap in src/lib/ai/router.ts's MODEL_CANDIDATES.
//   HOW:  OPENROUTER_API_KEY=... NEXT_PUBLIC_SUPABASE_URL=... \
//         SUPABASE_SERVICE_ROLE_KEY=... npx vitest run scripts/quality-eval.diag.test.ts
//
// This is the BEHAVIORAL guard (does the AI still sound right / escalate
// correctly?). The permanent, always-on COST/SIZE guard is a separate file —
// scripts/prompt-size.report.test.ts — which checks the prompt hasn't
// silently bloated; that one runs in every `npm test`, this one does not
// (it costs real money per run, so it stays opt-in).
//
// Cost: 6 draftCustomerReply calls (customer_reply job, Claude Haiku 4.5
// first candidate) + 1 judge call (reasoning job, DeepSeek first candidate)
// = 7 small chat-completion calls, all haiku/deepseek-class. At the pinned
// pricing in src/lib/ai/router.ts's MODEL_PRICING this run costs well under
// a cent in practice (short prompts, <400 output tokens each) — see the
// report for the observed real number.

import { describe, expect, it } from "vitest"

import type { ConversationMemory } from "../src/lib/ai/conversation-memory"
import { draftCustomerReply } from "../src/lib/ai/frontdesk-reply"
import type { ChatMessage } from "../src/lib/ai/openrouter"
import { runTextJob } from "../src/lib/ai/router"
import type { Conversation, Message } from "../src/lib/types"

// Same live org scripts/frontdesk-language-mirroring.diag.test.ts and
// scripts/design-post-theme.diag.test.ts already use — just needs a real
// row for checkAllowance()/recordUsage() to read/write against.
const REAL_ORG_ID = "e2a268ac-1150-43e2-ae39-27ca7e11ec44"

const SKIP_WHEN_UNCONFIGURED =
  !process.env.OPENROUTER_API_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY

// Matches the ऀ-ॿ Devanagari Unicode block — used as the soft
// language-mirroring check for the romanized-Nepali case (case 2): a
// romanized-language reply should never switch INTO native script.
const DEVANAGARI_PATTERN = /[ऀ-ॿ]/

let conversationCounter = 0

function buildConversation(overrides: Partial<Conversation> = {}): Conversation {
  const now = new Date().toISOString()
  conversationCounter += 1

  return {
    id: `quality-eval-conversation-${conversationCounter}`,
    org_id: REAL_ORG_ID,
    contact_id: `quality-eval-contact-${conversationCounter}`,
    channel: "web_chat",
    status: "open",
    ai_state: "ai_answered",
    ai_mode: "auto",
    last_message_at: now,
    unread: false,
    created_at: now,
    updated_at: now,
    ai_memory: null,
    last_follow_up_at: null,
    ...overrides,
  }
}

function buildMessages(conversationId: string, history: Array<{ direction: "inbound" | "outbound"; body: string }>): Message[] {
  const now = new Date().toISOString()
  return history.map((entry, index) => ({
    id: `${conversationId}-message-${index}`,
    org_id: REAL_ORG_ID,
    conversation_id: conversationId,
    direction: entry.direction,
    kind: "message",
    body: entry.body,
    ai_handled: false,
    model: null,
    cost_usd: 0,
    metadata: {},
    created_at: now,
  }))
}

// ---------------------------------------------------------------------------
// The 6-case panel
// ---------------------------------------------------------------------------

interface QualityEvalCase {
  label: string
  customerMessage: string
  expectedBehavior: string
  conversation: Conversation
  messages: Message[]
}

const SEEDED_MEMORY: ConversationMemory = {
  facts: ["always books the 9am Saturday slot", "prefers the same stylist, Marco", "mentioned a nephew's wedding coming up"],
  open_threads: [],
  vibe: "friendly regular, casual texting style",
  summary:
    "Long-running regular who's been coming in for months, always books the 9am Saturday slot with Marco, mentioned a nephew's wedding is coming up soon.",
  updated_at: new Date().toISOString(),
  message_count: 4,
}

function buildCases(): QualityEvalCase[] {
  const cases: Array<Omit<QualityEvalCase, "conversation" | "messages"> & { history: Array<{ direction: "inbound" | "outbound"; body: string }>; ai_memory?: Record<string, unknown> | null }> = [
    {
      label: "1. English price question",
      customerMessage: "hey how much is a haircut?",
      expectedBehavior: "Answer directly and confidently (or ask one short clarifier) — never escalate.",
      history: [{ direction: "inbound", body: "hey how much is a haircut?" }],
    },
    {
      label: "2. Romanized Nepali",
      customerMessage: "k xa, haircut kati ho",
      expectedBehavior: "Reply in the same romanized style — never switch to Devanagari script or English.",
      history: [{ direction: "inbound", body: "k xa, haircut kati ho" }],
    },
    {
      label: "3. Repeat customer with seeded memory",
      customerMessage: "hey it's me again, can I get my usual saturday slot?",
      expectedBehavior: "Non-empty, in-voice reply — ideally references what's remembered about this regular.",
      history: [{ direction: "inbound", body: "hey it's me again, can I get my usual saturday slot?" }],
      ai_memory: SEEDED_MEMORY as unknown as Record<string, unknown>,
    },
    {
      label: "4. Frustration escalation",
      customerMessage: "this is the third time i'm asking, let me talk to a real person",
      expectedBehavior: "MUST escalate (needsHuman true) — explicit request for a real person.",
      history: [
        { direction: "inbound", body: "can someone check on my order status" },
        { direction: "outbound", body: "let me look into that for you" },
        { direction: "inbound", body: "this is the third time i'm asking, let me talk to a real person" },
      ],
    },
    {
      label: "5. Ambiguous message",
      customerMessage: "hmm not totally sure, maybe the other thing we talked about?",
      expectedBehavior: "MUST NOT escalate (needsHuman false) — mere uncertainty/ambiguity is never a trigger.",
      history: [{ direction: "inbound", body: "hmm not totally sure, maybe the other thing we talked about?" }],
    },
    {
      label: "6. Are you a bot?",
      customerMessage: "wait are you a bot?",
      expectedBehavior: "Log only — no hard assertion either way.",
      history: [{ direction: "inbound", body: "wait are you a bot?" }],
    },
  ]

  return cases.map((entry) => {
    const conversation = buildConversation({ ai_memory: entry.ai_memory ?? null })
    const messages = buildMessages(conversation.id, entry.history)
    return { label: entry.label, customerMessage: entry.customerMessage, expectedBehavior: entry.expectedBehavior, conversation, messages }
  })
}

// ---------------------------------------------------------------------------
// Judge — one call grading all 6 transcripts against a compact rubric.
// ---------------------------------------------------------------------------

interface Transcript {
  label: string
  expectedBehavior: string
  customerMessage: string
  reply: string
  needsHuman: boolean
}

const JUDGE_DIMENSIONS = [
  "persona_adherence",
  "no_assistant_speak",
  "language_mirroring",
  "escalation_correctness",
  "no_repeated_openers",
] as const

type JudgeDimension = (typeof JUDGE_DIMENSIONS)[number];
type JudgeScorecard = Record<JudgeDimension, number> & { notes: string }

function buildJudgeSystemPrompt(): string {
  return [
    "You grade a local business's AI FrontDesk assistant's replies against a fixed rubric, scoring the SET of transcripts as a whole (not each one individually).",
    "persona_adherence (1-5): do the replies read like a real shop owner texting back between customers — warm, casual, in character — rather than a generic assistant?",
    "no_assistant_speak (1-5): do the replies avoid corporate/assistant stock phrases (\"I'd be happy to assist\", \"As an AI\", \"feel free to reach out\", \"Is there anything else\") and em dashes/semicolons/bullet lists?",
    "language_mirroring (1-5): does each reply match the customer's own language and script (English stays English; the romanized-Nepali message gets a romanized-style reply, never native Devanagari script, never translated to English)?",
    "escalation_correctness (1-5): did needsHuman fire exactly when it should have — true for the explicit \"let me talk to a real person\" case, false for the merely ambiguous case — and nowhere else in this set?",
    "no_repeated_openers (1-5): do the replies vary their opening words/structure rather than all starting the same way?",
    "Score each dimension 1 (fails badly) to 5 (excellent). Be honest and critical — this is a regression check, not a courtesy score.",
    'Respond with ONLY strict JSON, no markdown code fences, no commentary before or after — exactly this shape: {"persona_adherence": number, "no_assistant_speak": number, "language_mirroring": number, "escalation_correctness": number, "no_repeated_openers": number, "notes": string (1-2 sentences on anything notably good or bad)}',
  ].join(" ")
}

function buildJudgeInstructionMessage(transcripts: Transcript[]): ChatMessage {
  const blocks = transcripts.map(
    (transcript, index) =>
      `[${index + 1}] ${transcript.label}\nExpected: ${transcript.expectedBehavior}\nCustomer: "${transcript.customerMessage}"\nAI reply: "${transcript.reply}"\nneedsHuman: ${transcript.needsHuman}`
  )

  return {
    role: "user",
    content: ["Grade this set of 6 transcripts per the rubric above.", ...blocks].join("\n\n"),
  }
}

function parseJudgeScorecard(raw: string): JudgeScorecard | null {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(match[0])
  } catch {
    return null
  }

  if (!parsed || typeof parsed !== "object") return null
  const obj = parsed as Record<string, unknown>

  const scores: Partial<Record<JudgeDimension, number>> = {}
  for (const dimension of JUDGE_DIMENSIONS) {
    const value = obj[dimension]
    if (typeof value !== "number" || !Number.isFinite(value)) return null
    scores[dimension] = value
  }

  const notes = typeof obj.notes === "string" ? obj.notes : ""

  return { ...(scores as Record<JudgeDimension, number>), notes }
}

// ---------------------------------------------------------------------------
// The test
// ---------------------------------------------------------------------------

describe("quality-eval harness — FrontDesk personality/escalation regression tripwire", () => {
  it.skipIf(SKIP_WHEN_UNCONFIGURED)(
    "drafts the 6-case panel through the real pipeline and grades the set >= 3 on every rubric dimension",
    async () => {
      const cases = buildCases()
      const transcripts: Transcript[] = []

      for (const testCase of cases) {
        const result = await draftCustomerReply({
          orgId: REAL_ORG_ID,
          businessBrain: null,
          conversation: testCase.conversation,
          messages: testCase.messages,
          contact: null,
        })

        expect(result).not.toBeNull()
        if (!result) continue

        console.log(`[quality-eval] ${testCase.label}`)
        console.log(`[quality-eval]   customer: ${testCase.customerMessage}`)
        console.log(`[quality-eval]   reply: ${result.reply}`)
        console.log(`[quality-eval]   needsHuman: ${result.needsHuman}${result.reason ? ` (${result.reason})` : ""}`)

        transcripts.push({
          label: testCase.label,
          expectedBehavior: testCase.expectedBehavior,
          customerMessage: testCase.customerMessage,
          reply: result.reply,
          needsHuman: result.needsHuman,
        })

        if (testCase.label.startsWith("2.")) {
          const mirrorsRomanized = !DEVANAGARI_PATTERN.test(result.reply)
          console.log(`[quality-eval]   romanized-style check (no Devanagari): ${mirrorsRomanized}`)
          expect(DEVANAGARI_PATTERN.test(result.reply)).toBe(false)
        }

        if (testCase.label.startsWith("3.")) {
          const mentionsMemory = SEEDED_MEMORY.facts.some((fact) =>
            fact
              .toLowerCase()
              .split(/\s+/)
              .some((word) => word.length > 3 && result.reply.toLowerCase().includes(word))
          )
          console.log(`[quality-eval]   appears to reference seeded memory: ${mentionsMemory}`)
          expect(result.reply.trim().length).toBeGreaterThan(0)
        }

        if (testCase.label.startsWith("4.")) {
          expect(result.needsHuman).toBe(true)
        }

        if (testCase.label.startsWith("5.")) {
          expect(result.needsHuman).toBe(false)
        }
      }

      expect(transcripts.length).toBe(cases.length)

      const judgeMessages: ChatMessage[] = [
        { role: "system", content: buildJudgeSystemPrompt() },
        buildJudgeInstructionMessage(transcripts),
      ]

      const judgeResult = await runTextJob({
        orgId: REAL_ORG_ID,
        job: "reasoning",
        messages: judgeMessages,
        maxTokens: 400,
        temperature: 0.2,
      })

      const scorecard = parseJudgeScorecard(judgeResult.text)
      expect(scorecard).not.toBeNull()
      if (!scorecard) return

      console.log("[quality-eval] scorecard:", JSON.stringify(scorecard, null, 2))

      for (const dimension of JUDGE_DIMENSIONS) {
        expect(scorecard[dimension], `${dimension} scored ${scorecard[dimension]} (floor is 3): ${scorecard.notes}`).toBeGreaterThanOrEqual(3)
      }
    },
    120000
  )
})
