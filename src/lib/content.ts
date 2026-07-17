import "server-only"

// Org-scoped Content Studio persistence (supabase/migrations/0002_content.sql).
// Uses the RLS-scoped server client (not the admin client) — every read/write
// here is subject to the content_items/templates/media_assets RLS policies,
// which already restrict rows to the caller's org membership. orgId is still
// threaded through explicitly (matching the rest of this codebase, e.g.
// src/lib/usage.ts) both for defense-in-depth filtering and because several
// columns are NOT NULL with no default.
//
// Demo-safe: every function returns null/[] when Supabase isn't configured,
// so future server actions can call these unconditionally and fall back to
// demo data exactly like src/app/(app)/studio/actions.ts does today.

import { createClient } from "@/lib/supabase/server"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import type { ContentItem, ContentRating, ContentStatus, ContentFormat, Template } from "@/lib/types"

export interface SaveContentItemInput {
  prompt?: string | null
  caption: string
  hashtags: string[]
  format: ContentFormat
  platforms: string[]
  imageDescription?: string | null
  mediaUrls?: unknown[]
  model?: string | null
  costUsd?: number
  status?: ContentStatus
}

/** Inserts a new content item (draft, by default) for the org. */
export async function saveContentItem(
  orgId: string,
  input: SaveContentItemInput
): Promise<ContentItem | null> {
  if (!isSupabaseConfigured()) return null

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("content_items")
    .insert({
      org_id: orgId,
      prompt: input.prompt ?? null,
      caption: input.caption,
      hashtags: input.hashtags,
      format: input.format,
      platforms: input.platforms,
      image_description: input.imageDescription ?? null,
      media_urls: input.mediaUrls ?? [],
      model: input.model ?? null,
      cost_usd: input.costUsd ?? 0,
      status: input.status ?? "draft",
    })
    .select()
    .single()

  if (error) {
    throw new Error(`saveContentItem: failed to save content item for org ${orgId}: ${error.message}`)
  }

  return data
}

/** Sets a content item's 👍/👎 rating (-1, 0, or 1). */
export async function rateContentItem(
  orgId: string,
  contentId: string,
  rating: ContentRating
): Promise<ContentItem | null> {
  if (!isSupabaseConfigured()) return null

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("content_items")
    .update({ rating })
    .eq("id", contentId)
    .eq("org_id", orgId)
    .select()
    .maybeSingle()

  if (error) {
    throw new Error(`rateContentItem: failed to rate content item ${contentId}: ${error.message}`)
  }

  return data
}

export interface SaveTemplateInput {
  name: string
  sourceContentId?: string | null
  prompt?: string | null
  caption?: string | null
  hashtags: string[]
  format: ContentFormat
  platforms: string[]
}

/** Saves a reusable template, optionally linked back to the content item it was saved from. */
export async function saveTemplate(orgId: string, input: SaveTemplateInput): Promise<Template | null> {
  if (!isSupabaseConfigured()) return null

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("templates")
    .insert({
      org_id: orgId,
      name: input.name,
      source_content_id: input.sourceContentId ?? null,
      prompt: input.prompt ?? null,
      caption: input.caption ?? null,
      hashtags: input.hashtags,
      format: input.format,
      platforms: input.platforms,
    })
    .select()
    .single()

  if (error) {
    throw new Error(`saveTemplate: failed to save template for org ${orgId}: ${error.message}`)
  }

  return data
}

/** Lists an org's saved templates, most recent first. */
export async function listTemplates(orgId: string): Promise<Template[]> {
  if (!isSupabaseConfigured()) return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("templates")
    .select()
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })

  if (error) {
    throw new Error(`listTemplates: failed to load templates for org ${orgId}: ${error.message}`)
  }

  return data ?? []
}

/**
 * Moves a content item into the queue: "scheduled" (with scheduled_at) when
 * a time is given, or "queued" (no fixed time yet) otherwise.
 */
export async function queueContentItem(
  orgId: string,
  contentId: string,
  scheduledAt?: string | null
): Promise<ContentItem | null> {
  if (!isSupabaseConfigured()) return null

  const supabase = await createClient()
  const status: ContentStatus = scheduledAt ? "scheduled" : "queued"

  const { data, error } = await supabase
    .from("content_items")
    .update({ status, scheduled_at: scheduledAt ?? null })
    .eq("id", contentId)
    .eq("org_id", orgId)
    .select()
    .maybeSingle()

  if (error) {
    throw new Error(`queueContentItem: failed to queue content item ${contentId}: ${error.message}`)
  }

  return data
}

/** Lists an org's scheduled content items falling within the calendar month containing `month`. */
export async function listScheduledItems(orgId: string, month: Date): Promise<ContentItem[]> {
  if (!isSupabaseConfigured()) return []

  const supabase = await createClient()
  const start = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1)).toISOString()
  const end = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1)).toISOString()

  const { data, error } = await supabase
    .from("content_items")
    .select()
    .eq("org_id", orgId)
    .gte("scheduled_at", start)
    .lt("scheduled_at", end)
    .order("scheduled_at", { ascending: true })

  if (error) {
    throw new Error(`listScheduledItems: failed to load scheduled items for org ${orgId}: ${error.message}`)
  }

  return data ?? []
}
