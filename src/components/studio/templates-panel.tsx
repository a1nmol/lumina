"use client"

import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ChevronDown, Sparkles, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useMounted } from "@/hooks/use-mounted"
import { duration, easing } from "@/lib/motion"
import { cn } from "@/lib/utils"

import { deleteTemplateAction } from "@/app/(app)/studio/actions"
import { PLATFORM_LABELS, type StudioTemplate } from "@/app/(app)/studio/types"

import { FORMAT_META } from "./format-segmented"
import { PLATFORM_META } from "./platform-chip"

function snippet(text: string, max: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max).trimEnd()}…`
}

// Manual-collapse persistence (Redesign wave R4) — the strip defaults OPEN
// whenever the user has templates (collapsed only when there are none, via
// the early empty-state return below) but once the user manually toggles it,
// that choice is remembered across sessions. Mirrors the read/write-
// localStorage pattern in src/components/analytics/insight-banner.tsx: a
// plain string flag ("true"/"false"), read directly during render (gated by
// `useMounted`) rather than synced into state from an effect.
const OPEN_STORAGE_KEY = "lumina:studio:templates-panel-open"

function readStoredOpen(): boolean | null {
  try {
    const raw = window.localStorage.getItem(OPEN_STORAGE_KEY)
    if (raw === "true") return true
    if (raw === "false") return false
    return null
  } catch {
    return null
  }
}

function writeStoredOpen(open: boolean) {
  try {
    window.localStorage.setItem(OPEN_STORAGE_KEY, String(open))
  } catch {
    // Best-effort — private browsing / storage quota shouldn't break the strip.
  }
}

type TemplatesPanelProps = {
  templates: StudioTemplate[]
  onUse: (template: StudioTemplate) => void
  /** Disables "Use" while a generation is already in flight. */
  disabled?: boolean
  className?: string
}

/**
 * ★ Save-as-template / regenerate-from-template — a collapsible strip of
 * saved templates above the Composer's prompt bar. "Use" fills the prompt
 * bar and immediately regenerates; delete calls the real
 * deleteTemplateAction (src/app/(app)/studio/actions.ts), optimistically
 * removing the card and reverting it if the delete fails.
 */
export function TemplatesPanel({ templates, onUse, disabled, className }: TemplatesPanelProps) {
  const reduceMotion = useReducedMotion()
  const mounted = useMounted()
  const [items, setItems] = useState(templates)
  // `openVersion` isn't read directly — it exists purely to force the
  // render-time localStorage read below to re-run after a manual toggle.
  const [openVersion, setOpenVersion] = useState(0)
  void openVersion

  const storedOpen = mounted ? readStoredOpen() : null
  // Default OPEN whenever there are templates (this function only ever
  // renders that strip when items.length > 0 — see the empty-state return
  // below) unless the user has explicitly toggled it before.
  const open = storedOpen ?? items.length > 0

  function toggleOpen() {
    const next = !open
    writeStoredOpen(next)
    setOpenVersion((version) => version + 1)
  }

  async function handleDelete(id: string, name: string) {
    const previousItems = items
    setItems((current) => current.filter((item) => item.id !== id))

    try {
      const result = await deleteTemplateAction(id)
      if (result.ok) {
        toast(`Removed "${name}"`, {
          description: result.demoOnly ? "Hidden for this session." : "It won't show up here anymore.",
        })
      } else {
        setItems(previousItems)
        toast.error(`Couldn't remove "${name}"`, { description: "Please try again." })
      }
    } catch {
      setItems(previousItems)
      toast.error(`Couldn't remove "${name}"`, { description: "Please try again." })
    }
  }

  if (items.length === 0) {
    return (
      <p className={cn("px-0.5 text-xs text-muted-foreground", className)}>
        Templates you save will appear here.
      </p>
    )
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <button
        type="button"
        onClick={toggleOpen}
        aria-expanded={open}
        aria-controls="studio-templates-strip"
        className="inline-flex w-fit items-center gap-1.5 rounded-md px-0.5 py-1 text-sm font-medium text-foreground outline-none transition-colors hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-3.5 text-muted-foreground transition-transform duration-150",
            open && "rotate-180"
          )}
        />
        Templates
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
          {items.length}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id="studio-templates-strip"
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: duration.base, ease: easing.out }}
            className="overflow-hidden"
          >
            <div className="flex gap-2 overflow-x-auto pb-1">
              {items.map((template) => {
                const FormatIcon = FORMAT_META[template.format].icon

                return (
                  <div
                    key={template.id}
                    className="group/template relative flex w-56 shrink-0 flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-soft transition-shadow duration-150 hover:shadow-raised"
                  >
                    <button
                      type="button"
                      onClick={() => handleDelete(template.id, template.name)}
                      aria-label={`Delete template "${template.name}"`}
                      className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full text-muted-foreground opacity-0 outline-none transition-opacity duration-150 group-hover/template:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <X aria-hidden="true" className="size-3" />
                    </button>

                    <div className="flex items-center gap-1.5 pr-5">
                      <FormatIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate text-sm font-medium text-foreground">{template.name}</span>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {template.platforms.map((platform) => {
                        const Icon = PLATFORM_META[platform].icon
                        return (
                          <span
                            key={platform}
                            title={PLATFORM_LABELS[platform]}
                            className="flex size-5 items-center justify-center rounded-full bg-muted text-muted-foreground"
                          >
                            <Icon aria-hidden="true" className="size-3" />
                          </span>
                        )
                      })}
                    </div>

                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {snippet(template.caption || template.prompt, 50)}
                    </p>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={disabled}
                      onClick={() => onUse(template)}
                      className="mt-auto gap-1.5"
                    >
                      <Sparkles aria-hidden="true" className="size-3.5" />
                      Use
                    </Button>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
