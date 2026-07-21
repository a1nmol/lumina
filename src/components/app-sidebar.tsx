"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { motion, useReducedMotion } from "framer-motion"
import { toast } from "sonner"
import {
  Check,
  ChevronsUpDown,
  LogOut,
  Plus,
  Settings,
  type LucideIcon,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/theme-toggle"
import {
  ADMIN_NAV,
  PRIMARY_NAV,
  SETTINGS_NAV,
  WORKSPACE_NAV,
  type NavItem,
} from "@/components/nav-items"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import { cn } from "@/lib/utils"

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("")
}

/** Best-effort display name from an email when there's no real profile name yet — e.g. "anmol.subedi@x.com" → "Anmol Subedi". */
function displayNameFromEmail(email: string) {
  const localPart = email.split("@")[0] ?? email
  const words = localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
  return words.length > 0 ? words.join(" ") : email
}

type AppSidebarProps = {
  /** Whether the current user can see the Admin nav item / route. */
  isAdmin: boolean
  orgName: string
  orgSlug: string
  planName: string
  userEmail: string
  /** Optional real display name; falls back to a name derived from userEmail. */
  userName?: string
}

export function AppSidebar({ isAdmin, orgName, orgSlug, planName, userEmail, userName }: AppSidebarProps) {
  const router = useRouter()
  const userDisplayName = userName ?? displayNameFromEmail(userEmail)

  async function handleSignOut() {
    if (isSupabaseConfigured()) {
      const { createClient } = await import("@/lib/supabase/client")
      await createClient().auth.signOut()
    } else {
      toast.info("Signed out", { description: "Demo mode — no account was connected." })
    }
    router.push("/login")
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-3 px-2 pt-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            title={orgSlug ? `${orgName} (${orgSlug})` : orgName}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg p-1.5 text-left ring-sidebar-ring outline-hidden transition-colors hover:bg-sidebar-accent focus-visible:ring-2",
              "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-1"
            )}
          >
            <Avatar size="sm" className="rounded-md">
              <AvatarFallback className="rounded-md bg-primary/15 text-xs font-semibold text-primary">
                {getInitials(orgName)}
              </AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-1 flex-col group-data-[collapsible=icon]:hidden">
              <span className="truncate text-sm font-medium text-sidebar-foreground">
                {orgName}
              </span>
              <span className="truncate text-xs text-sidebar-foreground/60">{planName}</span>
            </div>
            <ChevronsUpDown
              aria-hidden="true"
              className="size-4 shrink-0 text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>Switch business</DropdownMenuLabel>
            <DropdownMenuItem>
              <Check aria-hidden="true" className="size-4 text-primary" />
              {orgName}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/settings" />}>
              <Settings aria-hidden="true" className="size-4" />
              Business settings
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
              <LogOut aria-hidden="true" className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          render={<Link href="/studio" />}
          className="w-full justify-center rounded-full group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:rounded-full group-data-[collapsible=icon]:p-0"
        >
          <Plus aria-hidden="true" className="size-4" />
          <span className="group-data-[collapsible=icon]:hidden">Create</span>
        </Button>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarNavItem item={PRIMARY_NAV} />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {WORKSPACE_NAV.map((item) => (
                <SidebarNavItem key={item.href} item={item} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="gap-2 px-2 pb-2">
        <SidebarMenu>
          {isAdmin && <SidebarNavItem item={ADMIN_NAV} />}
          <SidebarNavItem item={SETTINGS_NAV} />
        </SidebarMenu>

        <div className="flex items-center justify-between gap-2 rounded-lg px-1 py-1 group-data-[collapsible=icon]:flex-col">
          <div className="flex min-w-0 items-center gap-2 group-data-[collapsible=icon]:hidden">
            <Avatar size="sm">
              <AvatarFallback>{getInitials(userDisplayName)}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-xs font-medium text-sidebar-foreground">
                {userDisplayName}
              </span>
              <span className="truncate text-xs text-sidebar-foreground/60">
                {userEmail}
              </span>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}

function SidebarNavItem({ item }: { item: NavItem }) {
  const pathname = usePathname()
  const reduceMotion = useReducedMotion()
  const Icon: LucideIcon = item.icon
  const isActive =
    pathname === item.href || pathname.startsWith(`${item.href}/`)

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<Link href={item.href} aria-current={isActive ? "page" : undefined} />}
        isActive={isActive}
        tooltip={item.label}
        className={cn(
          "relative gap-2.5 text-sidebar-foreground/70 hover:text-sidebar-foreground",
          "data-active:bg-transparent data-active:font-medium data-active:text-sidebar-foreground"
        )}
      >
        {isActive && (
          <motion.div
            layoutId="active-nav-pill"
            className="absolute inset-0 -z-10 rounded-md bg-sidebar-accent"
            transition={
              reduceMotion
                ? { duration: 0 }
                : { type: "spring", stiffness: 380, damping: 30 }
            }
          />
        )}
        <Icon aria-hidden="true" className="size-4" />
        <span>{item.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
