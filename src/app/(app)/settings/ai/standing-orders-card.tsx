"use client"

// Standing orders card for the Settings hub -> AI behaviour — persistent
// owner instructions the FrontDesk AI weaves into every reply while active
// (see src/lib/standing-orders.ts for the prompt-injection side and
// ./standing-orders-actions.ts for the CRUD). List of active orders
// (instruction, expiry countdown, created date) + an add form (textarea
// capped at 300 chars, quick expiry chips — no custom datetime picker) + a
// deactivate button per order. Reuses ../business/faq-card.tsx's
// list/expand/add-form shell conventions (motion, empty state, demo-mode
// toast) so the two Settings cards read like one family.
//
// Redesign R2 note: this card no longer advertises the "[no-followups]"
// magic string in its copy — proactive follow-ups now have their own honest
// toggle (Settings -> AI behaviour -> "Proactive follow-ups", backed by
// business_brain.follow_ups_enabled). The token still works as a legacy
// escape hatch (src/lib/follow-ups.ts#hasFollowUpsPausedToken), it's just no
// longer the ONLY way to pause them, so it doesn't need top billing here.

import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ClipboardList, Plus, Trash2, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardIcon, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { duration, easing } from "@/lib/motion"
import { cn } from "@/lib/utils"
import type { StandingOrder } from "@/lib/types"

import { addStandingOrder, deactivateStandingOrder } from "./standing-orders-actions"

const MAX_INSTRUCTION_LENGTH = 300
const MAX_ACTIVE_STANDING_ORDERS = 5
const DAY_MS = 24 * 60 * 60 * 1000

type ExpiryChoice = "1d" | "3d" | "1w" | "none"

const EXPIRY_OPTIONS: { id: ExpiryChoice; label: string; days: number | null }[] = [
  { id: "1d", label: "1 day", days: 1 },
  { id: "3d", label: "3 days", days: 3 },
  { id: "1w", label: "1 week", days: 7 },
  { id: "none", label: "No expiry", days: null },
]

function computeExpiresAt(choice: ExpiryChoice): string | null {
  const option = EXPIRY_OPTIONS.find((candidate) => candidate.id === choice)
  if (!option || option.days === null) return null
  return new Date(Date.now() + option.days * DAY_MS).toISOString()
}

/** "3 days left" / "less than a day left" / "no expiry" / "expired" — expired orders shouldn't normally appear (the list only ever loads active ones), but this stays honest if one's mid-transition. */
function formatExpiry(expiresAt: string | null): string {
  if (!expiresAt) return "No expiry"
  const msLeft = new Date(expiresAt).getTime() - Date.now()
  if (msLeft <= 0) return "Expired"
  const daysLeft = Math.ceil(msLeft / DAY_MS)
  if (daysLeft <= 1) return "Less than a day left"
  return `${daysLeft} days left`
}

