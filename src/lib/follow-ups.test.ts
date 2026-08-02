import { describe, expect, it } from "vitest"

import {
  FOLLOW_UP_MAX_AGE_MS,
  FOLLOW_UP_MIN_AGE_MS,
  FOLLOW_UP_RENUDGE_GAP_MS,
  MAX_FOLLOW_UPS_PER_ORG_PER_RUN,
  capFollowUpCandidates,
  hasFollowUpsPausedToken,
  isFollowUpCandidate,
  type FollowUpCandidateInput,
} from "./follow-ups"

const NOW = new Date("2026-08-02T12:00:00.000Z")

/** A baseline input that satisfies every rule — each test flips exactly one field. */
function baseInput(overrides: Partial<FollowUpCandidateInput> = {}): FollowUpCandidateInput {
  return {
    aiMode: "auto",
    contactIsVip: false,
    hasOpenThreads: true,
    lastMessageDirection: "outbound",
    lastMessageAt: new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000), // 3 days old
    lastFollowUpAt: null,
    now: NOW,
    ...overrides,
  }
}

// -----------------------------------------------------------------------------
// isFollowUpCandidate
// -----------------------------------------------------------------------------

describe("isFollowUpCandidate", () => {
  it("qualifies a thread that's quiet 2-7 days after the business's own last message, with an open thread, ai_mode auto, and no recent nudge", () => {
    expect(isFollowUpCandidate(baseInput())).toBe(true)
  })

  it("rejects ai_mode 'off' (owner hasn't opted this thread into AI autonomy)", () => {
    expect(isFollowUpCandidate(baseInput({ aiMode: "off" }))).toBe(false)
  })

  it("rejects a VIP contact (VIPs never get an unattended AI action)", () => {
    expect(isFollowUpCandidate(baseInput({ contactIsVip: true }))).toBe(false)
  })

  it("rejects a conversation with no open threads to nudge about", () => {
    expect(isFollowUpCandidate(baseInput({ hasOpenThreads: false }))).toBe(false)
  })

  it("rejects when the last message was inbound (the business/AI still owes a reply — never nudge that)", () => {
    expect(isFollowUpCandidate(baseInput({ lastMessageDirection: "inbound" }))).toBe(false)
  })

  it("rejects a thread quieter than FOLLOW_UP_MIN_AGE_MS (too fresh)", () => {
    const lastMessageAt = new Date(NOW.getTime() - (FOLLOW_UP_MIN_AGE_MS - 60_000))
    expect(isFollowUpCandidate(baseInput({ lastMessageAt }))).toBe(false)
  })

  it("accepts a thread exactly at the FOLLOW_UP_MIN_AGE_MS boundary", () => {
    const lastMessageAt = new Date(NOW.getTime() - FOLLOW_UP_MIN_AGE_MS)
    expect(isFollowUpCandidate(baseInput({ lastMessageAt }))).toBe(true)
  })

  it("rejects a thread older than FOLLOW_UP_MAX_AGE_MS (too stale to nudge)", () => {
    const lastMessageAt = new Date(NOW.getTime() - (FOLLOW_UP_MAX_AGE_MS + 60_000))
    expect(isFollowUpCandidate(baseInput({ lastMessageAt }))).toBe(false)
  })

  it("accepts a thread exactly at the FOLLOW_UP_MAX_AGE_MS boundary", () => {
    const lastMessageAt = new Date(NOW.getTime() - FOLLOW_UP_MAX_AGE_MS)
    expect(isFollowUpCandidate(baseInput({ lastMessageAt }))).toBe(true)
  })

  it("rejects when the last follow-up was sent less than FOLLOW_UP_RENUDGE_GAP_MS ago", () => {
    const lastFollowUpAt = new Date(NOW.getTime() - (FOLLOW_UP_RENUDGE_GAP_MS - 60_000))
    expect(isFollowUpCandidate(baseInput({ lastFollowUpAt }))).toBe(false)
  })

  it("accepts when the last follow-up was sent more than FOLLOW_UP_RENUDGE_GAP_MS ago", () => {
    const lastFollowUpAt = new Date(NOW.getTime() - (FOLLOW_UP_RENUDGE_GAP_MS + 60_000))
    expect(isFollowUpCandidate(baseInput({ lastFollowUpAt }))).toBe(true)
  })

  it("accepts when there has never been a follow-up (lastFollowUpAt null)", () => {
    expect(isFollowUpCandidate(baseInput({ lastFollowUpAt: null }))).toBe(true)
  })
})

// -----------------------------------------------------------------------------
// capFollowUpCandidates
// -----------------------------------------------------------------------------

describe("capFollowUpCandidates", () => {
  it("passes through a list shorter than the cap unchanged", () => {
    expect(capFollowUpCandidates([1, 2])).toEqual([1, 2])
  })

  it("passes through a list exactly at the cap unchanged", () => {
    const items = Array.from({ length: MAX_FOLLOW_UPS_PER_ORG_PER_RUN }, (_, i) => i)
    expect(capFollowUpCandidates(items)).toEqual(items)
  })

  it("truncates a list longer than the cap to the first MAX_FOLLOW_UPS_PER_ORG_PER_RUN items", () => {
    const items = Array.from({ length: MAX_FOLLOW_UPS_PER_ORG_PER_RUN + 5 }, (_, i) => i)
    expect(capFollowUpCandidates(items)).toEqual(items.slice(0, MAX_FOLLOW_UPS_PER_ORG_PER_RUN))
    expect(capFollowUpCandidates(items)).toHaveLength(MAX_FOLLOW_UPS_PER_ORG_PER_RUN)
  })
})

// -----------------------------------------------------------------------------
// hasFollowUpsPausedToken
// -----------------------------------------------------------------------------

describe("hasFollowUpsPausedToken", () => {
  it("returns false when no standing order carries the token", () => {
    expect(hasFollowUpsPausedToken(["Registrations are closed.", "I'm out sick today."])).toBe(false)
  })

  it("matches the token case-insensitively — the only opt-out must never silently miss", () => {
    expect(hasFollowUpsPausedToken(["[No-Followups] while I'm traveling"])).toBe(true)
    expect(hasFollowUpsPausedToken(["please [NO-FOLLOWUPS] for now"])).toBe(true)
  })

  it("returns false for an empty list", () => {
    expect(hasFollowUpsPausedToken([])).toBe(false)
  })

  it("returns true when a standing order carries the exact token", () => {
    expect(hasFollowUpsPausedToken(["[no-followups]"])).toBe(true)
  })

  it("returns true when the token appears alongside other text", () => {
    expect(hasFollowUpsPausedToken(["We're on vacation, [no-followups] until we're back."])).toBe(true)
  })
})
