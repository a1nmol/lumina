"use server"

// Server action backing the landing page's "pilot menu" early-access form
// (pilot-menu-form.tsx). Demo-safe like every other action in this codebase
// (src/app/(app)/contacts/actions.ts etc.): configured mode inserts into
// early_access_leads via the service-role admin client (see
// supabase/migrations/0007_early_access_leads.sql for why); unconfigured
// (demo) mode just validates and returns success — there's no database to
// write to, and the client already shows the same success state either way.

import { headers } from "next/headers"

import { checkMarketingRateLimit } from "@/lib/marketing/rate-limit"
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin"

const MAX_BUSINESS_NAME_LENGTH = 200
const MAX_EMAIL_LENGTH = 254
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface SaveEarlyAccessLeadResult {
  ok: boolean
  error?: "invalid" | "rate_limited" | "server_error"
}

async function getClientKey(): Promise<string> {
  const headerList = await headers()
  // Standard proxy header chain (Vercel et al.) — first hop is the client.
  const forwardedFor = headerList.get("x-forwarded-for")
  if (forwardedFor) return forwardedFor.split(",")[0]!.trim()
  return headerList.get("x-real-ip") ?? "unknown"
}

function isValidBusinessName(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed.length <= MAX_BUSINESS_NAME_LENGTH
}

function isValidEmail(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(trimmed)
}

export async function saveEarlyAccessLead(
  businessName: string,
  email: string
): Promise<SaveEarlyAccessLeadResult> {
  const trimmedName = typeof businessName === "string" ? businessName.trim() : ""
  const trimmedEmail = typeof email === "string" ? email.trim() : ""

  if (!isValidBusinessName(trimmedName) || !isValidEmail(trimmedEmail)) {
    return { ok: false, error: "invalid" }
  }

  const clientKey = await getClientKey()
  if (!checkMarketingRateLimit(clientKey)) {
    return { ok: false, error: "rate_limited" }
  }

  if (!isSupabaseConfigured()) {
    // Demo mode — nothing to persist, but the form's success state (Wick +
    // receipt toast) is identical either way.
    return { ok: true }
  }

  try {
    const admin = createAdminClient()
    const { error } = await admin
      .from("early_access_leads")
      .insert({ business_name: trimmedName, email: trimmedEmail })

    if (error) {
      console.error("saveEarlyAccessLead: insert failed", error.message)
      return { ok: false, error: "server_error" }
    }

    return { ok: true }
  } catch (error) {
    console.error("saveEarlyAccessLead: unexpected error", error)
    return { ok: false, error: "server_error" }
  }
}
