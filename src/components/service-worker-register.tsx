"use client"

import { useEffect } from "react"

/**
 * Registers public/sw.js once on mount, app-wide. Silent by design — this is
 * plumbing (PWA installability + a receiver for Web Push), not a
 * user-visible action. Requesting notification permission and subscribing
 * happens separately, only when the user opts in via the Calendar's "Enable
 * post reminders" button (src/components/calendar/enable-push-button.tsx).
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Best-effort — an unregistered SW just means no push receipt and no
      // installability prompt; the rest of the app works fine without it.
    })
  }, [])

  return null
}
