// Instagram DM attachment normalization — shared by the inbound webhook
// (src/app/api/webhooks/instagram/route.ts, which persists a typed
// placeholder body + metadata) and src/lib/ai/frontdesk-reply.ts (which
// turns that metadata into what the AI sees). Pure/no I/O by design (no
// "server-only" guard, mirrors src/lib/ai/intro.ts) so it's trivially unit
// testable.
//
// Real Instagram messaging payloads shape attachments as
// `{ type: "image"|"video"|"audio"|"file"|"share"|"story_mention"|"ig_reel"|"reel"|..., payload: { url?, title? } }`.
// Meta's type catalog isn't guaranteed stable/exhaustive, so classification
// below is defensive: anything unrecognized (including the literal "file"
// type) falls into the "file" bucket, which reads as a generic "[attachment]"
// — never throws on an unexpected type string.

/** Meta's raw per-attachment shape — only the fields this app reads. */
export interface RawInstagramAttachment {
  type?: string
  payload?: {
    url?: string
    title?: string
  }
}

/** Our normalized attachment kinds. "file" doubles as the fallback bucket for anything unrecognized. */
export type InstagramAttachmentKind = "image" | "video" | "audio" | "share" | "story_mention" | "reel" | "file"

export interface NormalizedInstagramAttachment {
  kind: InstagramAttachmentKind
  url: string | null
  title: string | null
}

/** Human-readable inbox placeholder per kind — replaces the old generic "[attachment]" for every recognized type. */
export const ATTACHMENT_PLACEHOLDER_BY_KIND: Record<InstagramAttachmentKind, string> = {
  image: "[photo]",
  reel: "[reel]",
  video: "[video]",
  audio: "[voice message]",
  share: "[shared post]",
  story_mention: "[story mention]",
  file: "[attachment]",
}

/** Classifies a raw Meta attachment `type` string into our normalized kind. Case-insensitive; unknown/missing types fall back to "file". */
export function classifyInstagramAttachmentType(rawType: string | null | undefined): InstagramAttachmentKind {
  switch ((rawType ?? "").trim().toLowerCase()) {
    case "image":
      return "image"
    case "video":
      return "video"
    case "audio":
      return "audio"
    case "share":
      return "share"
    case "story_mention":
      return "story_mention"
    case "ig_reel":
    case "reel":
      return "reel"
    default:
      return "file"
  }
}

/** The Inbox thread-list placeholder body for a normalized attachment kind. */
export function attachmentPlaceholderBody(kind: InstagramAttachmentKind): string {
  return ATTACHMENT_PLACEHOLDER_BY_KIND[kind]
}

/** Defensively normalizes a webhook event's raw `attachments[]` — never throws on a malformed/partial entry. */
export function normalizeInstagramAttachments(
  attachments: RawInstagramAttachment[] | null | undefined
): NormalizedInstagramAttachment[] {
  if (!Array.isArray(attachments)) return []

  return attachments.map((attachment) => {
    const kind = classifyInstagramAttachmentType(attachment?.type)
    const url =
      typeof attachment?.payload?.url === "string" && attachment.payload.url.trim()
        ? attachment.payload.url.trim()
        : null
    const title =
      typeof attachment?.payload?.title === "string" && attachment.payload.title.trim()
        ? attachment.payload.title.trim()
        : null
    return { kind, url, title }
  })
}
