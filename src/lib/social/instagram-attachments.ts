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
    // Meta's "shared post" type — sometimes delivered as "share", sometimes
    // as "post"/"ig_post" (Senses Wave research, verified against Meta
    // docs). All three carry the same shape (payload.url = the post's cover
    // IMAGE, payload.title = caption when present), so they're normalized to
    // the same "share" kind.
    case "post":
    case "ig_post":
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

// ---------------------------------------------------------------------------
// Story replies (Senses Wave) — a customer replying to one of the business's
// own Instagram Stories arrives as a DIFFERENT envelope than attachments[]:
// `message.reply_to.story = { url, id, link_sticker_url?, is_self_reply? }`,
// with the customer's typed reply (if any) in the normal `message.text`
// field alongside it. `url` is the story's own media (image OR video — Meta
// doesn't say which, see src/lib/social/instagram-story-media.ts for the
// content-sniff that tells them apart). Kept in this module (not its own
// file) since it's the same "raw Meta shape -> normalized shape" concern as
// the rest of this file, and stays pure for the same reason.
// ---------------------------------------------------------------------------

/** Meta's raw `message.reply_to` shape — only the `story` field this app reads. */
export interface RawInstagramReplyTo {
  story?: {
    url?: string
    id?: string
    link_sticker_url?: string
    is_self_reply?: boolean
  }
}

export interface NormalizedInstagramStoryReply {
  url: string | null
  id: string | null
  linkStickerUrl: string | null
  isSelfReply: boolean
}

/**
 * Defensively parses `message.reply_to.story` into a normalized shape.
 * Returns null when there's no `story` object, or it's present but carries
 * neither a url nor an id (nothing worth recording as a story reply) — never
 * throws on a malformed/partial entry.
 */
export function parseInstagramReplyToStory(
  replyTo: RawInstagramReplyTo | null | undefined
): NormalizedInstagramStoryReply | null {
  const story = replyTo?.story
  if (!story || typeof story !== "object") return null

  const url = typeof story.url === "string" && story.url.trim() ? story.url.trim() : null
  const id = typeof story.id === "string" && story.id.trim() ? story.id.trim() : null
  const linkStickerUrl =
    typeof story.link_sticker_url === "string" && story.link_sticker_url.trim() ? story.link_sticker_url.trim() : null
  const isSelfReply = story.is_self_reply === true

  if (!url && !id) return null

  return { url, id, linkStickerUrl, isSelfReply }
}

/**
 * The Inbox thread-list / prompt-content placeholder for a story reply with
 * no customer-typed text alongside it (rare — a story reply is usually
 * accompanied by real text). Mirrors ATTACHMENT_PLACEHOLDER_BY_KIND's role
 * for the attachments[] path, kept separate since a story reply isn't part
 * of that array/kind union.
 */
export const STORY_REPLY_PLACEHOLDER_BODY = "[replied to your story]"
