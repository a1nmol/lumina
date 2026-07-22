"use client"

import { useState } from "react"
import { BellCheck, BellPlus, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { subscribeToPush } from "@/app/(app)/calendar/push-actions"
import { Button } from "@/components/ui/button"
import { urlBase64ToUint8Array } from "@/lib/push-client"
import { cn } from "@/lib/utils"

const ENABLED_STORAGE_KEY = "localos:push-enabled"

function readEnabledFlag(): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(ENABLED_STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

/**
 * Calendar PageHeader entry point for the reminder-to-post push flow
 * (MASTER_PLAN.md §4.B): requests Notification permission, subscribes the
 * browser via the service worker's PushManager, saves the subscription, and
 * fires an immediate confirmation push so the click gets real, instant
 * proof it worked — not just an optimistic toast.
 */
export function EnablePushButton({ className }: { className?: string }) {
  const [enabled, setEnabled] = useState(readEnabledFlag)
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    if (enabled || loading) return
    setLoading(true)

    try {
      if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
        toast.error("Notifications aren't supported in this browser")
        return
      }

      let permission = Notification.permission
      if (permission === "default") {
        permission = await Notification.requestPermission()
      }
      if (permission === "denied") {
        toast.error("Notifications are blocked", {
          description: "Enable notifications for this site in your browser settings, then try again.",
        })
        return
      }

      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidPublicKey) {
        // Demo mode / keys not provisioned yet — permission is still granted
        // (useful on its own for the in-tab ReminderButton timers), just no
        // server-push subscription to create.
        window.localStorage.setItem(ENABLED_STORAGE_KEY, "1")
        setEnabled(true)
        toast.success("Reminders enabled 🎉", {
          description: "You'll get in-app reminders 10 minutes before each post.",
        })
        return
      }

      const registration = await navigator.serviceWorker.ready
      let subscription = await registration.pushManager.getSubscription()
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        })
      }

      const result = await subscribeToPush(subscription.toJSON())
      if (!result.ok) {
        toast.error("Couldn't enable reminders", { description: "Please try again." })
        return
      }

      window.localStorage.setItem(ENABLED_STORAGE_KEY, "1")
      setEnabled(true)

      if (result.live) {
        toast.success("Reminders enabled 🎉", {
          description: "Check your notifications — a confirmation push just went out.",
        })
      } else {
        toast.success("Reminders enabled 🎉", {
          description: "You'll get in-app reminders 10 minutes before each post.",
        })
      }
    } catch {
      toast.error("Couldn't enable reminders", { description: "Please try again." })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={enabled || loading}
      onClick={handleClick}
      className={cn("gap-1.5", className)}
    >
      {loading ? (
        <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
      ) : enabled ? (
        <BellCheck aria-hidden="true" className="size-3.5 text-primary" />
      ) : (
        <BellPlus aria-hidden="true" className="size-3.5" />
      )}
      {enabled ? "Reminders on" : "Enable post reminders"}
    </Button>
  )
}