function formatCreatedAt(createdAt: string): string {
  return new Date(createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

type StandingOrdersCardProps = {
  initialOrders: StandingOrder[]
  /** False in demo mode (Supabase unconfigured) — edits only update local state. */
  isLive: boolean
  className?: string
}

export function StandingOrdersCard({ initialOrders, isLive, className }: StandingOrdersCardProps) {
  const [orders, setOrders] = useState<StandingOrder[]>(initialOrders)
  const [adding, setAdding] = useState(false)
  const [draftInstruction, setDraftInstruction] = useState("")
  const [expiryChoice, setExpiryChoice] = useState<ExpiryChoice>("none")
  const [pending, setPending] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const reduceMotion = useReducedMotion()

  const atCap = orders.length >= MAX_ACTIVE_STANDING_ORDERS

  function startAdd() {
    setAdding(true)
    setDraftInstruction("")
    setExpiryChoice("none")
  }

  function cancelAdd() {
    setAdding(false)
    setDraftInstruction("")
    setExpiryChoice("none")
  }

  async function saveDraft() {
    const trimmed = draftInstruction.trim()
    if (!trimmed || atCap) return

    if (!isLive) {
      const demoOrder: StandingOrder = {
        id: `demo-standing-order-${Date.now()}`,
        org_id: "demo",
        instruction: trimmed,
        expires_at: computeExpiresAt(expiryChoice),
        active: true,
        created_at: new Date().toISOString(),
      }
      setOrders((prev) => [demoOrder, ...prev])
      toast.success("Standing order added", { description: "Demo mode — changes aren't saved." })
      cancelAdd()
      return
    }

    setPending(true)
    const result = await addStandingOrder(trimmed, computeExpiresAt(expiryChoice))
    setPending(false)

    if (!result.ok || !result.order) {
      const description =
        result.reason === "at-cap"
          ? `You can only have up to ${MAX_ACTIVE_STANDING_ORDERS} active standing orders at once.`
          : "Please try again."
      toast.error("Couldn't add standing order", { description })
      return
    }

    setOrders((prev) => [result.order as StandingOrder, ...prev])
    toast.success("Standing order added")
    cancelAdd()
  }

  async function removeOrder(id: string) {
    const previous = orders
    setRemovingId(id)
    setOrders((prev) => prev.filter((order) => order.id !== id))

    if (!isLive) {
      toast.success("Standing order deactivated", { description: "Demo mode — changes aren't saved." })
      setRemovingId(null)
      return
    }

    const result = await deactivateStandingOrder(id)
    setRemovingId(null)

    if (!result.ok) {
      setOrders(previous)
      toast.error("Couldn't deactivate standing order", { description: "Please try again." })
      return
    }
    toast.success("Standing order deactivated")
  }

  return (
    <Card className={cn("max-w-2xl", className)}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardIcon>
            <ClipboardList />
          </CardIcon>
          <CardTitle>Standing orders</CardTitle>
        </div>
        <CardDescription>
          Running instructions the AI follows in every reply while active — &quot;I&apos;m at a wedding till Sunday,
          tell people I&apos;ll be slow&quot; or &quot;registrations are closed, stop taking signups.&quot;
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {orders.length === 0 && !adding ? (
          <p className="text-sm text-muted-foreground">
            No standing orders yet — add one to give the AI a running instruction to follow.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-xl ring-1 ring-foreground/10">
            <AnimatePresence initial={false}>
              {orders.map((order) => (
                <motion.li
                  key={order.id}
                  initial={reduceMotion ? false : { opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={reduceMotion ? undefined : { opacity: 0, height: 0 }}
                  transition={{ duration: duration.base, ease: easing.out }}
                  className="overflow-hidden"
                >
                  <div className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="flex min-w-0 flex-col gap-1">
                      <p className="text-sm break-words text-foreground">{order.instruction}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatExpiry(order.expires_at)} · added {formatCreatedAt(order.created_at)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeOrder(order.id)}
                      disabled={removingId === order.id}
                      className="shrink-0"
                    >
                      <Trash2 aria-hidden="true" data-icon="inline-start" className="size-3.5" />
                      Deactivate
                    </Button>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}

        {adding ? (
          <div className="flex flex-col gap-2 rounded-xl bg-muted/30 px-4 py-3 ring-1 ring-foreground/10">
            <div className="flex flex-col gap-1">
              <Textarea
                value={draftInstruction}
                onChange={(event) => setDraftInstruction(event.target.value.slice(0, MAX_INSTRUCTION_LENGTH))}
                placeholder="e.g. I'm out sick today, tell people replies might be a bit slower"
                aria-label="Standing order instruction"
                autoFocus
                className="min-h-20"
              />
              <span className="self-end text-[0.7rem] text-muted-foreground tabular-nums">
                {draftInstruction.length}/{MAX_INSTRUCTION_LENGTH}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Expiry">
              {EXPIRY_OPTIONS.map((option) => (
                <Button
                  key={option.id}
                  type="button"
                  size="sm"
                  variant={expiryChoice === option.id ? "default" : "outline"}
                  className="h-7 px-2.5 text-xs"
                  onClick={() => setExpiryChoice(option.id)}
                  aria-pressed={expiryChoice === option.id}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={cancelAdd} disabled={pending}>
                <X aria-hidden="true" data-icon="inline-start" className="size-3.5" />
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={saveDraft} disabled={!draftInstruction.trim() || pending}>
                {pending ? "Saving…" : "Add standing order"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={startAdd}
              disabled={atCap}
              className="self-start gap-1.5"
            >
              <Plus aria-hidden="true" className="size-3.5" />
              Add a standing order
            </Button>
            {atCap && (
              <p className="text-xs text-muted-foreground">
                You&apos;re at the limit of {MAX_ACTIVE_STANDING_ORDERS} active standing orders — deactivate one to
                add another.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
