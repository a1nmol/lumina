"use client"

import { useEffect } from "react"

import { markDashboardSeen } from "@/app/(app)/dashboard/actions"

/**
 * Invisible — fires once per Command Center mount to advance the "last
 * seen" cookie (src/lib/last-seen.ts) for the NEXT visit's "while you were
 * away" digest. Renders nothing; never mount this before the digest for
 * the current visit has already been computed server-side.
 */
export function DigestSeenTracker() {
  useEffect(() => {
    void markDashboardSeen()
  }, [])

  return null
}
