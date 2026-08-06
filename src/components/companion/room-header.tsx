"use client"

import { usePathname } from "next/navigation"

import { ACCOUNT_NAV, ADMIN_NAV, SETTINGS_NAV, WORKSPACE_NAV, type NavItem } from "@/components/nav-items"

const ROOMS: NavItem[] = [...WORKSPACE_NAV, SETTINGS_NAV, ACCOUNT_NAV, ADMIN_NAV]

function resolveRoom(pathname: string): NavItem | null {
  return ROOMS.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)) ?? null
}

/**
 * The Companion shell's "each room labels itself" chrome (C1) — replaces the
 * old sidebar shell's sticky breadcrumb (src/components/route-breadcrumb.tsx,
 * now retired) with a single slim line: the room's own icon + name. Deliberately
 * a single level, never a multi-crumb trail — Settings' own sub-nav (see
 * src/app/(app)/settings/settings-sub-nav.tsx) already carries category
 * context inside the room itself, so this bar only ever needs to say which
 * room you're in.
 *
 * Renders nothing on /dashboard — Companion Home isn't reached via a room
 * glyph (it's Wick's own conversation, opened from the dock's orb), and the
 * greeting inside home-conversation.tsx already establishes context; a
 * "Command Center" label bar above it would just repeat the old breadcrumb
 * pattern this shell is retiring.
 */
export function RoomHeader() {
  const pathname = usePathname()
  if (pathname === "/dashboard") return null

  const room = resolveRoom(pathname)
  if (!room) return null

  const Icon = room.icon

  return (
    <div className="sticky top-0 z-10 flex shrink-0 items-center gap-2 bg-background/85 px-4 pt-4 pb-2 backdrop-blur-sm sm:px-6 sm:pt-6 lg:px-8">
      <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
      <span className="text-sm font-medium text-foreground">{room.label}</span>
    </div>
  )
}
