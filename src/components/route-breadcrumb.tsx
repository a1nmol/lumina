"use client"

import { usePathname } from "next/navigation"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { ALL_NAV, SETTINGS_DEEP_PAGES, SETTINGS_NAV, SETTINGS_SUB_NAV } from "@/components/nav-items"

/** Resolves the Settings hub's crumb trail for a pathname already known to
 *  start with "/settings" — "Settings" alone on the redirect route itself,
 *  "Settings / <Category>" for the four category routes + Account, or
 *  "Settings / <Category> / <Deep page>" for a nested page like
 *  /settings/voice or /settings/brain (see SETTINGS_DEEP_PAGES). */
function resolveSettingsCrumbs(pathname: string): string[] {
  const deepPage = SETTINGS_DEEP_PAGES.find(
    (page) => pathname === page.href || pathname.startsWith(`${page.href}/`)
  )
  if (deepPage) {
    const parent = SETTINGS_SUB_NAV.find((item) => item.href === deepPage.parentHref)
    return parent ? [SETTINGS_NAV.label, parent.label, deepPage.label] : [SETTINGS_NAV.label, deepPage.label]
  }

  const category = SETTINGS_SUB_NAV.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  )
  if (category) return [SETTINGS_NAV.label, category.label]

  return [SETTINGS_NAV.label]
}

/** Sticky canvas header breadcrumb — resolves the current page's crumb trail from the nav registry. */
export function RouteBreadcrumb() {
  const pathname = usePathname()

  const crumbs =
    pathname === "/settings" || pathname.startsWith("/settings/")
      ? resolveSettingsCrumbs(pathname)
      : [ALL_NAV.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))?.label ?? "Lumina"]

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((label, index) => (
          <BreadcrumbItem key={label}>
            {index > 0 && <BreadcrumbSeparator className="mr-1.5" />}
            <BreadcrumbPage>{label}</BreadcrumbPage>
          </BreadcrumbItem>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
