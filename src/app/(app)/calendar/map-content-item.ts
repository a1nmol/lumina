// Maps a Supabase ContentItem (src/lib/content.ts#listScheduledItems) to the
// calendar views' shared display shape (see demo-posts.ts#CalendarPost).
// Plain module — no "use server"/"use client" — so both the server page
// wrapper and any client-side revert logic can import it.

import type { ContentItem } from "@/lib/types"

import type { CalendarPost, PostPlatform, PostStatus } from "./demo-posts"
import { PLATFORM_META } from "./platform"

const KNOWN_PLATFORMS = new Set<string>(Object.keys(PLATFORM_META))
const FALLBACK_PLATFORM: PostPlatform = "instagram"

/** Deterministic 0-359 hue from a uuid, so the same post always gets the same gradient thumbnail. */
function hueFromId(id: string): number {
  let hash = 0
  for (let index = 0; index < id.length; index++) {
    hash = (hash * 31 + id.charCodeAt(index)) % 360
  }
  return hash < 0 ? hash + 360 : hash
}

function toPostStatus(status: ContentItem["status"]): PostStatus {
  if (status === "posted") return "posted"
  if (status === "draft") return "draft"
  // "queued" and "scheduled" both render as scheduled — a queued item only
  // reaches this mapper if it somehow has a scheduled_at (queueContentItem
  // never sets one for "queued"), so this is a defensive fallback, not the
  // common case.
  return "scheduled"
}

/**
 * Maps one ContentItem to the calendar display shape. Returns null when the
 * item has no scheduled_at — there's nothing to place on a day-based grid.
 */
export function contentItemToPost(item: ContentItem): CalendarPost | null {
  if (!item.scheduled_at) return null

  const platforms = item.platforms.filter((platform): platform is PostPlatform =>
    KNOWN_PLATFORMS.has(platform)
  )

  const firstMediaUrl = item.media_urls?.[0]

  return {
    id: item.id,
    date: item.scheduled_at,
    caption: item.caption ?? "",
    format: item.format,
    platforms: platforms.length > 0 ? platforms : [FALLBACK_PLATFORM],
    thumbnailHue: hueFromId(item.id),
    status: toPostStatus(item.status),
    hashtags: item.hashtags,
    imageUrl: typeof firstMediaUrl === "string" ? firstMediaUrl : undefined,
  }
}
