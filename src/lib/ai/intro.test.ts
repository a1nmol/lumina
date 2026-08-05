import { describe, expect, it } from "vitest"

import {
  appendLuminaSignature,
  INTRO_SESSION_GAP_MS,
  getIntroToSend,
  shouldSendIntro,
  type IntroGateMessage,
} from "./intro"

const NOW = new Date("2026-07-30T12:00:00.000Z").getTime()

function minutesAgo(minutes: number): string {
  return new Date(NOW - minutes * 60 * 1000).toISOString()
}

function inbound(minutes: number): IntroGateMessage {
  return { direction: "inbound", created_at: minutesAgo(minutes), ai_handled: false }
}

function aiReply(minutes: number): IntroGateMessage {
  return { direction: "outbound", created_at: minutesAgo(minutes), ai_handled: true }
}

function humanReply(minutes: number): IntroGateMessage {
  return { direction: "outbound", created_at: minutesAgo(minutes), ai_handled: false }
}

describe("shouldSendIntro", () => {
  it("sends on the first-ever reply (no prior messages at all)", () => {
    expect(
      shouldSendIntro({
        aiIntroEnabled: true,
        aiIntroText: "you're not talking to Anmol right now, this is an AI he set up.",
        priorMessages: [],
        now: NOW,
      })
    ).toBe(true)
  })

  it("sends on the first-ever reply even with prior inbound-only messages", () => {
    expect(
      shouldSendIntro({
        aiIntroEnabled: true,
        aiIntroText: "hey it's an AI answering right now",
        priorMessages: [inbound(5)],
        now: NOW,
      })
    ).toBe(true)
  })

  it("sends on the AI's first reply even when a human owner replied minutes ago (thread flipped from 'off' to 'auto')", () => {
    expect(
      shouldSendIntro({
        aiIntroEnabled: true,
        aiIntroText: "hey it's an AI answering right now",
        priorMessages: [inbound(20), humanReply(10), inbound(2)],
        now: NOW,
      })
    ).toBe(true)
  })

  it("re-sends after a quiet gap longer than INTRO_SESSION_GAP_MS since the last AI reply", () => {
    const gapMinutes = INTRO_SESSION_GAP_MS / 60_000 + 1
    expect(
      shouldSendIntro({
        aiIntroEnabled: true,
        aiIntroText: "hey it's an AI answering right now",
        priorMessages: [aiReply(gapMinutes)],
        now: NOW,
      })
    ).toBe(true)
  })

  it("does not re-send mid-session (prior AI reply within the gap window)", () => {
    expect(
      shouldSendIntro({
        aiIntroEnabled: true,
        aiIntroText: "hey it's an AI answering right now",
        priorMessages: [inbound(20), aiReply(10)],
        now: NOW,
      })
    ).toBe(false)
  })

  it("does not send exactly at the gap boundary (strictly greater-than)", () => {
    const gapMinutes = INTRO_SESSION_GAP_MS / 60_000
    expect(
      shouldSendIntro({
        aiIntroEnabled: true,
        aiIntroText: "hey it's an AI answering right now",
        priorMessages: [aiReply(gapMinutes)],
        now: NOW,
      })
    ).toBe(false)
  })

  it("ignores recent human replies when measuring the gap (only AI replies keep the session warm)", () => {
    const gapMinutes = INTRO_SESSION_GAP_MS / 60_000 + 30
    expect(
      shouldSendIntro({
        aiIntroEnabled: true,
        aiIntroText: "hey it's an AI answering right now",
        priorMessages: [aiReply(gapMinutes), humanReply(5)],
        now: NOW,
      })
    ).toBe(true)
  })

  it("never sends when ai_intro_enabled is false, even on a first-ever reply", () => {
    expect(
      shouldSendIntro({
        aiIntroEnabled: false,
        aiIntroText: "hey it's an AI answering right now",
        priorMessages: [],
        now: NOW,
      })
    ).toBe(false)
  })

  it("never sends when ai_intro_text is blank/whitespace-only", () => {
    expect(
      shouldSendIntro({
        aiIntroEnabled: true,
        aiIntroText: "   ",
        priorMessages: [],
        now: NOW,
      })
    ).toBe(false)
  })

  it("never sends when ai_intro_text is null", () => {
    expect(
      shouldSendIntro({
        aiIntroEnabled: true,
        aiIntroText: null,
        priorMessages: [],
        now: NOW,
      })
    ).toBe(false)
  })
})

describe("getIntroToSend", () => {
  it("returns the trimmed owner text, unmodified, when gated true", () => {
    expect(
      getIntroToSend({
        aiIntroEnabled: true,
        aiIntroText: "  hey it's an AI answering right now  ",
        priorMessages: [],
        now: NOW,
      })
    ).toBe("hey it's an AI answering right now")
  })

  it("returns null when gated false", () => {
    expect(
      getIntroToSend({
        aiIntroEnabled: true,
        aiIntroText: "hey it's an AI answering right now",
        priorMessages: [aiReply(1)],
        now: NOW,
      })
    ).toBeNull()
  })
})

describe("appendLuminaSignature", () => {
  it("appends the fallback signature on a new line when branding isn't removed", () => {
    expect(appendLuminaSignature("hey it's an AI answering right now", false)).toBe(
      "hey it's an AI answering right now\n— sent via ✦ Lumina"
    )
  })

  it("returns the intro text verbatim when the org's plan/override removes branding", () => {
    expect(appendLuminaSignature("hey it's an AI answering right now", true)).toBe(
      "hey it's an AI answering right now"
    )
  })

  it("never modifies the owner's original text beyond appending", () => {
    const original = "  you're talking to an AI right now  "
    expect(appendLuminaSignature(original, false).startsWith(original)).toBe(true)
  })
})
