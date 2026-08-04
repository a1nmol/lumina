import { describe, expect, it } from "vitest"

import {
  ATTACHMENT_PLACEHOLDER_BY_KIND,
  attachmentPlaceholderBody,
  classifyInstagramAttachmentType,
  normalizeInstagramAttachments,
  parseInstagramReplyToStory,
  STORY_REPLY_PLACEHOLDER_BODY,
} from "./instagram-attachments"

// Feature B (attachment-aware Instagram DMs) — locks in the raw
// Meta type -> normalized kind -> Inbox placeholder mapping, since a wrong
// mapping here silently degrades the whole feature (thread list body text
// and, downstream, what the AI is told the customer sent).

describe("classifyInstagramAttachmentType", () => {
  it("classifies every documented Meta attachment type", () => {
    expect(classifyInstagramAttachmentType("image")).toBe("image")
    expect(classifyInstagramAttachmentType("video")).toBe("video")
    expect(classifyInstagramAttachmentType("audio")).toBe("audio")
    expect(classifyInstagramAttachmentType("share")).toBe("share")
    expect(classifyInstagramAttachmentType("story_mention")).toBe("story_mention")
  })

  it("normalizes both reel spellings to the same kind", () => {
    expect(classifyInstagramAttachmentType("ig_reel")).toBe("reel")
    expect(classifyInstagramAttachmentType("reel")).toBe("reel")
  })

  it("normalizes all three shared-post spellings ('share', 'post', 'ig_post') to the same 'share' kind (Senses Wave)", () => {
    expect(classifyInstagramAttachmentType("share")).toBe("share")
    expect(classifyInstagramAttachmentType("post")).toBe("share")
    expect(classifyInstagramAttachmentType("ig_post")).toBe("share")
  })

  it("is case-insensitive and trims whitespace", () => {
    expect(classifyInstagramAttachmentType("  IMAGE  ")).toBe("image")
    expect(classifyInstagramAttachmentType("Ig_Reel")).toBe("reel")
  })

  it("falls back to the 'file' bucket for the literal 'file' type", () => {
    expect(classifyInstagramAttachmentType("file")).toBe("file")
  })

  it("falls back to the 'file' bucket for unknown/missing types, never throws", () => {
    expect(classifyInstagramAttachmentType("something_new_meta_invents")).toBe("file")
    expect(classifyInstagramAttachmentType(undefined)).toBe("file")
    expect(classifyInstagramAttachmentType(null)).toBe("file")
    expect(classifyInstagramAttachmentType("")).toBe("file")
  })
})

describe("attachmentPlaceholderBody", () => {
  it("maps every kind to the exact spec'd placeholder", () => {
    expect(attachmentPlaceholderBody("image")).toBe("[photo]")
    expect(attachmentPlaceholderBody("reel")).toBe("[reel]")
    expect(attachmentPlaceholderBody("video")).toBe("[video]")
    expect(attachmentPlaceholderBody("audio")).toBe("[voice message]")
    expect(attachmentPlaceholderBody("share")).toBe("[shared post]")
    expect(attachmentPlaceholderBody("story_mention")).toBe("[story mention]")
    expect(attachmentPlaceholderBody("file")).toBe("[attachment]")
  })

  it("never returns the old generic placeholder for a recognized kind", () => {
    for (const kind of Object.keys(ATTACHMENT_PLACEHOLDER_BY_KIND) as Array<keyof typeof ATTACHMENT_PLACEHOLDER_BY_KIND>) {
      if (kind === "file") continue
      expect(attachmentPlaceholderBody(kind)).not.toBe("[attachment]")
    }
  })
})

