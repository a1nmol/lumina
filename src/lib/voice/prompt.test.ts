import { describe, expect, it } from "vitest"

import { buildVoicePrompt, MAX_GENERAL_PROMPT_CHARS } from "./prompt"
import type { BusinessBrain } from "@/lib/types"

function brainFixture(overrides: Partial<BusinessBrain> = {}): BusinessBrain {
  return {
    org_id: "org-1",
    business_name: "Blossom Nails",
    category: "nail salon",
    description: "A cozy neighborhood nail salon.",
    hours: { monday: { open: "09:00", close: "18:00" }, sunday: { open: "", close: "", closed: true } },
    services: [
      { name: "Gel manicure", price: "$40" },
      { name: "Pedicure", price: "$50" },
    ],
    prices: {},
    faq: [{ question: "Do you take walk-ins?", answer: "Yes, when we have space." }],
    tone: "warm and upbeat",
    brand_kit: {},
    connected_channels: {},
    onboarding_step: 5,
    completed: true,
    updated_at: new Date().toISOString(),
    frontdesk_auto_reply: true,
    ai_intro_enabled: false,
    ai_intro_text: null,
    ai_always_on: true,
    follow_ups_enabled: true,
    ...overrides,
  }
}

describe("buildVoicePrompt", () => {
  it("includes the 3-second recording/AI disclosure at the very start of beginMessage", () => {
    const { beginMessage } = buildVoicePrompt(brainFixture(), { greeting: null, after_hours_script: null, transfer_number: null })
    expect(beginMessage.startsWith("Hi, this is Blossom Nails's AI assistant — this call may be recorded.")).toBe(true)
  })

  it("falls back to a default opening question when no greeting is set", () => {
    const { beginMessage } = buildVoicePrompt(brainFixture(), { greeting: null, after_hours_script: null, transfer_number: null })
    expect(beginMessage).toContain("How can I help you today?")
  })

  it("uses the org's custom greeting when set", () => {
    const { beginMessage } = buildVoicePrompt(brainFixture(), {
      greeting: "Thanks for calling, how can we help?",
      after_hours_script: null,
      transfer_number: null,
    })
    expect(beginMessage).toContain("Thanks for calling, how can we help?")
  })

  it("stays within the hard character cap even with a full Brain", () => {
    const bigBrain = brainFixture({
      description: "A".repeat(400),
      services: Array.from({ length: 20 }, (_, i) => ({ name: `Service ${i}`, price: "$99" })),
      faq: Array.from({ length: 20 }, (_, i) => ({ question: `Question ${i}?`, answer: "A".repeat(100) })),
    })
    const { generalPrompt } = buildVoicePrompt(bigBrain, { greeting: null, after_hours_script: null, transfer_number: null })
    expect(generalPrompt.length).toBeLessThanOrEqual(MAX_GENERAL_PROMPT_CHARS)
  })

  it("mentions transfer only when a transfer number is configured", () => {
    const withoutTransfer = buildVoicePrompt(brainFixture(), { greeting: null, after_hours_script: null, transfer_number: null })
    expect(withoutTransfer.generalPrompt).not.toContain("transfer")

    const withTransfer = buildVoicePrompt(brainFixture(), { greeting: null, after_hours_script: null, transfer_number: "+15551234567" })
    expect(withTransfer.generalPrompt).toContain("transfer")
  })

  it("includes compact hours, services, and FAQ facts", () => {
    const { generalPrompt } = buildVoicePrompt(brainFixture(), { greeting: null, after_hours_script: null, transfer_number: null })
    expect(generalPrompt).toContain("monday 09:00-18:00")
    expect(generalPrompt).toContain("Gel manicure ($40)")
    expect(generalPrompt).toContain("Do you take walk-ins?")
  })

  it("builds an after-hours variant using after_hours_script when present", () => {
    const { beginMessage, generalPrompt } = buildVoicePrompt(
      brainFixture(),
      { greeting: "Thanks for calling!", after_hours_script: "We're closed right now, but I can take a message.", transfer_number: null },
      { afterHours: true }
    )
    expect(beginMessage).toContain("We're closed right now, but I can take a message.")
    expect(generalPrompt).toContain("after hours")
  })

  it("handles a null Business Brain without throwing", () => {
    const { generalPrompt, beginMessage } = buildVoicePrompt(null, { greeting: null, after_hours_script: null, transfer_number: null })
    expect(generalPrompt.length).toBeGreaterThan(0)
    expect(beginMessage).toContain("the business's AI assistant")
  })
})
