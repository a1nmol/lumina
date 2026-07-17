import type { ReactNode } from "react"

import { AppSidebar } from "@/components/app-sidebar"
import { RouteBreadcrumb } from "@/components/route-breadcrumb"
import { RouteTransition } from "@/components/route-transition"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-sm">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-5" />
          <RouteBreadcrumb />
        </header>
        <div className="flex flex-1 flex-col p-6">
          <RouteTransition>{children}</RouteTransition>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
