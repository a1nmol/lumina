import "server-only"

// Org-scoped Unified Inbox + FrontDesk + CRM persistence
// (supabase/migrations/0003_frontdesk.sql). Uses the RLS-scoped server
// client (not the admin client) — every read/write here is subject to the
// contacts/conversations/messages/appointments RLS policies, which already
// restrict rows to the caller's org membership. orgId is still threaded
// through explicitly (matching src/lib/content.ts and src/lib/usage.ts)
// both for defense-in-depth filtering and because several columns are NOT
// NULL with no default.
//
// Demo-safe: every function returns null/[] when Supabase isn't configured,
// so server actions can call these unconditionally and fall back to demo
// data (src/lib/demo.ts) exactly like src/app/(app)/studio/actions.ts does
// for Content Studio.
//
// Deliberately avoids PostgREST embedded-resource selects (e.g.
// `.select("*, contact:contacts(*)")`) to match this codebase's existing
// convention (see the Database type's Relationships comment in
// src/lib/types.ts) — joins are done with a second query + an in-memory
// merge instead.

import { createClient } from "@/lib/supabase/server"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import type {
  Appointment,
  AppointmentStatus,
  Contact,
  ContactSource,
  ContactStatus,
  ContactTimelineEvent,
  ContactWithTimeline,
  Conversation,
  ConversationAiMode,
  ConversationAiState,
  ConversationChannel,
  ConversationDetail,
  ConversationStatus,
  ConversationWithContact,
  Message,
  MessageDirection,
  MessageKind,
} from "@/lib/types"

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export interface ListConversationsFilter {
  status?: ConversationStatus
  channel?: ConversationChannel
  aiState?: ConversationAiState
  unreadOnly?: boolean
}

function toConversationWithContact(
  conversation: Conversation,
  contact: Pick<Contact, "name" | "phone" | "email" | "is_vip"> | undefined
): ConversationWithContact {
  return {
    ...conversation,
    contact_name: contact?.name ?? null,
    contact_phone: contact?.phone ?? null,
    contact_email: contact?.email ?? null,
    contact_is_vip: contact?.is_vip ?? false,
  }
}

/** Lists an org's conversations, most recently active first, joined with a few contact fields for the thread list. */
export async function listConversations(
  orgId: string,
  filter?: ListConversationsFilter
): Promise<ConversationWithContact[]> {
  if (!isSupabaseConfigured()) return []

  const supabase = await createClient()
  let query = supabase.from("conversations").select().eq("org_id", orgId)

  if (filter?.status) query = query.eq("status", filter.status)
  if (filter?.channel) query = query.eq("channel", filter.channel)
  if (filter?.aiState) query = query.eq("ai_state", filter.aiState)
  if (filter?.unreadOnly) query = query.eq("unread", true)

  const { data: conversations, error } = await query.order("last_message_at", {
    ascending: false,
    nullsFirst: false,
  })

  if (error) {
    throw new Error(`listConversations: failed to load conversations for org ${orgId}: ${error.message}`)
  }
  if (!conversations || conversations.length === 0) return []

  const contactIds = Array.from(new Set(conversations.map((conversation) => conversation.contact_id)))

  const { data: contacts, error: contactsError } = await supabase
    .from("contacts")
    .select("id, name, phone, email, is_vip")
    .eq("org_id", orgId)
    .in("id", contactIds)

  if (contactsError) {
    throw new Error(`listConversations: failed to load contacts for org ${orgId}: ${contactsError.message}`)
  }

  const contactById = new Map((contacts ?? []).map((contact) => [contact.id, contact]))

  return conversations.map((conversation) =>
    toConversationWithContact(conversation, contactById.get(conversation.contact_id))
  )
}

/** Loads one conversation (RLS-scoped) with its full message history + contact, for the detail pane. */
export async function getConversation(orgId: string, conversationId: string): Promise<ConversationDetail | null> {
  if (!isSupabaseConfigured()) return null

  const supabase = await createClient()
  const { data: conversation, error } = await supabase
    .from("conversations")
    .select()
    .eq("id", conversationId)
    .eq("org_id", orgId)
    .maybeSingle()

  if (error) {
    throw new Error(`getConversation: failed to load conversation ${conversationId}: ${error.message}`)
  }
  if (!conversation) return null

  const [messagesResult, contactResult] = await Promise.all([
    supabase
      .from("messages")
      .select()
      .eq("org_id", orgId)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true }),
    supabase.from("contacts").select().eq("org_id", orgId).eq("id", conversation.contact_id).maybeSingle(),
  ])

  if (messagesResult.error) {
    throw new Error(
      `getConversation: failed to load messages for conversation ${conversationId}: ${messagesResult.error.message}`
    )
  }
  if (contactResult.error) {
    throw new Error(
      `getConversation: failed to load contact for conversation ${conversationId}: ${contactResult.error.message}`
    )
  }

  const contact = contactResult.data

  return {
    ...toConversationWithContact(conversation, contact ?? undefined),
    messages: messagesResult.data ?? [],
    contact: contact ?? null,
  }
}

