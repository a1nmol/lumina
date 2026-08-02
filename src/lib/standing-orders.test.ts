import { describe, expect, it } from "vitest"

import { isActiveOrder, renderStandingOrdersBlock } from "./standing-orders"

const NOW = new Date("2026-08-02T12:00:00.000Z")

// -----------------------------------------------------------------------------
// isActiveOrder — the filter both the DB query and its defense-in-depth
// re-check share.
// -----------------------------------------------------------------------------

describe("isActiveOrder", () => {
  it("returns false when active is false, regardless of expiry", () => {
    expect(isActiveOrder({ active: false, expires_at: null }, NOW)).toBe(false)
    expect(isActiveOrder({ active: false, expires_at: "2099-01-01T00:00:00.000Z" }, NOW)).toBe(false)
  })

  it("returns true when active with no expiry", () => {
    expect(isActiveOrder({ active: true, expires_at: null }, NOW)).toBe(true)
  })

  it("returns true when active and expiry is in the future", () => {
    expect(isActiveOrder({ active: true, expires_at: "2026-08-03T12:00:00.000Z" }, NOW)).toBe(true)
  })

  it("returns false when active but expiry is in the past", () => {
    expect(isActiveOrder({ active: true, expires_at: "2026-08-01T12:00:00.000Z" }, NOW)).toBe(false)
  })

  it("returns false when expiry is exactly now (strictly-after, not at-or-after)", () => {
    expect(isActiveOrder({ active: true, expires_at: NOW.toISOString() }, NOW)).toBe(false)
  })
})

// -----------------------------------------------------------------------------
// renderStandingOrdersBlock
// -----------------------------------------------------------------------------

describe("renderStandingOrdersBlock", () => {
  it("returns an empty string for no orders", () => {
    expect(renderStandingOrdersBlock([])).toBe("")
  })

  it("renders a single instruction, numbered, framed as owner directives", () => {
    const block = renderStandingOrdersBlock([{ instruction: "Registrations are closed, stop taking signups." }])
    expect(block).toContain("1) Registrations are closed, stop taking signups.")
    expect(block).toContain("The owner's current standing instructions")
  })

  it("numbers multiple instructions in order", () => {
    const block = renderStandingOrdersBlock([
      { instruction: "I'm out sick today, replies might be slower." },
      { instruction: "No more birthday cake orders this week, we're booked." },
    ])
    expect(block).toContain("1) I'm out sick today, replies might be slower.")
    expect(block).toContain("2) No more birthday cake orders this week, we're booked.")
  })

  it("truncates each instruction to 300 chars", () => {
    const long = "a".repeat(500)
    const block = renderStandingOrdersBlock([{ instruction: long }])
    expect(block).not.toContain("a".repeat(500))
    expect(block).toContain(`1) ${"a".repeat(300)}`)
  })

  it("trims whitespace before truncating", () => {
    const block = renderStandingOrdersBlock([{ instruction: "   tell people we're slow this week   " }])
    expect(block).toContain("1) tell people we're slow this week")
  })
})
