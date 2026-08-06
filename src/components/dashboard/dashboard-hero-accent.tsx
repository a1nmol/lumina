"use client"

/**
 * DashboardHeroAccent — the client boundary that lazy-loads FireflyField
 * (redesign wave R6, Command Center ambient dusk). Next's App Router
 * disallows `ssr: false` on a `next/dynamic` import inside a Server
 * Component, so this tiny client wrapper exists purely to host that
 * boundary — the actual Command Center page (`src/app/(app)/dashboard/
 * page.tsx`) stays a server component and just renders this.
 *
 * `ssr: false` here means the canvas never ships in the initial HTML or
 * hydration pass — it's fetched as its own chunk and mounted client-side
 * only, so it can never affect LCP. No loading placeholder is rendered
 * meanwhile (the field is a decorative background layer; its parent already
 * shows real content immediately).
 */

import dynamic from "next/dynamic"

const FireflyField = dynamic(() => import("@/components/brand/firefly-field").then((mod) => mod.FireflyField), {
  ssr: false,
})

export function DashboardHeroAccent({ className }: { className?: string }) {
  return <FireflyField className={className} />
}
