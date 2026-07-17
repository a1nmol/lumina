import { format, isToday, isTomorrow, parseISO } from "date-fns"

import type { DemoPost } from "./demo-posts"

/** yyyy-MM-dd key derived from a post's scheduled date — the grouping unit for every view. */
export function dayKeyOfPost(post: DemoPost): string {
  return format(parseISO(post.date), "yyyy-MM-dd")
}

export function groupPostsByDayKey(posts: DemoPost[]): Map<string, DemoPost[]> {
  const map = new Map<string, DemoPost[]>()
  for (const post of posts) {
    const key = dayKeyOfPost(post)
    const list = map.get(key)
    if (list) list.push(post)
    else map.set(key, [post])
  }
  return map
}

/** "Today" / "Tomorrow" / full weekday+date — the queue-list group heading. */
export function queueHeading(date: Date): string {
  if (isToday(date)) return "Today"
  if (isTomorrow(date)) return "Tomorrow"
  return format(date, "EEEE, MMMM d")
}