describe("normalizeInstagramAttachments", () => {
  it("returns [] for missing/non-array input, never throws", () => {
    expect(normalizeInstagramAttachments(undefined)).toEqual([])
    expect(normalizeInstagramAttachments(null)).toEqual([])
  })

  it("parses type + payload.url + payload.title defensively", () => {
    const result = normalizeInstagramAttachments([
      { type: "image", payload: { url: "https://cdn.example.com/photo.jpg", title: "sunset" } },
    ])
    expect(result).toEqual([{ kind: "image", url: "https://cdn.example.com/photo.jpg", title: "sunset" }])
  })

  it("normalizes a blank/whitespace-only url or title to null", () => {
    const result = normalizeInstagramAttachments([{ type: "video", payload: { url: "   ", title: "" } }])
    expect(result).toEqual([{ kind: "video", url: null, title: null }])
  })

  it("handles a completely empty attachment entry without throwing", () => {
    expect(normalizeInstagramAttachments([{}])).toEqual([{ kind: "file", url: null, title: null }])
  })

  it("normalizes multiple attachments in order", () => {
    const result = normalizeInstagramAttachments([
      { type: "image", payload: { url: "https://cdn.example.com/1.jpg" } },
      { type: "ig_reel", payload: { url: "https://cdn.example.com/reel.mp4" } },
    ])
    expect(result.map((a) => a.kind)).toEqual(["image", "reel"])
  })

  it("carries payload.title through for every recognized kind, including the 'share'-family types (Senses Wave)", () => {
    expect(normalizeInstagramAttachments([{ type: "ig_reel", payload: { url: "u", title: "closing time vibes" } }])[0].title).toBe(
      "closing time vibes"
    )
    expect(normalizeInstagramAttachments([{ type: "share", payload: { url: "u", title: "check this out" } }])[0].title).toBe(
      "check this out"
    )
    expect(normalizeInstagramAttachments([{ type: "post", payload: { url: "u", title: "our new menu" } }])[0].title).toBe(
      "our new menu"
    )
    expect(normalizeInstagramAttachments([{ type: "ig_post", payload: { url: "u", title: "our new menu" } }])[0].title).toBe(
      "our new menu"
    )
    expect(normalizeInstagramAttachments([{ type: "story_mention", payload: { url: "u", title: "tagged you!" } }])[0].title).toBe(
      "tagged you!"
    )
  })
})

// Senses Wave — reply_to.story parsing. message.reply_to.story is a
// DIFFERENT envelope than attachments[] (see the module header), so this is
// tested separately.
describe("parseInstagramReplyToStory", () => {
  it("returns null for a missing/undefined/null reply_to", () => {
    expect(parseInstagramReplyToStory(undefined)).toBeNull()
    expect(parseInstagramReplyToStory(null)).toBeNull()
    expect(parseInstagramReplyToStory({})).toBeNull()
  })

  it("returns null when story is present but carries neither a url nor an id", () => {
    expect(parseInstagramReplyToStory({ story: {} })).toBeNull()
    expect(parseInstagramReplyToStory({ story: { url: "   " } })).toBeNull()
  })

  it("parses a full story-reply envelope defensively", () => {
    const result = parseInstagramReplyToStory({
      story: {
        url: "https://cdn.example.com/story.mp4",
        id: "story-123",
        link_sticker_url: "https://example.com/booking",
        is_self_reply: false,
      },
    })
    expect(result).toEqual({
      url: "https://cdn.example.com/story.mp4",
      id: "story-123",
      linkStickerUrl: "https://example.com/booking",
      isSelfReply: false,
    })
  })

  it("accepts an id-only envelope (no url) and normalizes blank strings to null", () => {
    expect(parseInstagramReplyToStory({ story: { id: "story-123", url: "  ", link_sticker_url: "" } })).toEqual({
      url: null,
      id: "story-123",
      linkStickerUrl: null,
      isSelfReply: false,
    })
  })

  it("normalizes a missing/non-true is_self_reply to false", () => {
    expect(parseInstagramReplyToStory({ story: { id: "s1" } })?.isSelfReply).toBe(false)
    expect(parseInstagramReplyToStory({ story: { id: "s1", is_self_reply: true } })?.isSelfReply).toBe(true)
  })
})

describe("STORY_REPLY_PLACEHOLDER_BODY", () => {
  it("is a distinct, bracketed placeholder", () => {
    expect(STORY_REPLY_PLACEHOLDER_BODY).toBe("[replied to your story]")
  })
})
