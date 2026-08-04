import "server-only"

// Content-sniffs a transient Instagram story-media CDN url (story reply /
// story mention — see src/lib/social/instagram-attachments.ts's
// parseInstagramReplyToStory and the "story_mention" attachment kind) to
// tell an image apart from a video BEFORE deciding whether to run vision on
// it. Meta's webhook payload never says which — the url is just a CDN link
// to whatever media type the story actually was.
//
// Policy (Meta rule + owner directive, Senses Wave): story media is NEVER
// downloaded, and never persisted in `messages` metadata. This module only
// ever reads response HEADERS (Content-Type) — it never reads a response
// body into memory, and any body a GET fallback opens is cancelled
// immediately after the header is read. Callers must not pass this module's
// url to anything that stores it; see the webhook route's
// attachment-metadata builder, which omits `url` entirely for story kinds.
// (Scope note: the route's raw webhook_receipts diagnostic row still carries
// the full payload verbatim, story urls included — that's the pre-existing
// diagnostics tradeoff, documented there, not a leak from this module.)
//
// SSRF posture (review): this is the codebase's first direct server-side
// fetch of a webhook-supplied url. The payload is HMAC-gated upstream and we
// only read headers, but defense-in-depth is cheap — https only, and the
// host must be a known Meta CDN suffix (mirrors
// src/lib/media/slideshow.ts's allowlist pattern).

const SNIFF_TIMEOUT_MS = 8000

/** Known Meta media CDN host suffixes — story media only ever lives here. */
const ALLOWED_STORY_HOST_SUFFIXES = ["cdninstagram.com", "fbsbx.com", "fbcdn.net"] as const

export type StoryMediaKind = "image" | "video" | "unknown"

/**
 * Pure — classifies a `Content-Type` header value into image/video/unknown.
 * Exported for unit tests.
 */
export function classifyStoryMediaContentType(contentType: string | null | undefined): StoryMediaKind {
  const normalized = contentType?.split(";")[0]?.trim().toLowerCase()
  if (!normalized) return "unknown"
  if (normalized.startsWith("image/")) return "image"
  if (normalized.startsWith("video/")) return "video"
  return "unknown"
}

/** Pure — true iff the url is https on a known Meta CDN host. Exported for unit tests. */
export function isAllowedStoryMediaUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "https:") return false
    return ALLOWED_STORY_HOST_SUFFIXES.some(
      (suffix) => parsed.hostname === suffix || parsed.hostname.endsWith(`.${suffix}`)
    )
  } catch {
    return false
  }
}

async function fetchHeadersOnly(url: string, method: "HEAD" | "GET", signal: AbortSignal): Promise<Response | null> {
  try {
    return await fetch(url, { method, signal })
  } catch (error) {
    console.error(`[social/instagram-story-media] ${method} sniff request failed`, error instanceof Error ? error.message : error)
    return null
  }
}

/**
 * Content-sniffs a story-media url via HEAD first, falling back to GET (some
 * CDNs reject/ignore HEAD) when HEAD doesn't yield a usable Content-Type —
 * the GET's body is cancelled immediately after the header is read, so this
 * never actually downloads the media. Never throws; returns "unknown" on any
 * network failure, timeout, disallowed url, or missing/unrecognized header —
 * callers should treat "unknown" the same as "can't tell, skip vision."
 *
 * ONE shared timeout covers HEAD + the GET fallback together (review fix:
 * two independent 8s timers meant a blackholed host cost ~16s of webhook
 * budget; the total is now hard-capped at SNIFF_TIMEOUT_MS).
 */
export async function sniffStoryMediaKind(url: string): Promise<StoryMediaKind> {
  const trimmedUrl = url.trim()
  if (!trimmedUrl || !isAllowedStoryMediaUrl(trimmedUrl)) return "unknown"

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SNIFF_TIMEOUT_MS)

  try {
    const headRes = await fetchHeadersOnly(trimmedUrl, "HEAD", controller.signal)
    if (headRes?.ok) {
      const kind = classifyStoryMediaContentType(headRes.headers.get("content-type"))
      if (kind !== "unknown") return kind
    }

    const getRes = await fetchHeadersOnly(trimmedUrl, "GET", controller.signal)
    if (!getRes) return "unknown"

    const kind = classifyStoryMediaContentType(getRes.headers.get("content-type"))
    try {
      await getRes.body?.cancel()
    } catch {
      // Best-effort cleanup only — the sniff result above is already final.
    }
    return kind
  } finally {
    clearTimeout(timer)
  }
}
