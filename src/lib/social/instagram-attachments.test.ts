import { describe, expect, it } from "vitest"

import {
  ATTACHMENT_PLACEHOLDER_BY_KIND,
  attachmentPlaceholderBody,
  classifyInstagramAttachmentType,
  normalizeInstagramAttachments,
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
})
