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

import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin"

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
