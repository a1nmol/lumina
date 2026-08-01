"use server"

// Server actions for Contacts/CRM. Demo-safe pattern (matches
// src/app/(app)/studio/actions.ts): every action falls back to
// src/lib/demo.ts data when Supabase isn't configured, so the client
// components never need to branch on config state themselves.
//
// saveContactAction is used for both create (Add contact dialog, all fields
// supplied) and partial update (quick-view drawer's tags/notes editors,
// which only ever send the field(s) that changed). In demo mode we can only
// safely fabricate a brand-new Contact on create — fabricating one on
// update would clobber any field the caller didn't pass, so update returns
// `{ ok: true, contact: null }` and callers apply their own optimistic
// merge (see contacts-view.tsx / contact-drawer.tsx).

import { randomUUID } from "node:crypto"

import {
  getContactWithTimeline,
  listContacts,
  updateContactStatus,
  updateContactVip,
  upsertContact,
  type UpsertContactInput,
} from "@/lib/frontdesk"
import { DEMO_APPOINTMENTS, DEMO_CONTACTS, DEMO_CONVERSATIONS, DEMO_ORG } from "@/lib/demo"
import { getCurrentOrgId } from "@/lib/org"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import type { Contact, ContactStatus, ContactTimelineEvent, ContactWithTimeline } from "@/lib/types"

const MAX_TEXT_LENGTH = 2000
const MAX_TAGS = 12
const MAX_TAG_LENGTH = 40
const MAX_PHONE_LENGTH = 40
const MAX_EMAIL_LENGTH = 254
// Loose shape checks — not full E.164/RFC-5322 validation, just enough to
// reject obvious garbage before it reaches the database. Digits, spaces, and
// the common phone punctuation/formatting characters.
const PHONE_PATTERN = /^[0-9+()\-.\s]+$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface ListContactsResult {
  contacts: Contact[]
  isLive: boolean
}

/** Loads the signed-in org's contacts (all of them — search/status filtering happens client-side). */
export async function listContactsAction(): Promise<ListContactsResult> {
  if (!isSupabaseConfigured()) return { contacts: DEMO_CONTACTS, isLive: false }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { contacts: [], isLive: true }

  const contacts = await listContacts(orgId)
  return { contacts, isLive: true }
}

/** Builds the same merged timeline shape as getContactWithTimeline, from demo data. */
function buildDemoTimeline(contactId: string): ContactWithTimeline | null {
  const contact = DEMO_CONTACTS.find((c) => c.id === contactId)
  if (!contact) return null

  const timeline: ContactTimelineEvent[] = []

  for (const conversation of DEMO_CONVERSATIONS) {
    if (conversation.contact_id !== contactId) continue
    for (const message of conversation.messages) {
      timeline.push({
        type: "message",
        at: message.created_at,
        message,
        conversationId: conversation.id,
        channel: conversation.channel,
      })
    }
  }

  for (const appointment of DEMO_APPOINTMENTS) {
    if (appointment.contact_id !== contactId) continue
    timeline.push({ type: "appointment", at: appointment.starts_at, appointment })
  }

  // Mirrors getContactWithTimeline's best-effort "current status" marker.
  if (contact.status !== "lead") {
    timeline.push({ type: "status_change", at: contact.updated_at, status: contact.status })
  }

  timeline.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())

  return { contact, timeline }
}

export interface GetContactResult {
  data: ContactWithTimeline | null
  isLive: boolean
}

/** Loads one contact + its unified activity timeline for the full profile page. */
export async function getContactAction(id: string): Promise<GetContactResult> {
  if (typeof id !== "string" || id.length === 0) return { data: null, isLive: false }

  if (!isSupabaseConfigured()) return { data: buildDemoTimeline(id), isLive: false }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { data: null, isLive: true }

  const data = await getContactWithTimeline(orgId, id)
  return { data, isLive: true }
}

function isValidSaveInput(input: UpsertContactInput): boolean {
  if (input.name != null && input.name.length > MAX_TEXT_LENGTH) return false
  if (input.notes != null && input.notes.length > MAX_TEXT_LENGTH) return false
  if (input.phone != null && input.phone.length > 0) {
    if (input.phone.length > MAX_PHONE_LENGTH || !PHONE_PATTERN.test(input.phone)) return false
  }
  if (input.email != null && input.email.length > 0) {
    if (input.email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(input.email)) return false
  }
  if (input.tags) {
    if (input.tags.length > MAX_TAGS) return false
    if (input.tags.some((tag) => typeof tag !== "string" || tag.length > MAX_TAG_LENGTH)) return false
  }
  return true
}

export interface SaveContactResult {
  ok: boolean
  contact: Contact | null
  /** Set when `ok` is false and the failure was a validation rejection (as opposed to a write/lookup failure). */
  reason?: "invalid-payload"
}

/**
 * Creates a new contact (no `input.id`) or partially updates an existing
 * one. See the module doc above for the demo-mode create-vs-update split.
 */
export async function saveContactAction(input: UpsertContactInput): Promise<SaveContactResult> {
  if (!isValidSaveInput(input)) return { ok: false, contact: null, reason: "invalid-payload" }

  if (!isSupabaseConfigured()) {
    if (input.id) return { ok: true, contact: null }

    const now = new Date().toISOString()
    const contact: Contact = {
      id: `demo-contact-${randomUUID()}`,
      org_id: DEMO_ORG.id,
      name: input.name ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      source: input.source ?? "manual",
      status: input.status ?? "lead",
      tags: input.tags ?? [],
      notes: input.notes ?? null,
      custom: {},
      ai_memory: null,
      is_vip: false,
      created_at: now,
      updated_at: now,
    }
    return { ok: true, contact }
  }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: false, contact: null }

  try {
    const contact = await upsertContact(orgId, input)
    return { ok: contact !== null, contact }
  } catch {
    return { ok: false, contact: null }
  }
}

export interface UpdateStatusResult {
  ok: boolean
}

/** Single-field pipeline status change (quick-view drawer's inline status Select). */
export async function updateStatusAction(id: string, status: ContactStatus): Promise<UpdateStatusResult> {
  if (typeof id !== "string" || id.length === 0) return { ok: false }

  if (!isSupabaseConfigured()) return { ok: true }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: false }

  try {
    const updated = await updateContactStatus(orgId, id, status)
    return { ok: updated !== null }
  } catch {
    return { ok: false }
  }
}

export interface ToggleVipResult {
  ok: boolean
}

/**
 * Toggles a contact's VIP flag (migration 0016 contacts.is_vip — see
 * src/lib/frontdesk.ts#updateContactVip). Called from the VipToggle button
 * wherever a contact's identity renders: the Inbox context pane and the
 * Contacts quick-view drawer. Demo-safe no-op when unconfigured, mirroring
 * updateStatusAction above.
 */
export async function toggleContactVip(id: string, isVip: boolean): Promise<ToggleVipResult> {
  if (typeof id !== "string" || id.length === 0) return { ok: false }

  if (!isSupabaseConfigured()) return { ok: true }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: false }

  try {
    const updated = await updateContactVip(orgId, id, isVip)
    return { ok: updated !== null }
  } catch {
    return { ok: false }
  }
}
