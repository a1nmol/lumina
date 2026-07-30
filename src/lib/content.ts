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

import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"

import { createAdminClient } from "@/lib/supabase/admin"
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
 * Deletes a saved template. Uses the RLS-scoped client — the
 * "templates_delete_owner_admin" policy (supabase/migrations/0002_content.sql)
 * restricts deletes to org owners/admins, so a non-owner/admin's request
 * simply deletes zero rows (no error) rather than being explicitly denied.
 * Returns whether a row was actually deleted, so the caller can tell that
 * apart from "already gone" / "not permitted". Demo-safe no-op (`true`,
 * since there's nothing to persist) when Supabase isn't configured.
 */
export async function deleteTemplate(orgId: string, templateId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return true

  const supabase = await createClient()
  const { error, count } = await supabase
    .from("templates")
    .delete({ count: "exact" })
    .eq("id", templateId)
    .eq("org_id", orgId)

  if (error) {
    throw new Error(`deleteTemplate: failed to delete template ${templateId}: ${error.message}`)
  }

  return (count ?? 0) > 0
}

/**
 * Loads a single content item for the org (RLS-scoped). Used server-side to
 * resolve a slideshow render's real image URL from the persisted
 * content_items row rather than ever trusting a client-supplied URL — see
 * resolveTrustedSlideshowImageUrl in src/app/(app)/studio/actions.ts.
 */
export async function getContentItem(orgId: string, contentId: string): Promise<ContentItem | null> {
  if (!isSupabaseConfigured()) return null

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("content_items")
    .select()
    .eq("id", contentId)
    .eq("org_id", orgId)
    .maybeSingle()

  if (error) {
    throw new Error(`getContentItem: failed to load content item ${contentId} for org ${orgId}: ${error.message}`)
  }

  return data
}

/**
 * Moves a content item into the queue: "scheduled" (with scheduled_at) when
 * a time is given, or "queued" (no fixed time yet) otherwise.
 *
 * TODO(Ayrshare publish path): queued/scheduled is NOT published — do not
 * record a 'post_published' analytics_events row here. That event belongs
 * on the real publish transition (status -> 'posted'), which lands once the
 * Ayrshare auto-publish path exists (MASTER_PLAN.md §4.B "true auto-publish
 * via Ayrshare"); until then, no code path flips content_items.status to
 * 'posted', so no post_published events are recorded yet — the Analytics
 * loop dashboard runs on DEMO_* data for that side until it does.
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

export interface SaveSlideshowMediaAssetInput {
  filePath: string
  id: string
  durationSec: number
  contentId?: string | null
}

/**
 * Best-effort: uploads a locally-rendered slideshow MP4 (from
 * src/lib/media/slideshow.ts) to the Supabase Storage bucket "media" (if it
 * exists) and records a media_assets row pointing at it, with the render id
 * embedded in `metadata.renderId` — this is what
 * /api/slideshow/[id]/route.ts checks against to authorize playback (a
 * returned, RLS-scoped row proves org membership). Non-fatal by design —
 * callers should swallow errors, since the slideshow itself is already
 * served locally via /api/slideshow/[id] regardless of whether this
 * succeeds.
 *
 * Returns whether the upload + insert actually succeeded, so the caller
 * (src/app/(app)/studio/actions.ts) knows whether it's safe to immediately
 * delete the local work directory (src/lib/media/slideshow.ts#cleanupSlideshowWorkDir)
 * or must leave it for the 60-minute opportunistic sweep instead.
 *
 * TODO(docs/backend-notes.md): provision the "media" Storage bucket (and
 * decide public vs. signed URLs) — until then this silently no-ops on the
 * upload's "bucket not found" error.
 */
export async function saveSlideshowMediaAsset(
  orgId: string,
  input: SaveSlideshowMediaAssetInput
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false

  // Service-role client: the "media" bucket is PRIVATE with no storage RLS
  // policies for authenticated users — session-context uploads fail with
  // "new row violates row-level security policy" (diagnosed live). This is
  // a server-only path whose org is already authorized by the caller.
  const supabase = createAdminClient()
  const bytes = await readFile(input.filePath)
  const storagePath = `${orgId}/slideshows/${input.id}.mp4`

  const { error: uploadError } = await supabase.storage
    .from("media")
    .upload(storagePath, bytes, { contentType: "video/mp4", upsert: true })

  // Bucket may not be provisioned yet in this environment — see the TODO
  // above. Swallow so a missing bucket never breaks slideshow rendering.
  if (uploadError) return false

  // Signed URL, not getPublicUrl: public URLs 400 on a private bucket.
  // One-year expiry for the pilot; revisit (public bucket or a proxy
  // route) before assets need to outlive it.
  const { data: signedData, error: signedError } = await supabase.storage
    .from("media")
    .createSignedUrl(storagePath, 60 * 60 * 24 * 365)
  if (signedError || !signedData?.signedUrl) return false

  const { error: insertError } = await supabase.from("media_assets").insert({
    org_id: orgId,
    content_id: input.contentId ?? null,
    kind: "video",
    url: signedData.signedUrl,
    provider: "ffmpeg-local",
    cost_usd: 0,
    metadata: { durationSec: input.durationSec, source: "slideshow", renderId: input.id },
  })

  return !insertError
}

export interface SaveRenderedPosterAssetInput {
  /** The flattened PNG bytes from src/lib/templates/render.ts#renderTemplate. */
  bytes: Buffer
  templateId: string
  contentId?: string | null
}

/**
 * Uploads a code-rendered poster PNG (src/lib/templates/render.ts) to the
 * Supabase Storage bucket "media" and records a media_assets row, mirroring
 * saveSlideshowMediaAsset's shape above. Unlike that function, this returns
 * the public URL directly (not a boolean) — the Studio composer needs the
 * URL immediately to show the rendered poster in the phone-mockup preview,
 * exactly like it already does for a fal.ai-generated raw image
 * (src/app/(app)/studio/actions.ts). Returns null on any failure (Supabase
 * not configured, or the "media" bucket isn't provisioned yet — see the TODO
 * on saveSlideshowMediaAsset above) so the caller can fall back to the old
 * raw-image path rather than losing the draft entirely.
 */
export async function saveRenderedPosterAsset(
  orgId: string,
  input: SaveRenderedPosterAssetInput
): Promise<string | null> {
  if (!isSupabaseConfigured()) return null

  // Service-role + signed URL — same private-bucket reality as
  // saveSlideshowMediaAsset above (RLS blocked session uploads, public
  // URLs 400 on private buckets; both diagnosed live in production).
  const supabase = createAdminClient()
  const id = randomUUID()
  const storagePath = `${orgId}/posters/${id}.png`

  const { error: uploadError } = await supabase.storage
    .from("media")
    .upload(storagePath, input.bytes, { contentType: "image/png", upsert: true })

  if (uploadError) return null

  const { data: signedData, error: signedError } = await supabase.storage
    .from("media")
    .createSignedUrl(storagePath, 60 * 60 * 24 * 365)
  if (signedError || !signedData?.signedUrl) return null

  const { error: insertError } = await supabase.from("media_assets").insert({
    org_id: orgId,
    content_id: input.contentId ?? null,
    kind: "image",
    url: signedData.signedUrl,
    provider: "template-render",
    cost_usd: 0,
    metadata: { templateId: input.templateId, renderId: id },
  })

  // The upload itself succeeded either way — surface the URL so the
  // composer can still show the poster even if this bookkeeping insert
  // failed for some reason (RLS edge case, transient error, etc).
  if (insertError) {
    console.error(`saveRenderedPosterAsset: media_assets insert failed for org ${orgId}: ${insertError.message}`)
  }

  return signedData.signedUrl
}

/**
 * Sets a content item's status directly — used by the Queue's post-detail
 * sheet "Mark as posted" action (MASTER_PLAN.md §4.B reminder-to-post: the
 * manual push → copy → paste loop still needs a way to tell Lumina the post
 * actually went out). Deliberately does NOT touch scheduled_at.
 *
 * TODO(Ayrshare publish path): same caveat as queueContentItem — this is a
 * user-asserted "posted", not a verified publish, so it still does not
 * record a 'post_published' analytics_events row. See that function's
 * comment for the real publish path this will align with later.
 */
export async function updateContentStatus(
  orgId: string,
  contentId: string,
  status: ContentStatus
): Promise<ContentItem | null> {
  if (!isSupabaseConfigured()) return null

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("content_items")
    .update({ status })
    .eq("id", contentId)
    .eq("org_id", orgId)
    .select()
    .maybeSingle()

  if (error) {
    throw new Error(`updateContentStatus: failed to update content item ${contentId}: ${error.message}`)
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
