import "server-only"

// Standing orders (Outlast wave 3, Part A) — persistent owner instructions
// the AI weaves into every reply while active: "I'm at a wedding till
// Sunday — tell people I'll be slow", "registrations are closed, stop
// taking signups". Unlike a whisper (src/lib/ai/frontdesk-reply.ts's
// draftWhisperMessage — one-shot, one thread), these are org-wide and
// expire on their own via `expires_at` (null = no expiry). See
// supabase/migrations/0019_standing_orders_followups.sql for the table +
// RLS policy, and src/app/(app)/settings/standing-orders-card.tsx +
// standing-orders-actions.ts for the owner-facing CRUD surface.
//
// This module is the READ side consumed by the reply-drafting prompts
// (src/lib/ai/frontdesk-reply.ts's buildSystemPrompt/draftCustomerReply/
// draftWhisperMessage and src/lib/ai/reply-assist.ts's suggestReplies) and
// by src/lib/follow-ups.ts's "[no-followups]" opt-out check. Uses the
// service-role admin client (not the RLS-scoped server client) because
// draftCustomerReply itself runs from unauthenticated webhook routes
// (Instagram, Twilio SMS, missed-call) with no user session — mirrors
// src/lib/ai/style-examples.ts's fetchStyleExamples, which fetches from the
// exact same call sites for the exact same reason.

import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin"
import type { StandingOrder } from "@/lib/types"

/** Server-enforced cap on ACTIVE standing orders per org (src/app/(app)/settings/standing-orders-actions.ts's addStandingOrder rejects past this) — also the fetch limit here, so the prompt never carries more than this many. */
export const MAX_ACTIVE_STANDING_ORDERS = 5

/** Each instruction is truncated to this many characters when rendered into a prompt (the DB row itself has no length cap — the settings card caps new drafts to the same 300 chars, but this defends against any other write path too). */
const MAX_INSTRUCTION_PROMPT_CHARS = 300

// ---------------------------------------------------------------------------
// Pure decision logic — no I/O, unit-tested directly (standing-orders.test.ts).
// ---------------------------------------------------------------------------

/**
 * True iff a standing order is currently in force: `active` is true AND
 * either it has no expiry or its expiry is strictly after `now`. Exported so
 * both fetchActiveStandingOrders (a defense-in-depth re-check against clock
 * skew between this query's `now` and the DB's own NOW()) and its own unit
 * tests can exercise the exact same logic the SQL filter below expresses.
 */
export function isActiveOrder(order: Pick<StandingOrder, "active" | "expires_at">, now: Date): boolean {
  if (!order.active) return false
  if (!order.expires_at) return true
  return new Date(order.expires_at).getTime() > now.getTime()
}

/**
 * Renders active standing orders into the compact prompt block injected
 * right after the identity block (owner directives outrank style rules) in
 * every reply-drafting prompt. Plain prompt text, deliberately unescaped —
 * these are the owner's own words, meant to be followed literally, not
 * user-generated content being displayed back to them. Each instruction is
 * truncated to MAX_INSTRUCTION_PROMPT_CHARS. Pure, no I/O. Returns "" when
 * there's nothing to render.
 */
export function renderStandingOrdersBlock(orders: Pick<StandingOrder, "instruction">[]): string {
  if (orders.length === 0) return ""

  const numbered = orders
    .map((order, index) => `${index + 1}) ${order.instruction.trim().slice(0, MAX_INSTRUCTION_PROMPT_CHARS)}`)
    .join(" ")

  return `The owner's current standing instructions (follow while active): ${numbered}`
}

// ---------------------------------------------------------------------------
// I/O — the only function in this module that touches Supabase.
// ---------------------------------------------------------------------------

/**
 * Fetches an org's active standing orders (active=true AND (expires_at null
 * OR > now)), newest first, capped to MAX_ACTIVE_STANDING_ORDERS. Returns []
 * (never throws) when Supabase isn't configured or the query fails — this is
 * prompt guidance, never a blocker for drafting a reply, mirroring
 * fetchStyleExamples's contract exactly.
 */
export async function fetchActiveStandingOrders(orgId: string, now: Date = new Date()): Promise<StandingOrder[]> {
  if (!isSupabaseConfigured()) return []

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("standing_orders")
      .select()
      .eq("org_id", orgId)
      .eq("active", true)
      .or(`expires_at.is.null,expires_at.gt.${now.toISOString()}`)
      .order("created_at", { ascending: false })
      .limit(MAX_ACTIVE_STANDING_ORDERS)

    if (error || !data) return []

    // Defense-in-depth: re-check with the pure predicate above in case of
    // clock skew between this call's `now` and the DB's own NOW().
    return data.filter((order) => isActiveOrder(order, now))
  } catch (error) {
    console.error("[standing-orders] failed to fetch active standing orders", error)
    return []
  }
}