export interface SendMessageInput {
  body: string
  kind?: MessageKind
  aiHandled?: boolean
  /**
   * Defaults to "outbound" — this helper is for the business/AI side of a
   * conversation replying. Inbound customer messages arrive via channel
   * webhooks (Phase 2 connections, see docs/backend-notes.md) inserted with
   * the service-role admin client, which bypasses RLS entirely and doesn't
   * need this helper.
   */
  direction?: MessageDirection
  model?: string | null
  costUsd?: number
}

/**
 * Inserts a new message on a conversation and bumps the conversation's
 * `last_message_at`. Sending a real (non-note) message also reopens the
 * thread (`status: "open"`) and marks it read — replying is how an owner
 * (or the AI) clears a thread from their attention, mirroring standard
 * inbox UX. Internal notes never change status/unread.
 */
export async function sendMessage(
  orgId: string,
  conversationId: string,
  input: SendMessageInput
): Promise<Message | null> {
  if (!isSupabaseConfigured()) return null

  const supabase = await createClient()
  const kind: MessageKind = input.kind ?? "message"
  const direction: MessageDirection = input.direction ?? "outbound"

  const { data: message, error } = await supabase
    .from("messages")
    .insert({
      org_id: orgId,
      conversation_id: conversationId,
      direction,
      kind,
      body: input.body,
      ai_handled: input.aiHandled ?? false,
      model: input.model ?? null,
      cost_usd: input.costUsd ?? 0,
    })
    .select()
    .single()

  if (error) {
    throw new Error(`sendMessage: failed to send message on conversation ${conversationId}: ${error.message}`)
  }

  const conversationUpdate: Partial<Pick<Conversation, "last_message_at" | "status" | "unread">> = {
    last_message_at: message.created_at,
  }
  if (kind !== "note") {
    conversationUpdate.status = "open"
    conversationUpdate.unread = false
  }

  const { error: updateError } = await supabase
    .from("conversations")
    .update(conversationUpdate)
    .eq("id", conversationId)
    .eq("org_id", orgId)

  if (updateError) {
    throw new Error(
      `sendMessage: failed to update conversation ${conversationId} after sending a message: ${updateError.message}`
    )
  }

  return message
}

/** Sets a conversation's status (open/pending/resolved). */
export async function setConversationStatus(
  orgId: string,
  conversationId: string,
  status: ConversationStatus
): Promise<Conversation | null> {
  if (!isSupabaseConfigured()) return null

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("conversations")
    .update({ status })
    .eq("id", conversationId)
    .eq("org_id", orgId)
    .select()
    .maybeSingle()

  if (error) {
    throw new Error(`setConversationStatus: failed to update conversation ${conversationId}: ${error.message}`)
  }

  return data
}

/** Sets a conversation's AI transparency state (ai_answered / ai_draft / escalated / human). */
export async function setAiState(
  orgId: string,
  conversationId: string,
  aiState: ConversationAiState
): Promise<Conversation | null> {
  if (!isSupabaseConfigured()) return null

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("conversations")
    .update({ ai_state: aiState })
    .eq("id", conversationId)
    .eq("org_id", orgId)
    .select()
    .maybeSingle()

  if (error) {
    throw new Error(`setAiState: failed to update conversation ${conversationId}: ${error.message}`)
  }

  return data
}

/**
 * Sets a conversation's per-thread AI autonomy (migration 0011). 'auto' =
 * the AI may send replies on its own; 'off' = the AI still drafts, but only
 * the owner sends — see src/app/api/frontdesk/chat/route.ts and
 * src/app/api/twilio/sms/route.ts for the enforcement side of this contract.
 * Demo-safe no-op when unconfigured.
 */
export async function setConversationAiMode(
  orgId: string,
  conversationId: string,
  aiMode: ConversationAiMode
): Promise<Conversation | null> {
  if (!isSupabaseConfigured()) return null

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("conversations")
    .update({ ai_mode: aiMode })
    .eq("id", conversationId)
    .eq("org_id", orgId)
    .select()
    .maybeSingle()

  if (error) {
    throw new Error(`setConversationAiMode: failed to update conversation ${conversationId}: ${error.message}`)
  }

  return data
}

