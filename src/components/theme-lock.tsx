"use client"

// Scene-locks a route subtree's THEME REGISTER (owner directive, 2026-08-05:
// "the landing page is always the light look, for every visitor"). Mounted
// in the (marketing) layout: while any marketing page is on screen the html
// element paints the daylight register regardless of the visitor's system
// preference or stored toggle choice; the app's own theme returns untouched
// the moment navigation leaves the marketing tree (unmount restores it).
// The dusk-locked story sections inside the landing keep working — they
// scene-lock via .dusk-section, independent of the html-level class this
// controls.

import { useEffect } from "react"

import { useTheme } from "@/components/theme-provider"

export function ThemeLock({ theme }: { theme: "light" | "dark" }) {
  const { lockResolvedTheme } = useTheme()

  useEffect(() => {
    return lockResolvedTheme(theme)
  }, [lockResolvedTheme, theme])

  return null
}
