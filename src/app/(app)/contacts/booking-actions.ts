"use server"

// Server actions for the Booking MVP dialog (src/components/booking-dialog.tsx).
// Demo-safe pattern (matches src/app/(app)/contacts/actions.ts): every
// action falls back to fabricated data when Supabase isn't configured.
//
// No external calendar sync yet — TODO(V2): push/pull to a connected
// calendar (Google Calendar / etc.) once that needs real API keys and a
// Business Brain connection exists. For now this only reads/writes the
// `appointments` table.

import { randomUUID } from "node:crypto"

import { APPOINTMENT_STATUSES } from "@/components/inbox/status-pill"
import { recordAnalyticsEvent } from "@/lib/analytics"
import { createAppointment, updateAppointmentStatus } from "@/lib/frontdesk"
import { DEMO_ORG } from "@/lib/demo"
import { getCurrentOrgId } from "@/lib/org"
import { createClient } from "@/lib/supabase/server"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import type { Appointment, AppointmentStatus } from "@/lib/types"

const MAX_SERVICE_LENGTH = 120
const MAX_NOTES_LENGTH = 2000
// Booking a slot more than this far in the past is rejected outright — a
// small grace window absorbs client/server clock drift around "now".
const PAST_START_GRACE_MS = 5 * 60_000

export interface CreateAppointmentActionInput {
  contactId: string
  service: string
  /** ISO timestamp. */
  startsAt: string
  /** ISO timestamp. */
  endsAt?: string | null
  notes?: string | null
}

export interface CreateAppointmentActionResult {
  ok: boolean
  appointment: Appointment | null
}

function isValidCreateInput(input: CreateAppointmentActionInput): boolean {
  if (typeof input.contactId !== "string" || input.contactId.length === 0) return false
  if (typeof input.service !== "string" || input.service.trim().length === 0 || input.service.length > MAX_SERVICE_LENGTH)
    return false

  const startsAtMs = new Date(input.startsAt).getTime()
  if (Number.isNaN(startsAtMs)) return false
  if (startsAtMs < Date.now() - PAST_START_GRACE_MS) return false

  if (input.endsAt != null) {
    const endsAtMs = new Date(input.endsAt).getTime()
    if (Number.isNaN(endsAtMs)) return false
    if (endsAtMs <= startsAtMs) return false
  }

  if (input.notes != null && input.notes.length > MAX_NOTES_LENGTH) return false
  return true
}

/** Books a new appointment. Demo mode fabricates one locally; configured mode persists via createAppointment. */
export async function createAppointmentAction(
  input: CreateAppointmentActionInput
): Promise<CreateAppointmentActionResult> {
  if (!isValidCreateInput(input)) return { ok: false, appointment: null }

  if (!isSupabaseConfigured()) {
    const now = new Date().toISOString()
    const appointment: Appointment = {
      id: `demo-appointment-${randomUUID()}`,
      org_id: DEMO_ORG.id,
      contact_id: input.contactId,
      starts_at: input.startsAt,
      ends_at: input.endsAt ?? null,
      service: input.service,
      status: "scheduled",
      notes: input.notes ?? null,
      created_at: now,
      updated_at: now,
    }
    return { ok: true, appointment }
  }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: false, appointment: null }

  try {
    // Cross-org guard: the contactId comes from the client, so confirm it
    // actually belongs to the caller's org before ever inserting an
    // appointment against it.
    const supabase = await createClient()
    const { data: existingContact } = await supabase
      .from("contacts")
      .select("id")
      .eq("id", input.contactId)
      .eq("org_id", orgId)
      .maybeSingle()
    if (!existingContact) return { ok: false, appointment: null }

    const appointment = await createAppointment(orgId, {
      contactId: input.contactId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      service: input.service,
      notes: input.notes,
    })

    if (appointment) {
      // Best-effort — recordAnalyticsEvent uses the service-role admin
      // client internally (analytics_events is service-role-insert-only),
      // so this is correct to call from an RLS-scoped server action. Never
      // fail the booking over an analytics-recording error.
      try {
        await recordAnalyticsEvent(orgId, {
          kind: "booking_created",
          contactId: input.contactId,
          metadata: { service: input.service },
        })
      } catch (analyticsError) {
        console.error("[booking-actions] failed to record booking_created event", analyticsError)
      }
    }

    return { ok: appointment !== null, appointment }
  } catch {
    return { ok: false, appointment: null }
  }
}

export interface UpdateAppointmentStatusResult {
  ok: boolean
}

/** Changes an appointment's status. Demo-safe no-op (optimistic UI carries the change) when unconfigured. */
export async function updateAppointmentStatusAction(
  appointmentId: string,
  status: AppointmentStatus
): Promise<UpdateAppointmentStatusResult> {
  if (typeof appointmentId !== "string" || appointmentId.length === 0) return { ok: false }
  if (!APPOINTMENT_STATUSES.includes(status)) return { ok: false }

  if (!isSupabaseConfigured()) return { ok: true }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: false }

  try {
    const updated = await updateAppointmentStatus(orgId, appointmentId, status)
    return { ok: updated !== null }
  } catch {
    return { ok: false }
  }
}
