"use client"

// The Companion dock (C1) — replaces the left sidebar. A single floating,
// pill-shaped nav, bottom-center on every viewport (this IS the mobile app
// shape — MASTER_PLAN's mobile-first direction). Left to right: Wick's orb
// (home), the six workspace rooms (canonical order from nav-items.ts —
// WORKSPACE_NAV is the single source so this never drifts from the command
// palette's "Go to" list), a ⌘K spark, the notification bell (moved from the
// old header, same provider), and an overflow "…" menu holding the
// less-frequent destinations (Settings / Account / Admin) plus theme + sign
// out. See the dock design-decisions note in the builder report for why the
// bell stays a direct, always-visible icon (its unread badge is the one
// piece of chrome that must never be a click away) while the theme toggle —
// previously a single click in the sidebar footer — moved into the overflow
// menu to keep the pill thumb-width-safe at 375px.

import type { ReactNode } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { motion, useReducedMotion } from "framer-motion"
import { toast } from "sonner"
import {
  LogOut,
  Moon,
  MoreHorizontal,
  Sparkles,
  Sun,
  UserRound,
  type LucideIcon,
} from "lucide-react"

import { Wick } from "@/components/brand/wick"
import { useCommandPalette } from "@/components/command-palette"
import {
  ACCOUNT_NAV,
  ADMIN_NAV,
  PRIMARY_NAV,
  SETTINGS_NAV,
  WORKSPACE_NAV,
  type NavItem,
} from "@/components/nav-items"
import { NotificationTray } from "@/components/notification-tray"
import { useTheme } from "@/components/theme-provider"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import { springGentle } from "@/lib/motion"
import { cn } from "@/lib/utils"

/** Mirrors app-sidebar.tsx's fallback (now retired) — "anmol.subedi@x.com" → "Anmol Subedi" when there's no real profile name yet. */
function displayNameFromEmail(email: string) {
  const localPart = email.split("@")[0] ?? email
  const words = localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
  return words.length > 0 ? words.join(" ") : email
}

type DockProps = {
  isAdmin: boolean
  orgName: string
  orgSlug: string
  planName: string
  userEmail: string
  userName?: string
}

const ICON_BUTTON =
  "relative flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-foreground/8 hover:text-foreground focus-visible:ring-3 focus-visible:ring-lamplight/50 focus-visible:shadow-lamplight"

/** Thin grouping divider between dock segments. */
function DockDivider() {
  return <span aria-hidden="true" className="mx-1 hidden h-5 w-px shrink-0 self-center bg-border/70 sm:block" />
}

