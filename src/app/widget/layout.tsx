import type { Metadata, Viewport } from "next"
import type { ReactNode } from "react"

import "./widget.css"

// Standalone widget shell — intentionally NO app chrome (no Companion dock,
// no room header/transition from src/app/(app)/layout.tsx). This is
// nested under the single shared root layout (src/app/layout.tsx), which
// still supplies <html>/<body>, fonts, and next-themes — see the header
// comment in ./widget.css for why widget color tokens deliberately do NOT
// use that ThemeProvider's `.dark` class and instead follow the visitor's
// real `prefers-color-scheme` directly.
export const metadata: Metadata = {
  title: "Chat",
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The iframe panel is a fixed 380x560 on desktop and full-screen under
  // 480px (public/widget.js) — this page never needs to zoom or resize with
  // the visitor's own page.
  viewportFit: "cover",
}

export default function WidgetLayout({ children }: { children: ReactNode }) {
  return <div className="lw-root">{children}</div>
}
