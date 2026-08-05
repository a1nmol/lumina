"use server"

// Server actions for the Settings hub's "Standing orders" card
// (./standing-orders-card.tsx) — persistent owner instructions the
// FrontDesk AI weaves into every reply while active (see
// src/lib/standing-orders.ts for the prompt-injection side of this
// feature, and supabase/migrations/0019_standing_orders_followups.sql for
// the table + RLS policy). RLS-scoped (not the admin client) — every
// read/write here is subject to standing_orders' own-org policy, same
// pattern as src/app/(app)/settings/brain/actions.ts. No-ops in demo mode
// (Supabase unconfigured) so local development never crashes.

import { createClient } from "@/lib/supabase/server"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import { getCurrentOrgId } from "@/lib/org"
import { MAX_ACTIVE_STANDING_ORDERS } from "@/lib/standing-orders"
import type { StandingOrder } from "@/lib/types"

const MAX_INSTRUCTION_LENGTH = 300

export interface ListStandingOrdersResult {
  orders: StandingOrder[]
  /** False in demo mode (Supabase unconfigured) — the card only updates local state. */
  isLive: boolean
}

/**
 * Lists this org's ACTIVE standing orders, newest first. Deactivated orders
 * are never returned here (they're never hard-deleted — see
 * deactivateStandingOrder below — just excluded from every read). Returns
 * an empty list (never throws) in demo mode or on a query failure.
 */
export async function listStandingOrders(): Promise<ListStandingOrdersResult> {
  if (!isSupabaseConfigured()) return { orders: [], isLive: false }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { orders: [], isLive: true }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("standing_orders")
    .select()
    .eq("org_id", orgId)
    .eq("active", true)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[settings/standing-orders-actions] failed to list standing orders", error.message)
    return { orders: [], isLive: true }
  }

  return { orders: data ?? [], isLive: true }
}

export interface AddStandingOrderResult {
  ok: boolean
  order?: StandingOrder
  /** Present when ok is false, so the caller can tailor its toast copy. */
  reason?: "no-org" | "invalid-payload" | "at-cap"
}

/**
 * Adds a new standing order. `expiresAt` is an ISO timestamp or null (no
 * expiry) — the card only ever offers a fixed set of quick-chip durations,
 * never a free-text date, so validation here is deliberately loose (any
 * parseable timestamp). Server-enforced cap: rejects with `"at-cap"` once
 * the org already has MAX_ACTIVE_STANDING_ORDERS active orders — the UI
 * also disables the add affordance at cap, but this is the real gate.
 */
export async function addStandingOrder(instruction: string, expiresAt: string | null): Promise<AddStandingOrderResult> {
  const trimmed = instruction.trim()
  if (!trimmed || trimmed.length > MAX_INSTRUCTION_LENGTH) {
    return { ok: false, reason: "invalid-payload" }
  }
  if (expiresAt !== null && Number.isNaN(new Date(expiresAt).getTime())) {
    return { ok: false, reason: "invalid-payload" }
  }

  if (!isSupabaseConfigured()) return { ok: true }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: false, reason: "no-org" }

  const supabase = await createClient()

  const { data: activeOrders, error: countError } = await supabase
    .from("standing_orders")
    .select("id")
    .eq("org_id", orgId)
    .eq("active", true)

  if (countError) {
    console.error("[settings/standing-orders-actions] failed to check active order count", countError.message)
    return { ok: false, reason: "invalid-payload" }
  }
  if ((activeOrders?.length ?? 0) >= MAX_ACTIVE_STANDING_ORDERS) {
    return { ok: false, reason: "at-cap" }
  }

  const { data, error } = await supabase
    .from("standing_orders")
    .insert({ org_id: orgId, instruction: trimmed, expires_at: expiresAt })
    .select()
    .single()

  if (error || !data) {
    console.error("[settings/standing-orders-actions] failed to add standing order", error?.message)
    return { ok: false, reason: "invalid-payload" }
  }

  return { ok: true, order: data }
}

export interface DeactivateStandingOrderResult {
  ok: boolean
}

/** Deactivates (never hard-deletes) a standing order — sets `active` false. */
export async function deactivateStandingOrder(id: string): Promise<DeactivateStandingOrderResult> {
  if (!isSupabaseConfigured()) return { ok: true }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: true }

  const supabase = await createClient()
  const { error } = await supabase.from("standing_orders").update({ active: false }).eq("id", id).eq("org_id", orgId)

  if (error) {
    console.error("[settings/standing-orders-actions] failed to deactivate standing order", error.message)
    return { ok: false }
  }

  return { ok: true }
}