export function Dock({ isAdmin, orgName, orgSlug, planName, userEmail, userName }: DockProps) {
  const pathname = usePathname()
  const router = useRouter()
  const reduceMotion = useReducedMotion()
  const { open: openPalette } = useCommandPalette()
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  const userDisplayName = userName ?? displayNameFromEmail(userEmail)
  const isHome = pathname === PRIMARY_NAV.href
  const overflowActive =
    pathname.startsWith(SETTINGS_NAV.href) || pathname.startsWith(ACCOUNT_NAV.href) || pathname.startsWith(ADMIN_NAV.href)

  async function handleSignOut() {
    if (isSupabaseConfigured()) {
      const { createClient } = await import("@/lib/supabase/client")
      await createClient().auth.signOut()
    } else {
      toast.info("Signed out", { description: "Demo mode — no account was connected." })
    }
    router.push("/login")
  }

  function toggleTheme() {
    setTheme(isDark ? "light" : "dark")
  }

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-4"
    >
      <nav
        aria-label="Lumina navigation"
        className="dock-glass pointer-events-auto flex max-w-full items-center gap-0 rounded-full p-1 sm:gap-1.5 sm:p-2"
      >
        <DockGlyph
          href={PRIMARY_NAV.href}
          label="Command Center"
          isActive={isHome}
          reduceMotion={!!reduceMotion}
        >
          <Wick state="idle" size={22} chrome />
        </DockGlyph>

        <DockDivider />

        {WORKSPACE_NAV.map((item) => (
          <RoomGlyph key={item.href} item={item} pathname={pathname} reduceMotion={!!reduceMotion} />
        ))}

        <DockDivider />

        <Tooltip>
          <TooltipTrigger
            render={<button type="button" onClick={openPalette} className={ICON_BUTTON} />}
          >
            <Sparkles aria-hidden="true" className="size-4" />
            <span className="sr-only">Open command palette (⌘K)</span>
          </TooltipTrigger>
          <TooltipContent>Command palette · ⌘K</TooltipContent>
        </Tooltip>

        <NotificationTray side="top" align="center" className="size-8" />

        <DropdownMenu>
          <DropdownMenuTrigger
            title="More — Settings, account, and preferences"
            aria-label="More — Settings, account, and preferences"
            className={cn(ICON_BUTTON, overflowActive && "text-lamplight")}
          >
            <MoreHorizontal aria-hidden="true" className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="center" className="w-64">
            <DropdownMenuLabel className="flex flex-col">
              <span className="truncate font-medium text-foreground">{orgName}</span>
              <span className="truncate text-xs font-normal text-muted-foreground">
                {planName}
                {orgSlug ? ` · ${orgSlug}` : ""}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href={SETTINGS_NAV.href} />}>
              <SETTINGS_NAV.icon aria-hidden="true" className="size-4" />
              {SETTINGS_NAV.label}
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href={ACCOUNT_NAV.href} />}>
              <UserRound aria-hidden="true" className="size-4" />
              My account
            </DropdownMenuItem>
            {isAdmin && (
              <DropdownMenuItem render={<Link href={ADMIN_NAV.href} />}>
                <ADMIN_NAV.icon aria-hidden="true" className="size-4" />
                {ADMIN_NAV.label}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={toggleTheme}>
              {isDark ? (
                <Sun aria-hidden="true" className="size-4" />
              ) : (
                <Moon aria-hidden="true" className="size-4" />
              )}
              {isDark ? "Switch to light" : "Switch to dark"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="flex flex-col pb-0">
              <span className="truncate text-xs font-normal text-muted-foreground">{userDisplayName}</span>
              <span className="truncate text-xs font-normal text-muted-foreground">{userEmail}</span>
            </DropdownMenuLabel>
            <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
              <LogOut aria-hidden="true" className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
    </div>
  )
}

function DockGlyph({
  href,
  label,
  isActive,
  reduceMotion,
  children,
}: {
  href: string
  label: string
  isActive: boolean
  reduceMotion: boolean
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative flex size-8 shrink-0 items-center justify-center rounded-full outline-none transition-colors focus-visible:ring-3 focus-visible:ring-lamplight/50 focus-visible:shadow-lamplight",
              isActive ? "text-foreground" : "text-muted-foreground hover:bg-foreground/8 hover:text-foreground"
            )}
          />
        }
      >
        {isActive && (
          <motion.span
            layoutId="dock-active-glow"
            className="absolute inset-0 rounded-full bg-lamplight/15 ring-1 ring-lamplight/40 shadow-lamplight"
            transition={reduceMotion ? { duration: 0 } : springGentle}
          />
        )}
        <span className="relative z-10 flex size-full items-center justify-center">{children}</span>
        <span className="sr-only">{label}</span>
        {isActive && (
          <motion.span
            initial={reduceMotion ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduceMotion ? { duration: 0 } : springGentle}
            aria-hidden="true"
            className="absolute -top-7 left-1/2 z-10 -translate-x-1/2 rounded-full bg-popover px-2 py-0.5 text-[10px] font-medium whitespace-nowrap text-lamplight ring-1 ring-border shadow-soft"
          >
            {label}
          </motion.span>
        )}
      </TooltipTrigger>
      {!isActive && <TooltipContent>{label}</TooltipContent>}
    </Tooltip>
  )
}

function RoomGlyph({
  item,
  pathname,
  reduceMotion,
}: {
  item: NavItem
  pathname: string
  reduceMotion: boolean
}) {
  const Icon: LucideIcon = item.icon
  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)

  return (
    <DockGlyph href={item.href} label={item.label} isActive={isActive} reduceMotion={reduceMotion}>
      <Icon aria-hidden="true" className="size-4" />
    </DockGlyph>
  )
}
