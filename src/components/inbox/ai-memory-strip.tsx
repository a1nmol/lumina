"use client"

// Glanceable "AI memory" strip for the Inbox thread view (Commander update,
// migration 0015 conversations.ai_memory — see
// src/lib/ai/conversation-memory.ts). Sits under the conversation header,
// above the composer. Quiet by design: a single-line collapsed trigger that
// expands to the rolling summary + unresolved-thread chips — an aid for the
// owner skimming a thread, never a hero element.
//
// Deliberately does NOT import src/lib/ai/conversation-memory.ts (a
// "server-only" module — see its header) from this client component; no
// client component in this codebase imports from src/lib/ai/* today, and
// reaching into a server-only module from the client risks a build-time
// failure the moment any of its other exports touch Supabase/OpenRouter.
// Instead this does its own tiny, display-only defensive parse of the same
// stored shape ({ summary, open_threads, ... }) — reusing the Accordion
// primitive (src/components/ui/accordion.tsx) that src/components/inbox/context-pane.tsx
// already uses for "Previous conversations", which respects
// prefers-reduced-motion for free via the global CSS override in globals.css.

import { BrainCircuit } from "lucide-react"

import { Accordion, AccordionItem, AccordionPanel, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type AiMemoryStripProps = {
  /** The conversation's raw `ai_memory` column value. */
  aiMemory: Record<string, unknown> | null
  className?: string
}

type DisplayMemory = {
  summary: string
  openThreads: string[]
}

/** Display-only defensive parse — see the module header for why this doesn't share src/lib/ai/conversation-memory.ts#parseConversationMemory. Returns null when there's nothing worth rendering. */
function parseForDisplay(json: Record<string, unknown> | null): DisplayMemory | null {
  if (!json || typeof json !== "object") return null

  const summary = typeof json.summary === "string" ? json.summary.trim() : ""
  const openThreads = Array.isArray(json.open_threads)
    ? json.open_threads.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : []

  if (!summary && openThreads.length === 0) return null
  return { summary, openThreads }
}

export function AiMemoryStrip({ aiMemory, className }: AiMemoryStripProps) {
  const memory = parseForDisplay(aiMemory)
  if (!memory) return null

  return (
    <Accordion className={cn("shrink-0 border-b border-border px-3 sm:px-4", className)}>
      <AccordionItem value="ai-memory" className="border-b-0">
        <AccordionTrigger className="py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
          <span className="inline-flex items-center gap-1.5">
            <BrainCircuit aria-hidden="true" className="size-3.5" />
            What I remember about them
          </span>
        </AccordionTrigger>
        <AccordionPanel className="text-xs text-muted-foreground">
          {memory.summary && <p className="leading-relaxed">{memory.summary}</p>}
          {memory.openThreads.length > 0 && (
            <div className={cn("flex flex-wrap gap-1", memory.summary && "mt-2")}>
              {memory.openThreads.map((thread, index) => (
                <Badge key={`${index}-${thread}`} variant="outline" className="h-auto whitespace-normal py-0.5 text-left font-normal">
                  {thread}
                </Badge>
              ))}
            </div>
          )}
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  )
}
