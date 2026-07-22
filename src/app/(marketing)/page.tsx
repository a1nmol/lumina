import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { isSupabaseConfigured } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"

import { DayStrip } from "@/components/marketing/day-strip"
import { FaqSigns } from "@/components/marketing/faq-signs"
import { FinalCta } from "@/components/marketing/final-cta"
import { Hero } from "@/components/marketing/hero"
import { Lamps } from "@/components/marketing/lamps"
import { LoopBoard } from "@/components/marketing/loop-board"
import { OutcomeCards } from "@/components/marketing/outcome-cards"
import { PilotMenu } from "@/components/marketing/pilot-menu"
import { Problem } from "@/components/marketing/problem"
import { ShopPicker } from "@/components/marketing/shop-picker"
import { ShopWindows } from "@/components/marketing/shop-windows"
import { TrustBar } from "@/components/marketing/trust-bar"

export const metadata: Metadata = {
  title: "The shop that never closes",
  description:
    "LocalOS writes your posts, answers your customers, and books your jobs — even at 9pm, even while you sleep.",
}

/**
 * The public marketing homepage. This is the literal "/" route (route
 * groups don't add a path segment) — there is deliberately no
 * src/app/page.tsx anymore, since two files can't both resolve to "/". See
 * the Gate 2 build report for why this structure (vs. a root page.tsx that
 * imports a composed <LandingPage/>) was chosen: it lets (marketing)/
 * layout.tsx's nav + footer wrap this page for free, and keeps the
 * authenticated-redirect logic co-located with the route it protects,
 * matching the existing (auth)/login/page.tsx pattern.
 *
 * Routing: signed-in users (when Supabase is configured) are redirected to
 * /dashboard. Everyone else — signed-out visitors, and every visitor at all
 * when Supabase isn't configured (demo mode) — sees the landing page below.
 */
export default async function MarketingHomePage() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      redirect("/dashboard")
    }
  }

  return (
    <>
      <Hero />
      <TrustBar />
      <Problem />
      <Lamps />
      <DayStrip />
      <LoopBoard />
      <OutcomeCards />
      <ShopPicker />
      <ShopWindows />
      <PilotMenu />
      <FaqSigns />
      <FinalCta />
    </>
  )
}
