"use server"

// Server actions for the Unified Inbox.
//
// Demo-safe throughout, mirroring src/app/(app)/studio/actions.ts: every
// action falls back to DEMO_CONVERSATIONS/DEMO_APPOINTMENTS when Supabase
// isn't configured (or there's no resolvable org), and a real quota denial
// (AllowanceDeniedError) is surfaced as a typed { error: "allowance" } result
// rather than swallowed. draftReply additionally surfaces a needsHuman
// escalation as a typed { error: "needs_human" } result and persists the
// ai_state flip to "escalated" server-side — see the AI transparency rules in
// docs/design-briefs/phase-2-inbox-frontdesk-crm.md.

import { AllowanceDeniedError } from "@/lib/ai/errors"
import { draftCustomerReply } from "@/lib/ai/frontdesk-reply"
import { isOpenRouterConfigured } from "@/lib/ai/openrouter"
import { DEMO_APPOINTMENTS, DEMO_CONVERSATIONS, DEMO_ORG, type DemoConversationDetail } from "@/lib/demo"
import {
  getContactWithTimeline,
  getConversation,
  listConversations,
  sendMessage,
  setAiState,
  setConversationStatus,
  updateContactStatus,
  upsertContact,
} from "@/lib/frontdesk"
import { getCurrentOrgId } from "@/lib/org"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import type {
  Appointment,
  ContactStatus,
  ConversationAiState,
  ConversationStatus,
  ConversationWithContact,
  Message,
  MessageKind,
} from "@/lib/types"

import { getBusinessBrain } from "@/app/(app)/settings/brain/actions"

const DEMO_DRAFT_DELAY_MS = 900
const MAX_BODY_LENGTH = 4000
const MAX_TAG_LENGTH = 32
const GENERIC_DEMO_DRAFT =
  "Thanks so much for reaching out — let me take a look and get back to you shortly with the details!"
const AI_FAILURE_MESSAGE = "I couldn't answer this — flagging for you."

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * A thread-list row's conversation shape. `messages` is optional and only
 * ever populated by demo data (DEMO_CONVERSATIONS already carries full
 * history) — the thread list uses it, when present, to render a real last-
 * message snippet instead of a generic "via <channel>" placeholder, without
 * requiring every conversation's full history to be loaded up front against
 * a real backend.
 */
export type ThreadListConversation = ConversationWithContact & { messages?: Message[] }

/** Everything the Inbox needs on first paint. */
export interface InboxData {
  conversations: ThreadListConversation[]
}

/** Loads this org's conversations (joined with contact fields), falling back to demo data when Supabase isn't configured. */
export async function getInboxData(): Promise<InboxData> {
  if (!isSupabaseConfigured()) {
    return { conversations: DEMO_CONVERSATIONS }
  }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { conversations: [] }

  const conversations = await listConversations(orgId)
  return { conversations }
}

/** A conversation's full detail for the center pane. `pendingAiDraft` only ever comes from demo data. */
export type InboxConversationDetail = DemoConversationDetail

/** Loads one conversation's full message history + contact for the detail pane. */
export async function getConversationDetail(conversationId: string): Promise<InboxConversationDetail | null> {
  if (!isSupabaseConfigured()) {
    return DEMO_CONVERSATIONS.find((conversation) => conversation.id === conversationId) ?? null
  }

  const orgId = await getCurrentOrgId()
  if (!orgId) return null

  return await getConversation(orgId, conversationId)
}

/** Appointments booked for a contact — used by the context pane's "Linked appointments" section. */
export async function getAppointmentsForContact(contactId: string): Promise<Appointment[]> {
  if (!isSupabaseConfigured()) {
    return DEMO_APPOINTMENTS.filter((appointment) => appointment.contact_id === contactId)
  }

  const orgId = await getCurrentOrgId()
  if (!orgId) return []

  const result = await getContactWithTimeline(orgId, contactId)
  if (!result) return []

  return result.timeline
    .filter((event): event is Extract<(typeof result.timeline)[number], { type: "appointment" }> => event.type === "appointment")
    .map((event) => event.appointment)
}

export type DraftReplyResult =
  | { draft: string; model?: string; costUsd?: number }
  | { error: "allowance"; message: string }
  | { error: "needs_human"; message: string }

/**
 * Drafts the next customer reply. Demo mode returns the thread's canned
 * pendingAiDraft (or a generic canned draft) after a short simulated delay.
 * Configured mode calls draftCustomerReply — a needsHuman result (or the
 * model failing to produce a usable draft) flips ai_state to "escalated" and
 * is surfaced as a typed error so the composer can toast + reflect the state
 * change; a spend-guard/quota denial is surfaced distinctly.
 */
