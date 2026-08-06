import type { ReactNode } from "react"
import { Info } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { isSupabaseConfigured } from "@/lib/supabase/config"

import { SettingsMobileNav, SettingsSubNav } from "./settings-sub-nav"

/**
 * Settings hub shell (redesign R2) — a Linear/Vercel-style two-column
 * layout: a compact sub-nav (5 categories, see ./settings-sub-nav.tsx) next
 * to whichever category page is active. Wraps every /settings/* route
 * except the deep AI Receptionist config at /settings/voice, which keeps
 * its own full-width page (it's a config surface in its own right, not a
 * settings category card-stack) — Next.js layout nesting still applies to
 * it since it's a child segment, and that's fine: the sub-nav simply shows
 * "Channels & phone" as active while /settings/voice's own content fills
 * the right column at whatever width its cards want.
 *
 * The one demo-mode Alert here replaces the old per-card "Demo mode —
 * changes aren't saved." toast scatter with a single up-front notice; the
 * per-card toasts still fire on every save (kept for this wave — see the
 * redesign brief) so an edit always gets its own explicit confirmation too.
 */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col gap-6">
      {!isSupabaseConfigured() && (
        <Alert className="rounded-2xl shadow-raised ring-1 ring-border/40">
          <Info aria-hidden="true" />
          <AlertTitle>Demo mode</AlertTitle>
          <AlertDescription>
            Supabase isn&apos;t connected yet, so changes on these pages update the page only — nothing is saved.
          </AlertDescription>
        </Alert>
      )}

      <SettingsMobileNav />

      <div className="flex flex-1 flex-col gap-8 lg:flex-row">
        <SettingsSubNav />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  )
}
