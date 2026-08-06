import type { ReactNode } from "react"

import { CommandPaletteProvider } from "@/components/command-palette"
import { Dock } from "@/components/companion/dock"
import { RoomHeader } from "@/components/companion/room-header"
import { RoomTransition } from "@/components/companion/room-transition"
import { NotificationsProvider } from "@/components/notifications-provider"
import { isPlatformAdmin } from "@/lib/admin"
import { DEMO_ORG } from "@/lib/demo"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"
import { ensureOrgBootstrap, getOrgSidebarContext } from "@/lib/org"

const DEMO_DOCK_CONTEXT = {
  orgName: DEMO_ORG.name,
  orgSlug: DEMO_ORG.slug,
  planName: "Free test plan",
  userEmail: "demo@lumina.app",
  userName: "Demo User",
}

/**
 * The Companion shell (C1) — the app opens into a conversation with Wick;
 * every section is a summoned full-screen "room". This layout owns exactly
 * the chrome every room shares: the floating bottom dock (replaces the old
 * left sidebar + its header bar entirely — see src/components/companion/
 * dock.tsx for the parity mapping of every control that used to live there),
 * a slim self-labeling room header (replaces the old sticky breadcrumb), and
 * the cinematic room-to-room transition. CommandPaletteProvider and
 * NotificationsProvider stay mounted here unchanged — ⌘K and the
 * instant-lead-alert tray are both still app-wide, just reached from the
 * dock now instead of the header bar.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  // Repair path: a signed-in user can end up orphaned (no org_members row)
  // if the signup trigger's own bootstrap swallowed a failure — see
  // src/lib/org.ts. Calling ensureOrgBootstrap once per request here means
  // every authenticated page load self-heals that case for free. Cheap
  // no-op once the user already has an org.
  let authedUserEmail: string | null = null
  if (isSupabaseConfigured()) {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      authedUserEmail = user.email ?? null
      await ensureOrgBootstrap(user.id, user.email ?? null)
    }
  }

  const [isAdmin, orgContext] = await Promise.all([
    isPlatformAdmin(),
    isSupabaseConfigured() ? getOrgSidebarContext() : Promise.resolve(null),
  ])

  const dockProps = orgContext
    ? {
        orgName: orgContext.orgName,
        orgSlug: orgContext.orgSlug,
        planName: orgContext.planName,
        userEmail: orgContext.userEmail,
        userName: orgContext.userName ?? undefined,
      }
    : isSupabaseConfigured()
      ? {
          orgName: "Your business",
          orgSlug: "",
          planName: "Free test plan",
          userEmail: authedUserEmail ?? "",
          userName: undefined,
        }
      : DEMO_DOCK_CONTEXT

  return (
    <CommandPaletteProvider isAdmin={isAdmin}>
      <NotificationsProvider>
        {/* h-svh + min-h-0 bounds this to exactly the viewport height so only
            the room content below scrolls — same app-shell contract the old
            sidebar layout established (pages like Inbox depend on `flex-1
            min-h-0` resolving to a real, bounded height). The dock is a
            sibling of the scrolling region, positioned `fixed` — see
            room-transition.tsx's file doc for why it must never be a
            descendant of the animated room wrapper. */}
        <div className="relative flex h-svh min-h-0 flex-col overflow-hidden bg-background">
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <RoomHeader />
            <div className="flex min-h-0 flex-1 flex-col px-4 pb-28 sm:px-6 lg:px-8">
              <RoomTransition>{children}</RoomTransition>
            </div>
          </div>
          <Dock isAdmin={isAdmin} {...dockProps} />
        </div>
      </NotificationsProvider>
    </CommandPaletteProvider>
  )
}
