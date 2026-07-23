"use client"

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
import { toast } from "sonner"

import { DEMO_CONVERSATIONS } from "@/lib/demo"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import type { ConversationChannel } from "@/lib/types"

/**
 * Instant-lead-alert data model — a toast is never the only record of an
 * alert, it always lands in this provider's `alerts` list too (persistent
 * notification tray). See "AI transparency rules" in
 * docs/design-briefs/phase-2-inbox-frontdesk-crm.md.
 */
export type NotificationAlertType = "new_lead" | "escalated" | "booking"

export type NotificationAlert = {
  id: string
  type: NotificationAlertType
  contactName: string
  channel: ConversationChannel
  /** One-line reason shown in the tray row + toast description. */
  reason: string
  createdAt: string
  /** Where "View" navigates — always the Inbox for now. */
  href: string
}

export type NotificationAlertWithReadState = NotificationAlert & { read: boolean }

type NotificationsContextValue = {
  alerts: NotificationAlertWithReadState[]
  unreadCount: number
  addAlert: (alert: NotificationAlert) => void
  markAllRead: () => void
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null)

// Renamed from "localos:" during the LocalOS → Lumina rename; device-local
// convenience state only, so we accept a one-time reset rather than migrate.
const READ_STORAGE_KEY = "lumina:notifications:read-ids"
const DEMO_TOAST_SESSION_KEY = "lumina:notifications:demo-toast-fired"
/** Demo mode only: how long after mount the simulated "new lead" alert arrives. */
const SIMULATED_ALERT_DELAY_MS = 20_000

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

/** Validates a parsed localStorage entry's shape instead of blindly type-asserting it — untrusted input (another tab, a stale schema, manual edits). Mirrors the pattern in src/components/calendar/reminder-button.tsx. */
function readReadIds(): Set<string> {
  if (typeof window === "undefined") return new Set()
  try {
    const raw = window.localStorage.getItem(READ_STORAGE_KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    return isStringArray(parsed) ? new Set(parsed) : new Set()
  } catch {
    return new Set()
  }
}

function writeReadIds(ids: Set<string>) {
  try {
    window.localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(Array.from(ids)))
  } catch {
    // best-effort — localStorage can be unavailable (private mode, quota); read state just won't survive a reload.
  }
}

/**
 * Demo seed: the escalated + ai_draft threads in DEMO_CONVERSATIONS become
 * alerts (they're exactly the two named AI states that need a human), plus
 * one "booking" alert for the loop-closing outcome of the ai_answered thread
 * that resulted in a real appointment — giving the tray one example of each
 * icon-ring type on first load. Stable ids/order (sorted newest first).
 */
