"use client"

// Settings hub sub-navigation (redesign R2) — a Linear/Vercel-style category
// switcher for the 5 Settings categories (SETTINGS_SUB_NAV in
// src/components/nav-items.ts). Renders twice from the same data, gated by
// breakpoint rather than duplicated logic:
//  - desktop (lg+): a compact sticky vertical list, left column of
//    ./layout.tsx's two-column shell.
//  - mobile (< lg): a horizontal, scrollable pill row above the content.
// Active state via usePathname + aria-current="page" on the matching link —
// this is a client component (nav registry + usePathname) rendered inside
// the server settings layout.

import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion, useReducedMotion } from "framer-motion"

import { SETTINGS_DEEP_PAGES, SETTINGS_SUB_NAV, type NavItem } from "@/components/nav-items"
import { cn } from "@/lib/utils"

/** True when `item` is the active category — either its own route, or the
 *  parent category of a deep page like /settings/voice or /settings/brain
 *  (SETTINGS_DEEP_PAGES), so those pages still show which category they
 *  belong to even though their URL isn't literally nested under it. */
function isItemActive(pathname: string, item: NavItem): boolean {
  if (pathname === item.href || pathname.startsWith(`${item.href}/`)) return true
  const deepPage = SETTINGS_DEEP_PAGES.find((page) => pathname === page.href || pathname.startsWith(`${page.href}/`))
  return deepPage?.parentHref === item.href
}

export function SettingsSubNav() {
  const pathname = usePathname()

  return (
    <nav aria-label="Settings" className="hidden w-56 shrink-0 lg:block">
      <div className="sticky top-20 flex flex-col gap-1">
        <h2 className="px-3 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Settings</h2>
        {SETTINGS_SUB_NAV.map((item) => (
          <DesktopNavLink key={item.href} item={item} isActive={isItemActive(pathname, item)} />
        ))}
      </div>
    </nav>
  )
}

function DesktopNavLink({ item, isActive }: { item: NavItem; isActive: boolean }) {
  const reduceMotion = useReducedMotion()
  const Icon = item.icon

  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm outline-none transition-colors",
        "focus-visible:border-lamplight focus-visible:ring-3 focus-visible:ring-lamplight/50 focus-visible:shadow-lamplight",
        isActive
          ? "font-medium text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      )}
    >
      {isActive && (
        <motion.span
          layoutId="settings-nav-active"
          className="absolute inset-0 -z-10 rounded-lg bg-muted"
          transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 30 }}
        />
      )}
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  )
}

export function SettingsMobileNav() {
  const pathname = usePathname()

  return (
    <nav aria-label="Settings" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:hidden">
      {SETTINGS_SUB_NAV.map((item) => {
        const isActive = isItemActive(pathname, item)
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap outline-none transition-colors",
              "focus-visible:border-lamplight focus-visible:ring-3 focus-visible:ring-lamplight/50 focus-visible:shadow-lamplight",
              isActive
                ? "border-transparent bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon aria-hidden="true" className="size-3.5" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