/** Marks a conversation as read (clears the `unread` flag). Demo-safe no-op when unconfigured. */
export async function markConversationRead(orgId: string, conversationId: string): Promise<Conversation | null> {
  if (!isSupabaseConfigured()) return null

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("conversations")
    .update({ unread: false })
    .eq("id", conversationId)
    .eq("org_id", orgId)
    .select()
    .maybeSingle()

  if (error) {
    throw new Error(`markConversationRead: failed to update conversation ${conversationId}: ${error.message}`)
  }

  return data
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export interface ListContactsFilter {
  search?: string
  status?: ContactStatus
}

/** Escapes ILIKE wildcards in a user-supplied search term before interpolating it into a `.or()` filter string. */
function escapeIlikeTerm(term: string): string {
  return term.replace(/[%_,]/g, (match) => `\\${match}`)
}

/** Lists an org's contacts, most recently created first, with optional free-text search + status filter. */
export async function listContacts(orgId: string, filter?: ListContactsFilter): Promise<Contact[]> {
  if (!isSupabaseConfigured()) return []

  const supabase = await createClient()
  let query = supabase.from("contacts").select().eq("org_id", orgId)

  if (filter?.status) query = query.eq("status", filter.status)

  const term = filter?.search?.trim()
  if (term) {
    const escaped = escapeIlikeTerm(term)
    query = query.or(`name.ilike.%${escaped}%,phone.ilike.%${escaped}%,email.ilike.%${escaped}%`)
  }

  const { data, error } = await query.order("created_at", { ascending: false })

  if (error) {
    throw new Error(`listContacts: failed to load contacts for org ${orgId}: ${error.message}`)
  }

  return data ?? []
}

/**
 * Loads a contact plus its merged, chronological activity timeline: every
 * message across every conversation this contact has ever had, every
 * appointment, and (best-effort, see the inline note) status changes.
 * Timeline assembly happens here in TS rather than in SQL.
 */
export async function getContactWithTimeline(orgId: string, contactId: string): Promise<ContactWithTimeline | null> {
  if (!isSupabaseConfigured()) return null

  const supabase = await createClient()
  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select()
    .eq("id", contactId)
    .eq("org_id", orgId)
    .maybeSingle()

  if (contactError) {
    throw new Error(`getContactWithTimeline: failed to load contact ${contactId}: ${contactError.message}`)
  }
  if (!contact) return null

  const { data: conversations, error: conversationsError } = await supabase
    .from("conversations")
    .select("id, channel")
    .eq("org_id", orgId)
    .eq("contact_id", contactId)

  if (conversationsError) {
    throw new Error(
      `getContactWithTimeline: failed to load conversations for contact ${contactId}: ${conversationsError.message}`
    )
  }

  const conversationIds = (conversations ?? []).map((conversation) => conversation.id)
  const channelByConversationId = new Map(
    (conversations ?? []).map((conversation) => [conversation.id, conversation.channel])
  )

  const [messagesResult, appointmentsResult] = await Promise.all([
    conversationIds.length > 0
      ? supabase
          .from("messages")
          .select()
          .eq("org_id", orgId)
          .in("conversation_id", conversationIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as Message[], error: null }),
    supabase.from("appointments").select().eq("org_id", orgId).eq("contact_id", contactId).order("starts_at", {
      ascending: true,
    }),
  ])

  if (messagesResult.error) {
    throw new Error(
      `getContactWithTimeline: failed to load messages for contact ${contactId}: ${messagesResult.error.message}`
    )
  }
  if (appointmentsResult.error) {
    throw new Error(
      `getContactWithTimeline: failed to load appointments for contact ${contactId}: ${appointmentsResult.error.message}`
    )
  }

  const timeline: ContactTimelineEvent[] = []

  for (const message of messagesResult.data ?? []) {
    timeline.push({
      type: "message",
      at: message.created_at,
      message,
      conversationId: message.conversation_id,
      channel: channelByConversationId.get(message.conversation_id) ?? "web_chat",
    })
  }

  for (const appointment of appointmentsResult.data ?? []) {
    timeline.push({ type: "appointment", at: appointment.starts_at, appointment })
  }

  // There is no dedicated status-history table yet (TODO: add one — e.g.
  // contact_status_events — if audit-quality history is needed). As a
  // best-effort stand-in, surface one "current status" marker using the
  // contact's updated_at, skipped for the default "lead" status (nothing
  // to show for a contact that has never moved in the pipeline). This is
  // NOT a true history of every transition, just the latest state.
  if (contact.status !== "lead") {
    timeline.push({ type: "status_change", at: contact.updated_at, status: contact.status })
  }

  timeline.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())

  return { contact, timeline }
}

