import { describe, expect, it } from "vitest"

import { isDuplicateOfRecentSend, RECENT_SEND_DEDUPE_WINDOW_MS, type DedupeCandidateMessage } from "./instagram-echo"

// Echo-handler race dedupe (see the webhook route's handleEchoMessagingEvent):
// an echo for a message WE just sent can arrive before our own insert
// commits. This locks in the fallback body+window match used to backfill
// that row's mid instead of double-inserting.

const NOW = Date.parse("2026-08-01T12:00:00.000Z")

function outbound(overrides: Partial<DedupeCandidateMessage> = {}): DedupeCandidateMessage {
  return {
    id: "msg-1",
    direction: "outbound",
    kind: "message",
    body: "Thanks for reaching out!",
    created_at: new Date(NOW - 5_000).toISOString(),
    metadata: {},
    ...overrides,
  }
}

describe("isDuplicateOfRecentSend", () => {
  it("never matches an internal note, even with identical text (note-collision review fix)", () => {
    const note = outbound({ kind: "note", body: "thanks" })
    expect(isDuplicateOfRecentSend([note], "thanks", NOW)).toBeNull()
  })

  it("matches a recent outbound message with the exact same body and no mid yet", () => {
    const message = outbound()
    const result = isDuplicateOfRecentSend([message], "Thanks for reaching out!", NOW)
    expect(result).toBe(message)
  })

  it("trims both sides before comparing", () => {
    const message = outbound({ body: "  Thanks for reaching out!  " })
    const result = isDuplicateOfRecentSend([message], "Thanks for reaching out!", NOW)
    expect(result).toBe(message)
  })

  it("returns null for an empty/blank search body", () => {
    expect(isDuplicateOfRecentSend([outbound()], "   ", NOW)).toBeNull()
    expect(isDuplicateOfRecentSend([outbound()], "", NOW)).toBeNull()
  })

  it("ignores inbound messages", () => {
    const message = outbound({ direction: "inbound" })
    expect(isDuplicateOfRecentSend([message], "Thanks for reaching out!", NOW)).toBeNull()
  })

  it("ignores a body mismatch", () => {
    const message = outbound({ body: "Something else entirely" })
    expect(isDuplicateOfRecentSend([message], "Thanks for reaching out!", NOW)).toBeNull()
  })

  it("ignores a message that already carries an instagram_mid", () => {
    const message = outbound({ metadata: { instagram_mid: "mid_123" } })
    expect(isDuplicateOfRecentSend([message], "Thanks for reaching out!", NOW)).toBeNull()
  })

  it("ignores a message older than the dedupe window", () => {
    const message = outbound({ created_at: new Date(NOW - RECENT_SEND_DEDUPE_WINDOW_MS - 1_000).toISOString() })
    expect(isDuplicateOfRecentSend([message], "Thanks for reaching out!", NOW)).toBeNull()
  })

  it("matches a message exactly at the edge of the dedupe window", () => {
    const message = outbound({ created_at: new Date(NOW - RECENT_SEND_DEDUPE_WINDOW_MS).toISOString() })
    expect(isDuplicateOfRecentSend([message], "Thanks for reaching out!", NOW)).toBe(message)
  })

  it("ignores a message with a created_at in the future (clock-skew safety)", () => {
    const message = outbound({ created_at: new Date(NOW + 5_000).toISOString() })
    expect(isDuplicateOfRecentSend([message], "Thanks for reaching out!", NOW)).toBeNull()
  })

  it("handles a null metadata gracefully", () => {
    const message = outbound({ metadata: null })
    expect(isDuplicateOfRecentSend([message], "Thanks for reaching out!", NOW)).toBe(message)
  })

  it("returns the first matching candidate when multiple qualify", () => {
    const first = outbound({ id: "first" })
    const second = outbound({ id: "second" })
    expect(isDuplicateOfRecentSend([first, second], "Thanks for reaching out!", NOW)).toBe(first)
  })

  it("returns null when there are no messages", () => {
    expect(isDuplicateOfRecentSend([], "Thanks for reaching out!", NOW)).toBeNull()
  })
})
