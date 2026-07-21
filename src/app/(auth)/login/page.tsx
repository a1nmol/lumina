import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { isSupabaseConfigured } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"

import { LoginForm } from "./login-form"

export const metadata: Metadata = { title: "Sign in" }

export default async function LoginPage() {
  const configured = isSupabaseConfigured()

  // Signed-in users landing on /login (e.g. a stale bookmark, or clicking
  // back after signing in) should go straight to the app rather than see
  // the sign-in form again.
  if (configured) {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      redirect("/dashboard")
    }
  }

  return <LoginForm configured={configured} />
}