export async function draftReply(conversationId: string): Promise<DraftReplyResult> {
  if (!isSupabaseConfigured() || !isOpenRouterConfigured()) {
    await sleep(DEMO_DRAFT_DELAY_MS)
    const demoConversation = DEMO_CONVERSATIONS.find((conversation) => conversation.id === conversationId)
    return { draft: demoConversation?.pendingAiDraft ?? GENERIC_DEMO_DRAFT }
  }

  const orgId = await getCurrentOrgId()
  if (!orgId) {
    await sleep(DEMO_DRAFT_DELAY_MS)
    return { draft: GENERIC_DEMO_DRAFT }
  }

  const conversation = await getConversation(orgId, conversationId)
  if (!conversation) {
    return { error: "needs_human", message: "This conversation could not be found." }
  }

  try {
    const businessBrain = await getBusinessBrain()
    const result = await draftCustomerReply({
      orgId,
      businessBrain,
      conversation,
      messages: conversation.messages,
      contact: conversation.contact,
    })

    if (!result) {
      await setAiState(orgId, conversationId, "escalated")
      return { error: "needs_human", message: AI_FAILURE_MESSAGE }
    }

    if (result.needsHuman) {
      await setAiState(orgId, conversationId, "escalated")
      return { error: "needs_human", message: result.reason ?? AI_FAILURE_MESSAGE }
    }

    return { draft: result.reply, model: result.model, costUsd: result.costUsd }
  } catch (error) {
    if (error instanceof AllowanceDeniedError) {
      return { error: "allowance", message: error.message || "You're out of AI reply quota this month." }
    }
    throw error
  }
}

export interface SendReplyInput {
  conversationId: string
  body: string
  kind: MessageKind
  /** True when this message is being sent verbatim (or edited) from an AI draft. */
  aiHandled?: boolean
  model?: string | null
  costUsd?: number
}

/** Sends a reply or internal note. Demo mode synthesizes a Message for optimistic append; configured mode persists via sendMessage. */
export async function sendReply(input: SendReplyInput): Promise<Message | null> {
  const trimmed = input.body.trim()
  if (!trimmed || trimmed.length > MAX_BODY_LENGTH) {
    throw new Error("sendReply: invalid body")
  }

  if (!isSupabaseConfigured()) {
    return {
      id: `demo-sent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      org_id: DEMO_ORG.id,
      conversation_id: input.conversationId,
      direction: "outbound",
      kind: input.kind,
      body: trimmed,
      ai_handled: input.aiHandled ?? false,
      model: input.model ?? null,
      cost_usd: input.costUsd ?? 0,
      metadata: {},
      created_at: new Date().toISOString(),
    }
  }

  const orgId = await getCurrentOrgId()
  if (!orgId) return null

  return await sendMessage(orgId, input.conversationId, {
    body: trimmed,
    kind: input.kind,
    aiHandled: input.aiHandled,
    model: input.model,
    costUsd: input.costUsd,
  })
}

export interface ActionResult {
  ok: boolean
}

/** Sets a conversation's status (open/pending/resolved). Demo-safe no-op when unconfigured. */
export async function setStatus(conversationId: string, status: ConversationStatus): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: true }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: true }

  try {
    await setConversationStatus(orgId, conversationId, status)
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

/** Sets a conversation's AI transparency state. Demo-safe no-op when unconfigured. */
export async function setState(conversationId: string, aiState: ConversationAiState): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: true }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: true }

  try {
    await setAiState(orgId, conversationId, aiState)
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

/** Moves a contact to a new pipeline status. Demo-safe no-op when unconfigured. */
export async function setContactPipelineStatus(contactId: string, status: ContactStatus): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: true }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: true }

  try {
    await updateContactStatus(orgId, contactId, status)
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

/** Appends a tag to a contact (dedupes, trims to a reasonable length). Demo-safe no-op when unconfigured. */
export async function addContactTag(contactId: string, currentTags: string[], tag: string): Promise<ActionResult> {
  const cleaned = tag.trim().slice(0, MAX_TAG_LENGTH)
  if (!cleaned) return { ok: false }

  const nextTags = Array.from(new Set([...currentTags, cleaned]))

  if (!isSupabaseConfigured()) return { ok: true }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: true }

  try {
    await upsertContact(orgId, { id: contactId, tags: nextTags })
    return { ok: true }
  } catch {
    return { ok: false }
  }
}
