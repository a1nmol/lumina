// Shared nav registry — single source for the sidebar and the canvas
// breadcrumb so route → label → icon mappings never drift apart.

import {
  BarChart3,
  BrainCircuit,
  CalendarDays,
  Inbox,
  LayoutDashboard,
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
  label: "Settings & Brain",
  icon: BrainCircuit,
}

/** Personal account settings — reached from the sidebar user menu, not the
 *  nav lists; registered here so RouteBreadcrumb resolves its label. */
export const ACCOUNT_NAV: NavItem = {
  href: "/account",
  label: "My account",
  icon: UserRound,
}

export const ALL_NAV: NavItem[] = [PRIMARY_NAV, ...WORKSPACE_NAV, ADMIN_NAV, SETTINGS_NAV, ACCOUNT_NAV]
