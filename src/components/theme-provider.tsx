"use client"

import * as React from "react"

import { useMounted } from "@/hooks/use-mounted"

/**
 * Minimal in-repo replacement for `next-themes`.
 *
 * We stopped using next-themes because its `ThemeProvider` renders an inline
 * theme-init `<script>` *inside* the client React tree, which trips React
 * 19's "Encountered a script tag while rendering React component" dev
 * warning. The actual flash-of-wrong-theme prevention now lives in a static
 * inline script rendered once by the server root layout
 * (src/app/layout.tsx) — see the comment there. This module only owns the
 * React-side state/context (`useTheme`) and keeps <html> in sync afterwards.
 */

export type Theme = "light" | "dark" | "system"

interface ThemeProviderState {
  /** Scene-locks the resolved theme (marketing pages force daylight — see ThemeLock). Returns an unlock fn. While locked, stored/system theme is remembered but not painted. */
  lockResolvedTheme: (locked: "light" | "dark") => () => void
  theme: Theme
  /** `undefined` until the provider has mounted and resolved a concrete theme. */
  resolvedTheme: "light" | "dark" | undefined
  setTheme: (theme: Theme) => void
}

interface ThemeProviderProps {
  children: React.ReactNode
  /** localStorage key used to persist the preference. */
  storageKey?: string
  defaultTheme?: Theme
  /** Whether `"system"` is a valid, listened-to theme value. */
  enableSystem?: boolean
  /** Briefly disable all CSS transitions while classes flip, so toggling
   * doesn't animate every themed element on the page at once. */
  disableTransitionOnChange?: boolean
}

const DEFAULT_STORAGE_KEY = "theme"
const THEMES: readonly Theme[] = ["light", "dark", "system"]

const ThemeProviderContext = React.createContext<ThemeProviderState | undefined>(undefined)

function isTheme(value: string | null): value is Theme {
  return value !== null && (THEMES as readonly string[]).includes(value)
}

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function applyResolvedTheme(resolved: "light" | "dark") {
  const root = document.documentElement
  root.classList.remove("light", "dark")
  root.classList.add(resolved)
  root.style.colorScheme = resolved
}

/** Mirrors next-themes' disableTransitionOnChange: inject a blanket
 * transition:none stylesheet, flip the theme classes synchronously, force a
 * style recalculation, then remove the stylesheet on the next tick. */
function withTransitionsDisabled(paint: () => void) {
  const style = document.createElement("style")
  style.appendChild(
    document.createTextNode("*,*::before,*::after{transition:none!important}")
  )
  document.head.appendChild(style)
  paint()
  // Force layout so the browser commits the class change before we lift the
  // transition block back off.
  void window.getComputedStyle(document.body).opacity
  window.setTimeout(() => {
    document.head.removeChild(style)
  }, 1)
}

function readStoredTheme(storageKey: string, fallback: Theme): Theme {
  if (typeof window === "undefined") return fallback
  try {
    const stored = window.localStorage.getItem(storageKey)
    return isTheme(stored) ? stored : fallback
  } catch {
    return fallback
  }
}

export function ThemeProvider({
  children,
  storageKey = DEFAULT_STORAGE_KEY,
  defaultTheme = "system",
  enableSystem = true,
  disableTransitionOnChange = false,
}: ThemeProviderProps) {
  // Lazy initializers: on the server (and the very first, pre-hydration
  // pass) `window` is undefined so these fall back to `defaultTheme` — the
  // exposed context value masks that behind `mounted` below, so the
  // client/server divergence here never reaches rendered output.
  const [theme, setThemeState] = React.useState<Theme>(() =>
    readStoredTheme(storageKey, defaultTheme)
  )
  const [resolvedTheme, setResolvedTheme] = React.useState<"light" | "dark" | undefined>(() => {
    const initial = readStoredTheme(storageKey, defaultTheme)
    return initial === "system" ? getSystemTheme() : initial
  })
  // Hydration-safe mounted gate — see src/hooks/use-mounted.ts. Avoids the
  // react-hooks/set-state-in-effect lint rule, which flags a plain
  // useState+useEffect "mounted" flag as an unnecessary synchronous setState.
  const mounted = useMounted()

  // Scene lock (ThemeLock): while set, every applyTheme paints the locked
  // register instead of the stored/system one. A ref (not state) — locking
  // paints imperatively and must never re-render the whole provider tree.
  const lockRef = React.useRef<"light" | "dark" | null>(null)

  const applyTheme = React.useCallback(
    (next: Theme) => {
      const resolved = lockRef.current ?? (next === "system" ? getSystemTheme() : next)
      const paint = () => {
        applyResolvedTheme(resolved)
        setResolvedTheme(resolved)
      }
      if (disableTransitionOnChange) {
        withTransitionsDisabled(paint)
      } else {
        paint()
      }
    },
    [disableTransitionOnChange]
  )

  // Mount: the server root layout's inline script (and our own lazy state
  // initializers above) already painted/matched <html> before hydration, so
  // this effect only needs to subscribe to system + cross-tab changes — no
  // synchronous setState of its own (all setState calls below happen inside
  // an event-listener callback, not the effect body itself).
  React.useEffect(() => {
    const media = enableSystem ? window.matchMedia("(prefers-color-scheme: dark)") : null
    const onSystemChange = () => {
      setThemeState((current) => {
        if (current === "system") applyTheme("system")
        return current
      })
    }
    media?.addEventListener("change", onSystemChange)

    const onStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) return
      const next = isTheme(event.newValue) ? event.newValue : defaultTheme
      setThemeState(next)
      applyTheme(next)
    }
    window.addEventListener("storage", onStorage)

    return () => {
      media?.removeEventListener("change", onSystemChange)
      window.removeEventListener("storage", onStorage)
    }
    // Intentionally run once on mount — `applyTheme`/`defaultTheme`/etc. are
    // stable for the lifetime of a single provider instance in this app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setTheme = React.useCallback(
    (next: Theme) => {
      setThemeState(next)
      try {
        localStorage.setItem(storageKey, next)
      } catch {
        // localStorage may be unavailable (private mode, disabled) — the
        // theme still applies for this session, it just won't persist.
      }
      applyTheme(next)
    },
    [applyTheme, storageKey]
  )

  const lockResolvedTheme = React.useCallback(
    (locked: "light" | "dark") => {
      lockRef.current = locked
      applyTheme(locked)
      return () => {
        lockRef.current = null
        // Restore whatever the user's real preference resolves to now.
        setThemeState((current) => {
          applyTheme(current)
          return current
        })
      }
    },
    [applyTheme]
  )

  const value = React.useMemo<ThemeProviderState>(
    () => ({
      theme,
      resolvedTheme: mounted ? resolvedTheme : undefined,
      setTheme,
      lockResolvedTheme,
    }),
    [theme, resolvedTheme, mounted, setTheme, lockResolvedTheme]
  )

  return (
    <ThemeProviderContext.Provider value={value}>{children}</ThemeProviderContext.Provider>
  )
}

export function useTheme(): ThemeProviderState {
  const context = React.useContext(ThemeProviderContext)
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }
  return context
}
