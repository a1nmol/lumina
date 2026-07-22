"use client"

import { useTheme } from "@/components/theme-provider"
import { Moon, Sun } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Light/dark toggle. `resolvedTheme` is undefined during the very first
 * render (server + pre-hydration) and settles once our ThemeProvider's own
 * mount effect runs — no local "mounted" state needed on our end.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn("text-sidebar-foreground/70 hover:text-sidebar-foreground", className)}
    >
      {isDark ? (
        <Sun aria-hidden="true" className="size-4" />
      ) : (
        <Moon aria-hidden="true" className="size-4" />
      )}
    </Button>
  )
}
