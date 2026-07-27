import type { Metadata } from "next"

import { PageHeader } from "@/components/page-header"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"

import { AccountForms } from "./account-forms"

export const metadata: Metadata = { title: "My account" }

/**
 * Personal account settings — the user layer, deliberately separate from
 * the business layer (/settings "Settings & Brain"). Reached from the
 * sidebar user menu. Server component fetches the current identity;
 * everything interactive lives in the client cards.
 */
export default async function AccountPage() {
  const configured = isSupabaseConfigured()
  let email = "demo@lumina.app"
  let fullName = ""

  if (configured) {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      email = user.email ?? email
      const metaName = user.user_metadata?.full_name
      fullName = typeof metaName === "string" ? metaName : ""
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        title="My account"
        description="Your personal sign-in details. Business settings live in Settings & Brain."
      />
      <AccountForms configured={configured} email={email} initialFullName={fullName} />
    </div>
  )
}