export interface UpsertContactInput {
  /** When provided, updates this existing contact; otherwise inserts a new one. */
  id?: string
  name?: string | null
  phone?: string | null
  email?: string | null
  /** Required on insert (ignored on update — a contact's source of origin doesn't change). */
  source?: ContactSource
  status?: ContactStatus
  tags?: string[]
  notes?: string | null
  custom?: Record<string, unknown>
}

/** Creates a new contact, or updates an existing one when `input.id` is supplied. */
export async function upsertContact(orgId: string, input: UpsertContactInput): Promise<Contact | null> {
  if (!isSupabaseConfigured()) return null

  const supabase = await createClient()

  if (input.id) {
    const { data, error } = await supabase
      .from("contacts")
      .update({
        name: input.name,
        phone: input.phone,
        email: input.email,
        status: input.status,
        tags: input.tags,
        notes: input.notes,
        custom: input.custom,
      })
      .eq("id", input.id)
      .eq("org_id", orgId)
      .select()
      .maybeSingle()

    if (error) {
      throw new Error(`upsertContact: failed to update contact ${input.id}: ${error.message}`)
    }

    return data
  }

  if (!input.source) {
    throw new Error("upsertContact: `source` is required when creating a new contact.")
  }

  const { data, error } = await supabase
    .from("contacts")
    .insert({
      org_id: orgId,
      name: input.name ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      source: input.source,
      status: input.status ?? "lead",
      tags: input.tags ?? [],
      notes: input.notes ?? null,
      custom: input.custom ?? {},
    })
    .select()
    .single()

  if (error) {
    throw new Error(`upsertContact: failed to create contact for org ${orgId}: ${error.message}`)
  }

  return data
}

/** Moves a contact to a new pipeline status (lead/contacted/booked/customer). */
export async function updateContactStatus(
  orgId: string,
  contactId: string,
  status: ContactStatus
): Promise<Contact | null> {
  if (!isSupabaseConfigured()) return null

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("contacts")
    .update({ status })
    .eq("id", contactId)
    .eq("org_id", orgId)
    .select()
    .maybeSingle()

  if (error) {
    throw new Error(`updateContactStatus: failed to update contact ${contactId}: ${error.message}`)
  }

  return data
}

/**
 * Sets a contact's VIP flag (Commander update wave B1, migration 0016
 * contacts.is_vip). VIP true means the AI drafts but never auto-sends for
 * this contact on any channel, and the owner gets an instant email alert —
 * see the VIP gate in src/app/api/frontdesk/chat/route.ts,
 * src/app/api/twilio/sms/route.ts, and src/app/api/webhooks/instagram/route.ts,
 * plus src/lib/email.ts#sendVipAlertEmail.
 */
export async function updateContactVip(orgId: string, contactId: string, isVip: boolean): Promise<Contact | null> {
  if (!isSupabaseConfigured()) return null

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("contacts")
    .update({ is_vip: isVip })
    .eq("id", contactId)
    .eq("org_id", orgId)
    .select()
    .maybeSingle()

  if (error) {
    throw new Error(`updateContactVip: failed to update contact ${contactId}: ${error.message}`)
  }

  return data
}

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------

export interface CreateAppointmentInput {
  contactId: string
  startsAt: string
  endsAt?: string | null
  service?: string | null
  status?: AppointmentStatus
  notes?: string | null
}

/**
 * Books a new appointment for a contact (FrontDesk booking — MASTER_PLAN.md
 * §4.D). No external calendar sync yet (Google Calendar / etc. need API
 * keys) — this only writes to the `appointments` table. TODO(V2): push/pull
 * to a connected calendar once Business Brain calendar connections exist.
 */
export async function createAppointment(orgId: string, input: CreateAppointmentInput): Promise<Appointment | null> {
  if (!isSupabaseConfigured()) return null

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("appointments")
    .insert({
      org_id: orgId,
      contact_id: input.contactId,
      starts_at: input.startsAt,
      ends_at: input.endsAt ?? null,
      service: input.service ?? null,
      status: input.status ?? "scheduled",
      notes: input.notes ?? null,
    })
    .select()
    .single()

  if (error) {
    throw new Error(`createAppointment: failed to create appointment for org ${orgId}: ${error.message}`)
  }

  return data
}

/** Updates an appointment's status (scheduled/completed/cancelled/no_show). */
export async function updateAppointmentStatus(
  orgId: string,
  appointmentId: string,
  status: AppointmentStatus
): Promise<Appointment | null> {
  if (!isSupabaseConfigured()) return null

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("appointments")
    .update({ status })
    .eq("id", appointmentId)
    .eq("org_id", orgId)
    .select()
    .maybeSingle()

  if (error) {
    throw new Error(`updateAppointmentStatus: failed to update appointment ${appointmentId}: ${error.message}`)
  }

  return data
}
