import "server-only"

// Server-only org bootstrap repair path.
//
// private.handle_new_user() (supabase/migrations/0001_foundation.sql) creates
// a default org + owner membership + entitlements + empty business_brain for
// every new auth.users row. That trigger now swallows its own failures
// (bootstrap must never block signup — see the migration comment), which
// means a user can end up authenticated but orphaned (no org_members row).
//
// ensureOrgBootstrap() repairs that: call it from trusted server code (e.g.
// after sign-in, or at the top of any org-scoped server action/route) using
// the service-role admin client. It mirrors the trigger's logic exactly so
// the two stay equivalent.

import { randomUUID } from "node:crypto"
import { cache } from "react"

import { prettifyPlanId } from "@/lib/entitlements"
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/** Shared org_members lookup used by both getCurrentOrgId and getOrgSidebarContext, given an already-created client + user id (avoids a redundant auth.getUser() round trip when the caller already has one). */
async function lookupOrgIdForUser(supabase: SupabaseServerClient, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle()

  return data?.org_id ?? null
}

/**
 * The signed-in user's first org, via org_members. Null if unauthenticated,
 * orphaned, or Supabase isn't configured (demo mode).
 *
 * The single shared implementation of the "which org is this request for"
 * lookup — every org-scoped server action should import this rather than
 * redefining it locally (see src/app/(app)/settings/brain/actions.ts for the
 * original call site this was extracted from).
 */
export async function getCurrentOrgId(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  return lookupOrgIdForUser(supabase, user.id)
}

export interface OrgSidebarContext {
  orgId: string
  orgName: string
  orgSlug: string
  /** Friendly plan label — real plans.name when available, else prettifyPlanId(plan_id). */
  planName: string
  userEmail: string
  /** user_metadata.full_name when set — null falls back to an email-derived name in the UI. */
  userName: string | null
}

/**
 * Everything the app shell (sidebar business switcher/footer + Command
 * Center greeting) needs about the signed-in user's org, in one place.
 * Null when Supabase isn't configured (demo mode — callers fall back to
 * DEMO_ORG constants) or when the request is unauthenticated/orphaned (no
 * org yet — src/proxy.ts route protection should prevent the former; the
 * app layout's ensureOrgBootstrap call prevents the latter for real users).
 *
 * Wrapped in React's `cache()` so the layout and any page rendered under it
 * (e.g. the dashboard) share one fetch per request instead of duplicating
 * the auth + org + entitlements round trips.
 */
export const getOrgSidebarContext = cache(async (): Promise<OrgSidebarContext | null> => {
  if (!isSupabaseConfigured()) return null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const orgId = await lookupOrgIdForUser(supabase, user.id)
  if (!orgId) return null

  const [{ data: org }, { data: entitlements }] = await Promise.all([
    supabase.from("orgs").select("name, slug").eq("id", orgId).maybeSingle(),
    supabase.from("entitlements").select("plan_id").eq("org_id", orgId).maybeSingle(),
  ])

  const planId = entitlements?.plan_id ?? "free_test"
  const { data: plan } = await supabase.from("plans").select("name").eq("id", planId).maybeSingle()

  return {
    orgId,
    orgName: org?.name ?? "My Business",
    orgSlug: org?.slug ?? "",
    planName: plan?.name ?? prettifyPlanId(planId),
    userEmail: user.email ?? "",
    userName:
      typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim() !== ""
        ? user.user_metadata.full_name
        : null,
  }
})

export interface OrgBootstrapResult {
  orgId: string
  /** True if this call created the org; false if one already existed. */
  created: boolean
}

const MAX_SLUG_ATTEMPTS = 3

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505"
}

/**
 * Ensures the given user has at least one org. If they already belong to an
 * org, this is a cheap read and no-op. Otherwise it creates a default org +
 * owner membership + entitlements + empty business_brain, mirroring
 * private.handle_new_user() in the migration.
 *
 * No-ops (returns null) in demo mode when Supabase isn't configured, so
 * local development without a database never crashes.
 *
 * NOTE: like the SQL trigger, slug allocation here is check-then-insert
 * across the "does the user already have an org" read and the org creation
 * writes below, so two concurrent calls for the same brand-new user could
 * each create their own org. Acceptable at current (invite-only test)
 * scale; would need an advisory lock or a unique constraint on
 * org_members(user_id) for "first org" semantics if this becomes a problem.
 */
export async function ensureOrgBootstrap(
  userId: string,
  email: string | null
): Promise<OrgBootstrapResult | null> {
  if (!isSupabaseConfigured()) return null

  const supabase = createAdminClient()

  const { data: existingMembership, error: membershipError } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle()

  if (membershipError) {
    throw new Error(
      `ensureOrgBootstrap: failed to check membership for user ${userId}: ${membershipError.message}`
    )
  }

  if (existingMembership) {
    return { orgId: existingMembership.org_id, created: false }
  }

  const localPart = email?.split("@")[0] ?? "business"
  const baseSlug = slugify(localPart) || "business"
  const displayName = localPart || "My Business"

  let orgId: string | null = null

  for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt++) {
    const candidateSlug =
      attempt === 1
        ? baseSlug
        : attempt === 2
          ? `${baseSlug}-${randomUUID().replace(/-/g, "").slice(0, 6)}`
          : // Final attempt: a fresh random uuid fragment, effectively
            // guaranteed unique (mirrors the trigger's own-uuid fallback).
            `${baseSlug}-${randomUUID().replace(/-/g, "").slice(0, 8)}`

    const { data: org, error } = await supabase
      .from("orgs")
      .insert({ name: displayName, slug: candidateSlug })
      .select("id")
      .single()

    if (!error && org) {
      orgId = org.id
      break
    }

    if (error && !isUniqueViolation(error)) {
      throw new Error(`ensureOrgBootstrap: failed to create org for user ${userId}: ${error.message}`)
    }
  }

  if (!orgId) {
    throw new Error(
      `ensureOrgBootstrap: could not allocate a unique org slug for user ${userId} after ${MAX_SLUG_ATTEMPTS} attempts`
    )
  }

  const { error: memberError } = await supabase
    .from("org_members")
    .insert({ org_id: orgId, user_id: userId, role: "owner" })

  if (memberError && !isUniqueViolation(memberError)) {
    throw new Error(`ensureOrgBootstrap: failed to create membership for user ${userId}: ${memberError.message}`)
  }

  const { error: entitlementsError } = await supabase
    .from("entitlements")
    .insert({ org_id: orgId, plan_id: "free_test" })

  if (entitlementsError && !isUniqueViolation(entitlementsError)) {
    throw new Error(
      `ensureOrgBootstrap: failed to create entitlements for org ${orgId}: ${entitlementsError.message}`
    )
  }

  const { error: brainError } = await supabase
    .from("business_brain")
    .insert({ org_id: orgId, business_name: displayName })

  if (brainError && !isUniqueViolation(brainError)) {
    throw new Error(`ensureOrgBootstrap: failed to create business_brain for org ${orgId}: ${brainError.message}`)
  }

  return { orgId, created: true }
}
