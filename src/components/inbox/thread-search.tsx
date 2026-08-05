"use client"

// Natural-language memory search (Outlast wave 5, Part A) — "who asked about
// haircut prices last month?" answered over this org's own inbox. Lives at
// the top of the thread-list header (see thread-list.tsx). Submitting (Enter
// or the search button) calls src/app/(app)/inbox/actions.ts#searchInbox and
// opens an inline results panel ABOVE the regular thread list — never a
// modal — with the AI's short answer (when it produced one, styled like the
// rest of the app's AI-transparency moments — see reply-composer.tsx's
// whisper banner) followed by keyword-ranked result rows. Selecting a row
// reuses the SAME conversation-select handler ThreadRow uses, then clears
// and collapses back to the normal list.

import { useCallback, useId, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Search, Sparkles, X } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { duration, easing } from "@/lib/motion"
import { cn } from "@/lib/utils"

import { searchInbox, type InboxSearchResultRow } from "@/app/(app)/inbox/actions"

import { CHANNEL_GLYPHS } from "./channel-glyphs"

const MIN_QUERY_LENGTH = 2

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "results"; answer: string | null; results: InboxSearchResultRow[] }
  | { status: "error" }

type ThreadSearchProps = {
  /** The same handler ThreadRow's onSelect ultimately calls — a search result row picks a conversation exactly like clicking it in the list would. */
  onSelectConversation: (id: string) => void
  className?: string
}

export function ThreadSearch({ onSelectConversation, className }: ThreadSearchProps) {
  const reduceMotion = useReducedMotion()
  const inputId = useId()
  const [query, setQuery] = useState("")
  const [state, setState] = useState<SearchState>({ status: "idle" })
  // Guards against a stale response landing after a newer search (or a
  // clear) already superseded it — mirrors the `cancelled` pattern
  // src/components/inbox/inbox-shell.tsx uses for its detail fetch, just as
  // a monotonic counter since multiple submits can overlap here.
  const requestIdRef = useRef(0)

  const isOpen = state.status !== "idle"
  const isLoading = state.status === "loading"
  const canSubmit = query.trim().length >= MIN_QUERY_LENGTH && !isLoading

  const runSearch = useCallback(async (rawQuery: string) => {
    const trimmed = rawQuery.trim()
    if (trimmed.length < MIN_QUERY_LENGTH) return

    const requestId = ++requestIdRef.current
    setState({ status: "loading" })

    try {
      const result = await searchInbox(trimmed)
      if (requestIdRef.current !== requestId) return

      if ("error" in result) {
        if (result.error === "allowance") {
          toast.error("You're out of AI reply quota this month", { description: result.message })
        } else {
          toast.error("Couldn't search", { description: result.message })
        }
        setState({ status: "error" })
        return
      }

      setState({ status: "results", answer: result.answer, results: result.results })
    } catch {
      if (requestIdRef.current !== requestId) return
      toast.error("Couldn't search", { description: "Please try again." })
      setState({ status: "error" })
    }
  }, [])

  function handleClear() {
    requestIdRef.current += 1
    setQuery("")
    setState({ status: "idle" })
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return
    void runSearch(query)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Escape") return
    event.preventDefault()
    handleClear()
    event.currentTarget.blur()
  }

  function handleSelect(conversationId: string) {
    onSelectConversation(conversationId)
    handleClear()
  }

  return (
    <div className={cn("border-b border-border", className)}>
      <form role="search" onSubmit={handleSubmit} className="flex items-center gap-1.5 px-3 py-2">
        <div className="relative flex-1">
          <button
            type="submit"
            aria-label="Search conversations"
            disabled={!canSubmit}
            className="absolute top-1/2 left-1 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Search aria-hidden="true" className="size-3.5" />
          </button>
          <label htmlFor={inputId} className="sr-only">
            Search conversations
          </label>
          <Input
            id={inputId}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            placeholder="Search — “who asked about haircut prices?”"
            maxLength={200}
            aria-expanded={isOpen}
            className={cn("h-8 pl-7", (query.length > 0 || isOpen) && "pr-7")}
          />
          {(query.length > 0 || isOpen) && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={handleClear}
              className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X aria-hidden="true" className="size-3.5" />
            </button>
          )}
        </div>
      </form>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="thread-search-results"
            initial={reduceMotion ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: duration.fast, ease: easing.out }}
            className="overflow-hidden"
          >
            <div className="max-h-72 overflow-y-auto border-t border-border px-3 py-2.5">
              {state.status === "loading" && (
                <div className="space-y-2" aria-live="polite" aria-busy="true">
                  <span className="sr-only">Searching…</span>
                  <Skeleton className="h-8 w-full rounded-lg" />
                  <Skeleton className="h-9 w-full rounded-lg" />
                  <Skeleton className="h-9 w-3/4 rounded-lg" />
                </div>
              )}

              {state.status === "error" && (
                <p className="py-3 text-center text-xs text-muted-foreground">
                  Couldn&apos;t search — try again.
                </p>
              )}

              {state.status === "results" && (
                <div className="space-y-2">
                  {state.answer && (
                    <div
                      role="status"
                      className="flex items-start gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-2 text-xs text-primary"
                    >
                      <Sparkles aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                      <p className="leading-relaxed">{state.answer}</p>
                    </div>
                  )}

                  {state.results.length === 0 ? (
                    <p className="py-4 text-center text-xs text-muted-foreground">Nothing matched that.</p>
                  ) : (
                    <div role="list" aria-label="Search results" className="space-y-0.5">
                      {state.results.map((result) => {
                        const glyph = CHANNEL_GLYPHS[result.channel]
                        const Icon = glyph.icon
                        return (
                          <button
                            key={result.conversationId}
                            type="button"
                            role="listitem"
                            onClick={() => handleSelect(result.conversationId)}
                            className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                              <Icon aria-hidden="true" className="size-3" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5">
                                <span className="truncate text-xs font-medium text-foreground">
                                  {result.contactName ?? "Unknown contact"}
                                </span>
                                <Badge variant="outline" className="h-4 shrink-0 px-1.5 text-[10px] font-normal">
                                  {glyph.label}
                                </Badge>
                              </span>
                              {result.snippet && (
                                <span className="block truncate text-[11px] text-muted-foreground">
                                  {result.snippet}
                                </span>
                              )}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
