import type { Metadata } from "next"

import { listScheduledItems } from "@/lib/content"
import { getCurrentOrgId } from "@/lib/org"
import { isSupabaseConfigured } from "@/lib/supabase/config"

import { CalendarView } from "./calendar-view"
import { DEMO_POSTS, type CalendarPost } from "./demo-posts"
import { contentItemToPost } from "./map-content-item"

export const metadata: Metadata = { title: "Calendar" }

/** Loads this month's scheduled posts for the signed-in org, falling back to demo data when unconfigured. */
async function loadInitialPosts(): Promise<{ posts: CalendarPost[]; isLive: boolean }> {
  if (!isSupabaseConfigured()) return { posts: DEMO_POSTS, isLive: false }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { posts: [], isLive: true }

  const items = await listScheduledItems(orgId, new Date())
  const posts = items
    .map(contentItemToPost)
    .filter((post): post is CalendarPost => post !== null)

  return { posts, isLive: true }
}

export default async function CalendarPage() {
  const { posts, isLive } = await loadInitialPosts()

  return <CalendarView initialPosts={posts} isLive={isLive} />
}
