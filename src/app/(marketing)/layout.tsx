import type { ReactNode } from "react"

import { WickGuide } from "@/components/brand/wick-guide"
import { ShopExampleProvider } from "@/components/marketing/shop-context"
import { MarketingFooter } from "@/components/marketing/footer"
import { MarketingNav } from "@/components/marketing/nav"

/**
 * Standalone marketing shell — no app sidebar, no auth chrome. Globals are
 * already loaded once by the root layout (src/app/layout.tsx imports
 * ./globals.css and mounts Providers, including the Toaster and
 * WickMomentsProvider both the pilot-menu form and Wick usages below rely
 * on), so this layout only adds what's specific to marketing pages: the nav
 * + footer, and the shop-vertical context the "Pick your shop" tabs and the
 * sections that react to them share.
 *
 * `WickGuide` is mounted once here (not per-page) since it's a fixed,
 * page-spanning companion — see its own file for the hero-handoff and
 * waypoint details. It no-ops (renders null) until the hero has scrolled
 * fully out of view, so it never appears alongside the hero's own Wick.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <ShopExampleProvider>
      <MarketingNav />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
      <WickGuide />
    </ShopExampleProvider>
  )
}