function buildDemoAlerts(): NotificationAlert[] {
  const escalated = DEMO_CONVERSATIONS.find((c) => c.ai_state === "escalated")
  const drafted = DEMO_CONVERSATIONS.find((c) => c.ai_state === "ai_draft")

  const alerts: NotificationAlert[] = []

  if (escalated) {
    alerts.push({
      id: `demo-alert-${escalated.id}`,
      type: "escalated",
      contactName: escalated.contact_name ?? "Unknown contact",
      channel: escalated.channel,
      reason: "I couldn't answer this — flagging for you (allergy safety question).",
      createdAt: escalated.last_message_at ?? escalated.created_at,
      href: "/inbox",
    })
  }

  if (drafted) {
    alerts.push({
      id: `demo-alert-${drafted.id}`,
      type: "new_lead",
      contactName: drafted.contact_name ?? "Unknown contact",
      channel: drafted.channel,
      reason: "New catering inquiry — AI drafted a reply, needs your review.",
      createdAt: drafted.last_message_at ?? drafted.created_at,
      href: "/inbox",
    })
  }

  alerts.push({
    id: "demo-alert-booking-1",
    type: "booking",
    contactName: "Emma Rodriguez",
    channel: "web_chat",
    reason: "Booked: Custom Birthday Cake pickup, Saturday morning.",
    createdAt: "2026-07-14T15:06:00.000Z",
    href: "/inbox",
  })

  return alerts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

/** Demo mode only: the "new alert arrives while you're using the app" moment — ties back to demo-contact-10 (Noah Fitzgerald) so the tray → Inbox → Contacts story stays coherent. */
function buildSimulatedLeadAlert(): NotificationAlert {
  return {
    id: `demo-alert-live-${Date.now()}`,
    type: "new_lead",
    contactName: "Noah Fitzgerald",
    channel: "form",
    reason: "New form submission — asking about catering for 40 people next month.",
    createdAt: new Date().toISOString(),
    href: "/inbox",
  }
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [alerts, setAlerts] = useState<NotificationAlert[]>([])
  const [readIds, setReadIds] = useState<Set<string>>(new Set())

  const addAlert = useCallback(
    (alert: NotificationAlert) => {
      setAlerts((current) => (current.some((a) => a.id === alert.id) ? current : [alert, ...current]))
      // The toast is never the only record — it fires alongside the tray entry
      // above, never instead of it. aria-live announcement is handled by sonner.
      toast(alert.contactName, {
        description: alert.reason,
        duration: 8000,
        classNames: { toast: "border-l-2 border-l-primary" },
        action: {
          label: "View",
          onClick: () => router.push(alert.href),
        },
      })
    },
    [router]
  )

  // Deliberate setState-in-effect: hydrating persisted read-state + seeding
  // demo alerts is a one-time sync from an external system (localStorage +
  // the demo dataset) on mount, not state derivable from props/render — the
  // same reviewed pattern as src/components/calendar/reminder-button.tsx.
  // localStorage isn't available during SSR, and demo data shouldn't leak
  // into a connected org's first paint.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReadIds(readReadIds())
    if (!isSupabaseConfigured()) {
      setAlerts(buildDemoAlerts())
    }
    // TODO(live mode): once org realtime channel connections land, subscribe to
    // Supabase realtime on `conversations`/`messages` inserts scoped to the
    // current org (RLS-enforced) and map new escalated / ai_draft / booked rows
    // into NotificationAlert entries via addAlert() here instead of the demo seed.
  }, [])

  // Demo mode only: simulate one alert arriving after the app has been open a
  // while, once per browser session (sessionStorage guard survives client-side
  // navigation, resets on a fresh tab).
  useEffect(() => {
    if (isSupabaseConfigured()) return
    if (typeof window === "undefined") return
    if (window.sessionStorage.getItem(DEMO_TOAST_SESSION_KEY)) return

    const timer = setTimeout(() => {
      window.sessionStorage.setItem(DEMO_TOAST_SESSION_KEY, "1")
      addAlert(buildSimulatedLeadAlert())
    }, SIMULATED_ALERT_DELAY_MS)

    return () => clearTimeout(timer)
  }, [addAlert])

  const markAllRead = useCallback(() => {
    setReadIds((prev) => {
      const next = new Set(prev)
      for (const alert of alerts) next.add(alert.id)
      writeReadIds(next)
      return next
    })
  }, [alerts])

  const alertsWithReadState = useMemo<NotificationAlertWithReadState[]>(
    () => alerts.map((alert) => ({ ...alert, read: readIds.has(alert.id) })),
    [alerts, readIds]
  )

  const unreadCount = useMemo(
    () => alertsWithReadState.reduce((count, a) => count + (a.read ? 0 : 1), 0),
    [alertsWithReadState]
  )

  const value = useMemo<NotificationsContextValue>(
    () => ({ alerts: alertsWithReadState, unreadCount, addAlert, markAllRead }),
    [alertsWithReadState, unreadCount, addAlert, markAllRead]
  )

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext)
  if (!ctx) {
    throw new Error("useNotifications must be used within a NotificationsProvider")
  }
  return ctx
}
