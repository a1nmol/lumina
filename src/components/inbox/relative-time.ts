// Small, dependency-free relative/absolute time helpers for the Inbox —
// deliberately not added to src/lib since this task shouldn't touch it.

/** "now" / "5m" / "3h" / "2d" / "Jul 9" — compact relative time for thread-list rows. */
export function formatRelativeTime(iso: string | null): string {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""

  const diffSec = Math.round((Date.now() - date.getTime()) / 1000)
  if (diffSec < 60) return "now"

  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m`

  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h`

  const diffDay = Math.round(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d`

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

/** "9:41 AM" — message bubble timestamp. */
export function formatMessageTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
}

/** "Thursday, July 16 at 9:41 AM" — full timestamp for tooltips/aria-labels. */
export function formatFullTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}
