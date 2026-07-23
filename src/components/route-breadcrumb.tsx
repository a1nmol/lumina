"use client"

import { usePathname } from "next/navigation"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { ALL_NAV } from "@/components/nav-items"

/** Sticky canvas header breadcrumb — resolves the current page label from the nav registry. */
export function RouteBreadcrumb() {
  const pathname = usePathname()
  const current = ALL_NAV.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  )

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbPage>{current?.label ?? "Lumina"}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}
