import { describe, expect, it } from "vitest"

import { classifyStoryMediaContentType, isAllowedStoryMediaUrl } from "./instagram-story-media"

// Senses Wave — locks in the pure Content-Type -> image/video/unknown
// sniff-decision, since a wrong classification here silently misroutes
// story media between "vision it" and "skip vision, note it's a video."

describe("classifyStoryMediaContentType", () => {
  it("classifies common image Content-Types", () => {
    expect(classifyStoryMediaContentType("image/jpeg")).toBe("image")
    expect(classifyStoryMediaContentType("image/png")).toBe("image")
    expect(classifyStoryMediaContentType("image/webp")).toBe("image")
  })

  it("classifies common video Content-Types", () => {
    expect(classifyStoryMediaContentType("video/mp4")).toBe("video")
    expect(classifyStoryMediaContentType("video/quicktime")).toBe("video")
  })

  it("strips a charset/boundary suffix and normalizes case before classifying", () => {
    expect(classifyStoryMediaContentType("IMAGE/JPEG; charset=utf-8")).toBe("image")
    expect(classifyStoryMediaContentType("  video/mp4  ")).toBe("video")
  })

  it("returns 'unknown' for missing, blank, or unrecognized Content-Types", () => {
    expect(classifyStoryMediaContentType(null)).toBe("unknown")
    expect(classifyStoryMediaContentType(undefined)).toBe("unknown")
    expect(classifyStoryMediaContentType("")).toBe("unknown")
    expect(classifyStoryMediaContentType("application/octet-stream")).toBe("unknown")
    expect(classifyStoryMediaContentType("text/html")).toBe("unknown")
  })
})

describe("isAllowedStoryMediaUrl", () => {
  it("allows https urls on Meta CDN hosts", () => {
    expect(isAllowedStoryMediaUrl("https://scontent.cdninstagram.com/v/t51/abc.jpg")).toBe(true)
    expect(isAllowedStoryMediaUrl("https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1")).toBe(true)
    expect(isAllowedStoryMediaUrl("https://scontent-lga3-1.xx.fbcdn.net/v/abc.mp4")).toBe(true)
  })

  it("rejects non-https, non-Meta hosts, suffix look-alikes, and junk", () => {
    expect(isAllowedStoryMediaUrl("http://scontent.cdninstagram.com/abc.jpg")).toBe(false)
    expect(isAllowedStoryMediaUrl("https://evil.example.com/abc.jpg")).toBe(false)
    expect(isAllowedStoryMediaUrl("https://notcdninstagram.com/abc.jpg")).toBe(false)
    expect(isAllowedStoryMediaUrl("https://cdninstagram.com.evil.io/abc.jpg")).toBe(false)
    expect(isAllowedStoryMediaUrl("not a url")).toBe(false)
  })
})
