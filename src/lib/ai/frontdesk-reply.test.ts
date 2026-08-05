import { describe, expect, it } from "vitest"

import { STORY_REPLY_PLACEHOLDER_BODY } from "@/lib/social/instagram-attachments"
import type { Message } from "@/lib/types"

import {
  attachmentToPromptContent,
  extractBannedOpeners,
  maxWindDownStage,
  messageToPromptContent,
  windDownStage,
  type StoredAttachmentMetadata,
} from "./frontdesk-reply"

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

  it("covers audio, share, and story_mention with honest can't-see/hear phrasing when nothing was enriched", () => {
    expect(attachmentToPromptContent({ type: "audio" })).toBe("[sent a voice message you can't hear]")
    expect(attachmentToPromptContent({ type: "share" })).toBe("[shared a post you can't see]")
    expect(attachmentToPromptContent({ type: "story_mention" })).toBe("[mentioned you in their story you can't see]")
  })

  it("falls back to a generic honest phrase for an unrecognized/file type", () => {
    expect(attachmentToPromptContent({ type: "file" })).toBe("[sent an attachment you can't see]")
    expect(attachmentToPromptContent({ type: "something_new" })).toBe("[sent an attachment you can't see]")
  })
})

// Senses Wave — locks in exactly what the AI is told for the newly-enriched
// kinds (reel caption, shared-post cover-image vision + caption, voice-note
// transcript, story_mention/story_reply content-sniff results), since each
// of these is a NEW prompt-content string a wrong render would silently
// break.
describe("attachmentToPromptContent — Senses Wave enrichment", () => {
  it("renders a reel's caption when present, honest can't-watch when it's not", () => {
    expect(attachmentToPromptContent({ type: "reel", caption: "closing time vibes 🎬" })).toBe(
      '[sent a reel captioned: "closing time vibes 🎬"]'
    )
    expect(attachmentToPromptContent({ type: "reel" })).toBe("[sent a reel you can't watch]")
    // A description sneaking onto a reel must still never be used — reels are never vision'd.
    expect(attachmentToPromptContent({ type: "reel", description: "should be ignored" })).toBe(
      "[sent a reel you can't watch]"
    )
  })

  it("renders a shared post across every combination of caption + cover-image description", () => {
    expect(attachmentToPromptContent({ type: "share", caption: "our new menu!", description: "a printed restaurant menu" })).toBe(
      '[shared a post: "our new menu!" — image shows a printed restaurant menu]'
    )
    expect(attachmentToPromptContent({ type: "share", description: "a printed restaurant menu" })).toBe(
      "[shared a post — image shows a printed restaurant menu]"
    )
    expect(attachmentToPromptContent({ type: "share", caption: "our new menu!" })).toBe(
      '[shared a post captioned: "our new menu!"]'
    )
    expect(attachmentToPromptContent({ type: "share" })).toBe("[shared a post you can't see]")
  })

  it("renders a voice-note transcript when present, honest can't-hear when it's not", () => {
    expect(attachmentToPromptContent({ type: "audio", transcript: "hey is the shop open on sunday" })).toBe(
      '[sent a voice message saying: "hey is the shop open on sunday"]'
    )
    expect(attachmentToPromptContent({ type: "audio" })).toBe("[sent a voice message you can't hear]")
  })

  it("renders story_mention by content-sniffed media_kind, with the link-sticker note only when flagged", () => {
    expect(attachmentToPromptContent({ type: "story_mention", media_kind: "image", description: "our storefront at sunset" })).toBe(
      "[mentioned you in their story — image shows our storefront at sunset]"
    )
    expect(attachmentToPromptContent({ type: "story_mention", media_kind: "video" })).toBe(
      "[mentioned you in their story (video)]"
    )
    expect(attachmentToPromptContent({ type: "story_mention", media_kind: "unknown" })).toBe(
      "[mentioned you in their story you can't see]"
    )
    expect(attachmentToPromptContent({ type: "story_mention" })).toBe("[mentioned you in their story you can't see]")
    expect(
      attachmentToPromptContent({ type: "story_mention", media_kind: "video", has_link_sticker: true })
    ).toBe("[mentioned you in their story (video)] (their story has a link sticker)")
  })

  it("renders story_reply (message.reply_to.story) by content-sniffed media_kind, with the link-sticker note only when flagged", () => {
    expect(attachmentToPromptContent({ type: "story_reply", media_kind: "image", description: "our storefront at sunset" })).toBe(
      "[replied to your story — image shows our storefront at sunset]"
    )
    expect(attachmentToPromptContent({ type: "story_reply", media_kind: "video" })).toBe("[replied to your story (video)]")
    expect(attachmentToPromptContent({ type: "story_reply" })).toBe("[replied to your story you can't see]")
    expect(
      attachmentToPromptContent({ type: "story_reply", media_kind: "video", has_link_sticker: true })
    ).toBe("[replied to your story (video)] (their story has a link sticker)")
  })

  it("prefers media_kind 'image' + description over a stray media_kind 'video' collision (defensive)", () => {
    // Guards the switch's branch order: image+description must win before any video check runs.
    expect(
      attachmentToPromptContent({ type: "story_mention", media_kind: "image", description: "a flyer" })
    ).toBe("[mentioned you in their story — image shows a flyer]")
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

  it("combines a customer's real story-reply text with the story_reply phrase (Senses Wave)", () => {
    expect(
      messageToPromptContent({
        body: "omg love this",
        metadata: { attachment: { type: "story_reply", media_kind: "image", description: "a new haircut" } },
      })
    ).toBe("omg love this [replied to your story — image shows a new haircut]")
  })

  it("returns the story_reply phrase alone when the stored body is the story-reply placeholder", () => {
    expect(
      messageToPromptContent({
        body: STORY_REPLY_PLACEHOLDER_BODY,
        metadata: { attachment: { type: "story_reply", media_kind: "video" } },
      })
    ).toBe("[replied to your story (video)]")
  })
})

// Graceful wind-down (Commander update wave B2) — pure fraction -> stage
// mapping. Locks in the exact thresholds (0.8 seed / 0.9 heads_up / 0.97
// close) so a routing or copy change elsewhere can't silently drift them.
describe("windDownStage", () => {
  it("is 'none' for a null fraction (unlimited/unconfigured)", () => {
    expect(windDownStage(null)).toBe("none")
  })

  it("is 'none' comfortably under the seed threshold", () => {
    expect(windDownStage(0)).toBe("none")
    expect(windDownStage(0.5)).toBe("none")
    expect(windDownStage(0.79)).toBe("none")
  })

  it("is 'seed' from 0.8 up to (not including) 0.9", () => {
    expect(windDownStage(0.8)).toBe("seed")
    expect(windDownStage(0.85)).toBe("seed")
    expect(windDownStage(0.8999)).toBe("seed")
  })

  it("is 'heads_up' from 0.9 up to (not including) 0.97", () => {
    expect(windDownStage(0.9)).toBe("heads_up")
    expect(windDownStage(0.95)).toBe("heads_up")
    expect(windDownStage(0.9699)).toBe("heads_up")
  })

  it("is 'close' at and beyond 0.97, including over 1", () => {
    expect(windDownStage(0.97)).toBe("close")
    expect(windDownStage(0.99)).toBe("close")
    expect(windDownStage(1)).toBe("close")
    expect(windDownStage(1.5)).toBe("close")
  })
})

// Wallet-aware wind-down composition (Outlast hotfix, 2026-08-02 outage) —
// locks in that the MORE URGENT of the two independent stages always wins,
// in both directions, and that equal stages are stable.
describe("maxWindDownStage", () => {
  it("returns 'none' when both inputs are 'none'", () => {
    expect(maxWindDownStage("none", "none")).toBe("none")
  })

  it("returns the org stage when it's more urgent than the wallet stage", () => {
    expect(maxWindDownStage("close", "none")).toBe("close")
    expect(maxWindDownStage("heads_up", "seed")).toBe("heads_up")
  })

  it("returns the wallet stage when it's more urgent than the org stage", () => {
    expect(maxWindDownStage("none", "close")).toBe("close")
    expect(maxWindDownStage("seed", "heads_up")).toBe("heads_up")
  })

  it("is stable when both stages match", () => {
    expect(maxWindDownStage("seed", "seed")).toBe("seed")
    expect(maxWindDownStage("close", "close")).toBe("close")
  })
})

// Anti-repetition engine (Commander update wave B2) — locks in exactly which
// messages become "banned openers" and how they're truncated, since this is
// what stops the model from repeating its own recent phrasing.
describe("extractBannedOpeners", () => {
  function outboundAi(body: string, overrides: Partial<Message> = {}): Message {
    return {
      id: `msg-${Math.random()}`,
      org_id: "org-1",
      conversation_id: "conv-1",
      direction: "outbound",
      kind: "message",
      body,
      ai_handled: true,
      model: "test-model",
      cost_usd: 0,
      metadata: {},
      created_at: new Date().toISOString(),
      ...overrides,
    }
  }

  function inbound(body: string): Message {
    return outboundAi(body, { direction: "inbound", ai_handled: false, model: null })
  }

  it("returns an empty list when there's no AI reply history", () => {
    expect(extractBannedOpeners([])).toEqual([])
    expect(extractBannedOpeners([inbound("hey do you have birthday cakes")])).toEqual([])
  })

  it("takes the first 8 words of each of the last 5 AI-handled outbound messages, oldest first", () => {
    const messages = [
      inbound("hi"),
      outboundAi("thanks so much for reaching out we would love to help you out today"),
      inbound("cool"),
      outboundAi("yep we can absolutely do that for you no problem at all"),
    ]

    expect(extractBannedOpeners(messages)).toEqual([
      "thanks so much for reaching out we would",
      "yep we can absolutely do that for you",
    ])
  })

  it("caps at the last 5 AI replies, dropping older ones", () => {
    const messages = Array.from({ length: 7 }, (_, index) =>
      outboundAi(`reply number ${index} goes on for a good while`)
    )
    const openers = extractBannedOpeners(messages)

    expect(openers).toHaveLength(5)
    expect(openers[0]).toBe("reply number 2 goes on for a good")
    expect(openers[4]).toBe("reply number 6 goes on for a good")
  })

  it("ignores internal notes, inbound messages, human-sent replies, and empty bodies", () => {
    const messages = [
      outboundAi("note to self", { kind: "note" }),
      inbound("customer message"),
      outboundAi("human agent typed this manually", { ai_handled: false }),
      outboundAi(""),
      outboundAi("   "),
      outboundAi("the only real banned opener here"),
    ]

    expect(extractBannedOpeners(messages)).toEqual(["the only real banned opener here"])
  })
})
