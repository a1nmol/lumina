// Shared nav registry — single source for the Companion dock, the room
// header, and the command palette so route → label → icon mappings never
// drift apart.

import {
  BarChart3,
  Bot,
  BrainCircuit,
  Building2,
  CalendarDays,
  CircleDollarSign,
  Inbox,
  LayoutDashboard,
  Share2,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react"

export type NavItem = {
  href: string
  label: string
  icon: LucideIcon
}

export const PRIMARY_NAV: NavItem = {
  href: "/dashboard",
  label: "Command Center",
  icon: LayoutDashboard,
}

export const WORKSPACE_NAV: NavItem[] = [
  { href: "/studio", label: "Content Studio", icon: Sparkles },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/growth", label: "Growth", icon: TrendingUp },
]

export const ADMIN_NAV: NavItem = {
  href: "/admin",
  label: "Admin",
  icon: ShieldCheck,
}

export const SETTINGS_NAV: NavItem = {
  href: "/settings",
  label: "Settings",
  icon: BrainCircuit,
}

/** Personal account settings — reached from the Companion dock's overflow
 *  menu, not the room glyphs; registered here so RoomHeader resolves its
 *  label. Also listed (as an external link) in the Settings sub-nav for
 *  findability — see src/app/(app)/settings/layout.tsx. */
export const ACCOUNT_NAV: NavItem = {
  href: "/account",
  label: "Account",
  icon: UserRound,
}

/** The Settings hub's sub-navigation (redesign R2) — 5 categories, rendered
 *  by src/app/(app)/settings/layout.tsx's sub-nav. Account is last and links
 *  outside this route's own tree (to /account, ACCOUNT_NAV above) — it's
 *  listed here only for findability. */
export const SETTINGS_SUB_NAV: NavItem[] = [
  { href: "/settings/business", label: "Business profile", icon: Building2 },
  { href: "/settings/ai", label: "AI behaviour", icon: Bot },
  { href: "/settings/channels", label: "Channels & phone", icon: Share2 },
  { href: "/settings/plan", label: "Plan & usage", icon: CircleDollarSign },
  ACCOUNT_NAV,
]

/** Deep pages nested under a Settings category (e.g. the Business Brain
 *  wizard, the AI Receptionist config) — used by the Settings sub-nav to
 *  show the right category as active while a nested page fills the content
 *  column. Not part of the sub-nav itself (they're reached from a card
 *  inside their parent category, not a top-level nav link). */
export const SETTINGS_DEEP_PAGES: { href: string; label: string; parentHref: string }[] = [
  { href: "/settings/brain", label: "Business Brain", parentHref: "/settings/business" },
  { href: "/settings/voice", label: "AI Receptionist", parentHref: "/settings/channels" },
]
