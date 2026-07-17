// Shared nav registry — single source for the sidebar and the canvas
// breadcrumb so route → label → icon mappings never drift apart.

import {
  BarChart3,
  BrainCircuit,
  CalendarDays,
  Inbox,
  LayoutDashboard,
  Sparkles,
  TrendingUp,
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

export const SETTINGS_NAV: NavItem = {
  href: "/settings",
  label: "Settings & Brain",
  icon: BrainCircuit,
}

export const ALL_NAV: NavItem[] = [PRIMARY_NAV, ...WORKSPACE_NAV, SETTINGS_NAV]
