import { redirect } from "next/navigation"

import { isSupabaseConfigured } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"

export default async function RootPage() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    redirect(user ? "/dashboard" : "/login")
  }

  // Demo mode — Supabase isn't configured, so the app is fully open.
  redirect("/dashboard")
}
