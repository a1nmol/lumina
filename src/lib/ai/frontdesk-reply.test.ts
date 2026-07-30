import { describe, expect, it } from "vitest"

import { attachmentToPromptContent, messageToPromptContent, type StoredAttachmentMetadata } from "./frontdesk-reply"

// Feature B (attachment-aware Instagram DMs) — locks in exactly what the AI
// is told for each attachment type, since this is what stops the model from
// either pretending to see media it can't, or staying silent on an
// attachment-only message it now must reply to.

describe("attachmentToPromptContent", () => {
  it("describes an image with a successful vision description", () => {
    const attachment: StoredAttachmentMetadata = { type: "image", description: "a golden retriever puppy on a couch" }
    expect(attachmentToPromptContent(attachment)).toBe("[sent a photo: a golden retriever puppy on a couch]")
  })

  it("is honest about an image with no description (vision skipped/failed)", () => {
    expect(attachmentToPromptContent({ type: "image" })).toBe("[sent a photo you can't see]")
  })

  it("never attempts to describe a reel or video, even if a description sneaks into metadata", () => {
    expect(attachmentToPromptContent({ type: "reel", description: "should be ignored" })).toBe(
      "[sent a reel you can't watch]"
    )
    expect(attachmentToPromptContent({ type: "video", description: "should be ignored" })).toBe(
      "[sent a video you can't watch]"
    )
  })

  it("covers audio, share, and story_mention with honest can't-see/hear phrasing", () => {
    expect(attachmentToPromptContent({ type: "audio" })).toBe("[sent a voice message you can't hear]")
    expect(attachmentToPromptContent({ type: "share" })).toBe("[sent a shared post you can't see]")
    expect(attachmentToPromptContent({ type: "story_mention" })).toBe("[sent a story mention you can't see]")
  })

  it("falls back to a generic honest phrase for an unrecognized/file type", () => {
    expect(attachmentToPromptContent({ type: "file" })).toBe("[sent an attachment you can't see]")
    expect(attachmentToPromptContent({ type: "something_new" })).toBe("[sent an attachment you can't see]")
  })
})

describe("messageToPromptContent", () => {
  it("returns the plain body for an ordinary text message (no attachment metadata)", () => {
    expect(messageToPromptContent({ body: "do you do birthday cakes?", metadata: {} })).toBe(
      "do you do birthday cakes?"
    )
  })

  it("returns the attachment phrase alone when the stored body is just the placeholder", () => {
    expect(
      messageToPromptContent({
        body: "[photo]",
        metadata: { attachment: { type: "image", description: "a birthday cake with candles" } },
      })
    ).toBe("[sent a photo: a birthday cake with candles]")
  })

  it("combines a real customer-typed caption with the attachment phrase, rather than dropping the caption", () => {
    expect(
      messageToPromptContent({
        body: "do you make ones like this??",
        metadata: { attachment: { type: "image", description: "a three-tier wedding cake" } },
      })
    ).toBe("do you make ones like this?? [sent a photo: a three-tier wedding cake]")
  })

  it("handles a null body with attachment metadata (defensive)", () => {
    expect(messageToPromptContent({ body: null, metadata: { attachment: { type: "video" } } })).toBe(
      "[sent a video you can't watch]"
    )
  })

  it("ignores malformed attachment metadata and falls back to the body", () => {
    expect(messageToPromptContent({ body: "hello", metadata: { attachment: "not-an-object" } })).toBe("hello")
    expect(messageToPromptContent({ body: "hello", metadata: { attachment: {} } })).toBe("hello")
  })
})
