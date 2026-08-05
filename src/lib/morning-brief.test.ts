import { describe, expect, it } from "vitest"

import {
  briefHasActivity,
  deriveBriefLines,
  formatBriefSubject,
  type MorningBriefData,
} from "./morning-brief"

const EMPTY_DATA: MorningBriefData = {
  counts: { inboundCount: 0, outboundCount: 0, aiHandledOutboundCount: 0 },
  needsOwner: [],
  vipMessages: [],
  openThreads: [],
  suggestedFollowUps: [],
}

// -----------------------------------------------------------------------------
// briefHasActivity — the skip rule (no email on a silent 24h).
// -----------------------------------------------------------------------------

describe("briefHasActivity", () => {
  it("returns false when there's no inbound or outbound activity", () => {
    expect(briefHasActivity({ inboundCount: 0, outboundCount: 0, aiHandledOutboundCount: 0 })).toBe(false)
  })

  it("returns true when there's inbound activity only", () => {
    expect(briefHasActivity({ inboundCount: 1, outboundCount: 0, aiHandledOutboundCount: 0 })).toBe(true)
  })

  it("returns true when there's outbound activity only", () => {
    expect(briefHasActivity({ inboundCount: 0, outboundCount: 1, aiHandledOutboundCount: 0 })).toBe(true)
  })
})

// -----------------------------------------------------------------------------
// formatBriefSubject
// -----------------------------------------------------------------------------

describe("formatBriefSubject", () => {
  it("omits the 'need you' clause when nothing needs the owner", () => {
    expect(formatBriefSubject({ inboundCount: 10, outboundCount: 8, aiHandledOutboundCount: 8 }, 0)).toBe(
      "Your Lumina brief: 18 messages"
    )
  })

  it("includes the 'need you' clause when something does, matching the design's example shape", () => {
    expect(formatBriefSubject({ inboundCount: 10, outboundCount: 8, aiHandledOutboundCount: 5 }, 3)).toBe(
      "Your Lumina brief: 18 messages, 3 need you"
    )
  })

  it("uses singular grammar for exactly 1 message and 1 needing the owner", () => {
    expect(formatBriefSubject({ inboundCount: 1, outboundCount: 0, aiHandledOutboundCount: 0 }, 1)).toBe(
      "Your Lumina brief: 1 message, 1 needs you"
    )
  })
})

// -----------------------------------------------------------------------------
// deriveBriefLines
// -----------------------------------------------------------------------------

describe("deriveBriefLines", () => {
  it("summarizes plain message counts with no AI-handled mention when none were AI-handled", () => {
    const { summaryLine } = deriveBriefLines({
      ...EMPTY_DATA,
      counts: { inboundCount: 2, outboundCount: 2, aiHandledOutboundCount: 0 },
    })
    expect(summaryLine).toBe("4 messages came through in the last 24 hours.")
  })

  it("mentions how many the AI handled when some were", () => {
    const { summaryLine } = deriveBriefLines({
      ...EMPTY_DATA,
      counts: { inboundCount: 10, outboundCount: 8, aiHandledOutboundCount: 6 },
    })
    expect(summaryLine).toBe("18 messages came through in the last 24 hours, and the AI handled 6 of them on its own.")
  })

  it("renders a needs-you line per item with the contact name and a plain-language reason", () => {
    const { needsYouLines } = deriveBriefLines({
      ...EMPTY_DATA,
      needsOwner: [
        { conversationId: "c1", contactName: "Sarah Kim", reason: "escalated" },
        { conversationId: "c2", contactName: null, reason: "ai_draft" },
      ],
    })
    expect(needsYouLines).toHaveLength(2)
    expect(needsYouLines[0]).toContain("Sarah Kim")
    expect(needsYouLines[1]).toContain("A customer")
  })

  it("renders a VIP line with a quoted preview when one exists, and a plain fallback when it doesn't", () => {
    const { vipLines } = deriveBriefLines({
      ...EMPTY_DATA,
      vipMessages: [
        { conversationId: "c1", contactName: "Mike Chen", channel: "sms", preview: "still good for Saturday?" },
        { conversationId: "c2", contactName: null, channel: "instagram", preview: null },
      ],
    })
    expect(vipLines[0]).toBe('Mike Chen — "still good for Saturday?"')
    expect(vipLines[1]).toBe("A VIP contact messaged you")
  })

  it("renders an open-thread line per item", () => {
    const { openThreadLines } = deriveBriefLines({
      ...EMPTY_DATA,
      openThreads: [{ conversationId: "c1", contactName: "Priya Patel", thread: "still deciding between the two packages" }],
    })
    expect(openThreadLines).toEqual(["Priya Patel — still deciding between the two packages"])
  })

  it("renders a suggested-follow-up line per item, with a plain fallback when there's no contact name", () => {
    const { suggestedFollowUpLines } = deriveBriefLines({
      ...EMPTY_DATA,
      suggestedFollowUps: [
        { conversationId: "c1", contactName: "Grace Kim", draft: "did you end up deciding on the Saturday slot?" },
        { conversationId: "c2", contactName: null, draft: "just checking in on that order!" },
      ],
    })
    expect(suggestedFollowUpLines).toEqual([
      'Grace Kim — "did you end up deciding on the Saturday slot?"',
      'A contact — "just checking in on that order!"',
    ])
  })

  it("returns empty arrays for every section when there's nothing to report", () => {
    const sections = deriveBriefLines(EMPTY_DATA)
    expect(sections.needsYouLines).toEqual([])
    expect(sections.vipLines).toEqual([])
    expect(sections.openThreadLines).toEqual([])
    expect(sections.suggestedFollowUpLines).toEqual([])
  })
})
