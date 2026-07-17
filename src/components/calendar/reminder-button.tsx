"use client"

import { useEffect, useRef, useState } from "react"
import { Bell, BellRing, Copy } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import type { DemoPost } from "@/app/(app)/calendar/demo-posts"

const REMINDER_LEAD_MS = 10 * 60 * 1000
const STORAGE_KEY = "localos:queue-reminders"

/** Reminders more than this far out are refused — see handleClick's early return below. */
const MAX_REMINDER_LEAD_MS = 21 * 24 * 60 * 60 * 1000 // 21 days
/** setTimeout's delay is a 32-bit signed int internally; anything larger silently fires immediately. Clamp defensively even though MAX_REMINDER_LEAD_MS is already well under this. */
const MAX_SET_TIMEOUT_DELAY_MS = 2 ** 31 - 1
/** Sanity ceiling for a persisted caption — matches the shape validated below, not any real UI limit. */
const MAX_STORED_CAPTION_LENGTH = 500

type StoredReminder = { fireAt: string; caption: string; postDate: string }
type ReminderStore = Record<string, StoredReminder>

function clampDelay(delayMs: number): number {
  return Math.min(Math.max(delayMs, 0), MAX_SET_TIMEOUT_DELAY_MS)
}

/** Validates a parsed localStorage entry's shape instead of blindly type-asserting it — untrusted input (another tab, a stale schema, manual edits). */
function isValidStoredReminder(value: unknown): value is StoredReminder {
  if (!value || typeof value !== "object") return false
  const candidate = value as Record<string, unknown>

  if (typeof candidate.fireAt !== "string" || !Number.isFinite(new Date(candidate.fireAt).getTime())) {
    return false
  }
  if (typeof candidate.caption !== "string" || candidate.caption.length > MAX_STORED_CAPTION_LENGTH) {
    return false
  }
  if (typeof candidate.postDate !== "string" || !Number.isFinite(new Date(candidate.postDate).getTime())) {
    return false
  }
  return true
}

function readStore(): ReminderStore {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") return {}

    const store: ReminderStore = {}
    for (const [postId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (isValidStoredReminder(value)) {
        store[postId] = value
      }
    }
    return store
  } catch {
    return {}
  }
}

function writeStore(store: ReminderStore) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // best-effort — localStorage can be unavailable (private mode, quota); the reminder just won't survive a reload.
  }
}

function clearStoredReminder(postId: string) {
  const store = readStore()
  delete store[postId]
  writeStore(store)
}

/** Keeps the system notification body short and legible. */
function captionSnippet(caption: string): string {
  const trimmed = caption.trim()
  return trimmed.length <= 90 ? trimmed : `${trimmed.slice(0, 90).trimEnd()}…`
}

type ReminderButtonProps = {
  post: DemoPost
  className?: string
}

/**
 * ★ Reminder-to-post (MVP): schedules a client-side Notification 10 minutes
 * before the post's scheduled time, while the app stays open in a tab. True
 * Web Push (fires even when the tab/app is closed) lands with Phase 2's push
 * infrastructure — this is the manual "push → copy → paste" flow's push half.
 */
export function ReminderButton({ post, className }: ReminderButtonProps) {
  const [armed, setArmed] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function fire(caption: string) {
    clearStoredReminder(post.id)
    setArmed(false)
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      const notification = new Notification("Time to post", { body: captionSnippet(caption) })
      notification.onclick = () => {
        window.focus()
        window.location.href = "/calendar?view=queue"
      }
    }
  }

  // Best-effort re-arm: a reload wipes JS timers, but a still-future
  // reminder recorded in localStorage before the reload can be rescheduled.
  useEffect(() => {
    const stored = readStore()[post.id]
    if (!stored) return

    // The post this reminder was armed for may have been rescheduled since
    // (a different date/time) — a stored reminder tied to a stale date is
    // meaningless (or actively wrong) now, so drop it rather than firing at
    // the old time.
    if (stored.postDate !== post.date) {
      clearStoredReminder(post.id)
      return
    }

    const delay = new Date(stored.fireAt).getTime() - Date.now()
    if (delay <= 0 || delay > MAX_REMINDER_LEAD_MS) {
      clearStoredReminder(post.id)
      return
    }
    // Deliberate setState-in-effect: re-arming a persisted reminder is a
    // one-time sync from an external system (localStorage + a real browser
    // timer) on mount, not state derivable from props/render — the intended
    // escape hatch for this rule (SSR/first paint always render un-armed,
    // matching pre-hydration state; this flips it true right after mount
    // once we know the tab is actually open to hold the timer).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setArmed(true)
    timeoutRef.current = setTimeout(() => fire(stored.caption), clampDelay(delay))
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire() intentionally stable per post.id (post props don't change once queued)
  }, [post.id])

  // Clears a timer armed via handleClick (not the re-arm effect above) if
  // this card unmounts before it fires.
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  async function handleClick() {
    if (armed) return
    if (typeof window === "undefined" || !("Notification" in window)) {
      toast.error("Notifications aren't supported in this browser")
      return
    }

    let permission = Notification.permission
    if (permission === "default") {
      permission = await Notification.requestPermission()
    }
    if (permission === "denied") {
      toast.error("Notifications are blocked", {
        description: "Enable notifications for this site in your browser settings to get reminders.",
      })
      return
    }

    const fireAt = new Date(post.date).getTime() - REMINDER_LEAD_MS
    const delay = fireAt - Date.now()
    if (delay <= 0) {
      toast.info("This post is already due", {
        description: "It's within 10 minutes of its scheduled time.",
      })
      return
    }
    if (delay > MAX_REMINDER_LEAD_MS) {
      toast.info("Reminders work up to 3 weeks ahead for now", {
        description: "Come back closer to the post date to set this one.",
      })
      return
    }

    writeStore({
      ...readStore(),
      [post.id]: { fireAt: new Date(fireAt).toISOString(), caption: post.caption, postDate: post.date },
    })
    setArmed(true)
    timeoutRef.current = setTimeout(() => fire(post.caption), clampDelay(delay))
    toast.success("Reminder set", {
      description: "We'll notify you 10 minutes before it's time to post.",
    })
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={armed}
      onClick={handleClick}
      className={cn("gap-1.5", className)}
    >
      {armed ? (
        <BellRing aria-hidden="true" className="size-3.5 text-primary" />
      ) : (
        <Bell aria-hidden="true" className="size-3.5" />
      )}
      {armed ? "Reminder set" : "Remind me"}
    </Button>
  )
}

type CopyCaptionButtonProps = {
  post: DemoPost
  className?: string
}

/** Manual-post flow's "copy" half: copies the caption (+ hashtags, when present) to paste into the platform's own composer. */
export function CopyCaptionButton({ post, className }: CopyCaptionButtonProps) {
  async function handleClick() {
    const hashtagLine =
      post.hashtags && post.hashtags.length > 0
        ? `\n\n${post.hashtags.map((tag) => `#${tag}`).join(" ")}`
        : ""

    try {
      await navigator.clipboard.writeText(`${post.caption}${hashtagLine}`)
      toast.success("Caption copied", { description: "Paste it into the platform's app to post." })
    } catch {
      toast.error("Couldn't copy caption", { description: "Please try again." })
    }
  }

  return (
    <Button type="button" variant="ghost" size="sm" onClick={handleClick} className={cn("gap-1.5", className)}>
      <Copy aria-hidden="true" className="size-3.5" />
      Copy caption
    </Button>
  )
}
