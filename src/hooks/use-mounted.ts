import * as React from "react"

// Hydration-safe "has the client mounted yet" flag, for gating browser-only
// reads (localStorage, ResizeObserver-driven libs like Recharts) without a
// post-mount setState — mirrors the useSyncExternalStore pattern in
// src/hooks/use-mobile.ts. Required by the react-hooks/set-state-in-effect
// lint rule (calling setState synchronously inside a useEffect body is
// flagged; useSyncExternalStore is the sanctioned escape hatch for this
// exact "value only known on the client" case).

function subscribe() {
  return () => {}
}

function getSnapshot() {
  return true
}

function getServerSnapshot() {
  return false
}

/** True only after the component has mounted on the client. */
export function useMounted(): boolean {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
