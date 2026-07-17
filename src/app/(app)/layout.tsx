import type { ReactNode } from "react"

import { AppSidebar } from "@/components/app-sidebar"
import { NotificationsProvider } from "@/components/notifications-provider"
import { NotificationTray } from "@/components/notification-tray"
import { RouteBreadcrumb } from "@/components/route-breadcrumb"
import { RouteTransition } from "@/components/route-transition"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { isPlatformAdmin } from "@/lib/admin"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"
import { ensureOrgBootstrap } from "@/lib/org"

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Repair path: a signed-in user can end up orphaned (no org_members row)
  // if the signup trigger's own bootstrap swallowed a failure — see
  // src/lib/org.ts. Calling ensureOrgBootstrap once per request here means
  // every authenticated page load self-heals that case for free. Cheap
  // no-op once the user already has an org.
  if (isSupabaseConfigured()) {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      await ensureOrgBootstrap(user.id, user.email ?? null)
    }
  }

  const isAdmin = await isPlatformAdmin()

  return (
    <NotificationsProvider>
      <SidebarProvider>
        <AppSidebar isAdmin={isAdmin} />
        <SidebarInset>
          <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-sm">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-5" />
            <RouteBreadcrumb />
            <div className="ml-auto flex items-center gap-1">
              <NotificationTray />
            </div>
          </header>
          <div className="flex flex-1 flex-col p-6">
            <RouteTransition>{children}</RouteTransition>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </NotificationsProvider>
  )
}
