"use client"

// The command palette (⌘K) — Redesign wave R4, "the discoverability layer".
// Surfaces navigation + the app's best/least-discovered actions in one
// keyboard-first overlay: opened via cmd+k/ctrl+k (global listener, mounted
// once here) or the persistent "⌘K" chip in the app header (never a nagging
// toast/modal — just a quiet, always-visible affordance per the redesign
// brief). CommandPaletteProvider owns the open state + global listener and
// is mounted once in src/app/(app)/layout.tsx, wrapping the whole app shell;
// CommandPaletteTrigger (the header chip) reads/opens it via context so the
// two don't need to be siblings.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useRouter } from "next/navigation"
import {
  Bot,
  Command as CommandIcon,
  ListPlus,
  Moon,
  Search,
  SquarePen,
  Sun,
  type LucideIcon,
} from "lucide-react"

import { useTheme } from "@/components/theme-provider"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  ACCOUNT_NAV,
  ADMIN_NAV,
  PRIMARY_NAV,
  SETTINGS_NAV,
  SETTINGS_SUB_NAV,
  WORKSPACE_NAV,
  type NavItem,
} from "@/components/nav-items"
import { cn } from "@/lib/utils"

// The 4 real settings categories (excludes ACCOUNT_NAV, which is listed
// separately below — see SETTINGS_SUB_NAV's own doc comment: Account is
// reached from the sidebar user menu, only mirrored into that array for
// findability, not one of the "settings categories" proper).
const SETTINGS_CATEGORIES = SETTINGS_SUB_NAV.filter((item) => item.href !== ACCOUNT_NAV.href)

type DoAction = {
  id: string
  label: string
  hint: string
  icon: LucideIcon
  href: string
}

const DO_ACTIONS: DoAction[] = [
  { id: "create-post", label: "Create a post", hint: "Content Studio", icon: SquarePen, href: "/studio" },
  { id: "ask-inbox", label: "Ask your inbox…", hint: "Search past conversations", icon: Search, href: "/inbox?focus=search" },
  { id: "standing-order", label: "Add a standing order", hint: "AI behaviour", icon: ListPlus, href: "/settings/ai" },
  { id: "configure-receptionist", label: "Configure AI Receptionist", hint: "Channels & phone", icon: Bot, href: "/settings/voice" },
]

type CommandPaletteContextValue = {
  open: () => void
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null)

/**
 * Mount once, wrapping the whole authenticated app shell (see
 * src/app/(app)/layout.tsx). Owns the open/closed state, the global
 * cmd+k/ctrl+k listener, and renders the dialog itself — `isAdmin` mirrors
 * the exact signal already passed to the Companion dock (src/components/
 * companion/dock.tsx), never re-derived client-side.
 */
export function CommandPaletteProvider({
  isAdmin,
  children,
}: {
  isAdmin: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)

  // Client-only global listener — effects never run during SSR, so this is
  // safe by construction; guarded further by only ever calling
  // preventDefault/setOpen from within the handler itself.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Deliberately fires even while an input/textarea has focus — the
      // industry command-palette convention (Linear/Vercel/GitHub). Do not
      // add an input guard.
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setOpen((current) => !current)
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [])

  const value = useMemo<CommandPaletteContextValue>(() => ({ open: () => setOpen(true) }), [])

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <CommandPaletteDialog open={open} onOpenChange={setOpen} isAdmin={isAdmin} />
    </CommandPaletteContext.Provider>
  )
}

/** Exposed so other trigger affordances (e.g. the Companion dock's spark button) can open the palette without re-implementing the context plumbing. */
export function useCommandPalette(): CommandPaletteContextValue {
  const ctx = useContext(CommandPaletteContext)
  if (!ctx) {
    throw new Error("useCommandPalette must be used within a CommandPaletteProvider")
  }
  return ctx
}

/** The persistent "⌘K" chip — a quiet, always-visible affordance in the app header, never a nag. */
export function CommandPaletteTrigger({ className }: { className?: string }) {
  const { open } = useCommandPalette()

  return (
    <button
      type="button"
      onClick={open}
      aria-label="Open command palette"
      title="Command palette (⌘K)"
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-1 text-xs font-medium text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:border-lamplight focus-visible:ring-3 focus-visible:ring-lamplight/50 focus-visible:shadow-lamplight",
        className
      )}
    >
      <CommandIcon aria-hidden="true" className="size-3" />
      K
    </button>
  )
}

function NavCommandItem({ item, onSelect }: { item: NavItem; onSelect: (href: string) => void }) {
  const Icon = item.icon
  return (
    <CommandItem value={item.label} onSelect={() => onSelect(item.href)}>
      <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
      {item.label}
    </CommandItem>
  )
}

function CommandPaletteDialog({
  open,
  onOpenChange,
  isAdmin,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  isAdmin: boolean
}) {
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  const navigate = useCallback(
    (href: string) => {
      onOpenChange(false)
      router.push(href)
    },
    [onOpenChange, router]
  )

  const toggleTheme = useCallback(() => {
    onOpenChange(false)
    setTheme(isDark ? "light" : "dark")
  }, [isDark, onOpenChange, setTheme])

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command palette"
      description="Jump anywhere in Lumina or run a quick action."
    >
      <Command>
        <CommandInput placeholder="Search pages or actions…" />
        <CommandList>
          <CommandEmpty>Nothing matches that.</CommandEmpty>

          <CommandGroup heading="Go to">
            <NavCommandItem item={PRIMARY_NAV} onSelect={navigate} />
            {WORKSPACE_NAV.map((item) => (
              <NavCommandItem key={item.href} item={item} onSelect={navigate} />
            ))}
            <NavCommandItem item={SETTINGS_NAV} onSelect={navigate} />
            {SETTINGS_CATEGORIES.map((item) => (
              <NavCommandItem key={item.href} item={item} onSelect={navigate} />
            ))}
            <NavCommandItem item={ACCOUNT_NAV} onSelect={navigate} />
            {isAdmin && <NavCommandItem item={ADMIN_NAV} onSelect={navigate} />}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Do">
            {DO_ACTIONS.map((action) => (
              <CommandItem key={action.id} value={action.label} onSelect={() => navigate(action.href)}>
                <action.icon aria-hidden="true" className="size-4 text-muted-foreground" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{action.label}</span>
                </span>
                <span className="text-xs text-muted-foreground">{action.hint}</span>
              </CommandItem>
            ))}
            <CommandItem value="Toggle theme" onSelect={toggleTheme}>
              {isDark ? (
                <Sun aria-hidden="true" className="size-4 text-muted-foreground" />
              ) : (
                <Moon aria-hidden="true" className="size-4 text-muted-foreground" />
              )}
              Toggle theme
              <span className="ml-auto text-xs text-muted-foreground">
                {isDark ? "Switch to light" : "Switch to dark"}
              </span>
            </CommandItem>
          </CommandGroup>
        </CommandList>

        <div className="flex items-center justify-center gap-1 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
          <span>↑↓ navigate</span>
          <span aria-hidden="true">·</span>
          <span>↵ open</span>
          <span aria-hidden="true">·</span>
          <span>esc close</span>
        </div>
      </Command>
    </CommandDialog>
  )
}
