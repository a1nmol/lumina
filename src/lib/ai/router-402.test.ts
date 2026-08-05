// Locks in the OpenRouter 402 → AllowanceDeniedError mapping in runTextJob
// (discovered live 2026-08-02: an out-of-credits OpenRouter ACCOUNT died with
// a generic error, so channel routes crash-logged instead of soft-escalating).
// Separate file from router.test.ts because these tests mock chatComplete /
// checkAllowance, and vi.mock is file-hoisted — the pure-function tests over
// there must keep hitting the real modules.

import { describe, expect, it, vi } from "vitest"

import { AllowanceDeniedError } from "./errors"
import { OpenRouterRequestError } from "./openrouter"

vi.mock("./openrouter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./openrouter")>()
  return { ...actual, chatComplete: vi.fn() }
})

vi.mock("@/lib/usage", () => ({
  checkAllowance: vi.fn(async () => ({ allowed: true })),
  recordUsage: vi.fn(async () => undefined),
}))

import { chatComplete } from "./openrouter"
import { runTextJob } from "./router"

const mockedChatComplete = vi.mocked(chatComplete)

describe("runTextJob on OpenRouter 402 (account out of credits)", () => {
  it("throws AllowanceDeniedError immediately without trying further candidates", async () => {
    mockedChatComplete.mockRejectedValue(new OpenRouterRequestError("OpenRouter request failed (402): credits", 402))

    await expect(
      runTextJob({ orgId: "org-1", job: "customer_reply", messages: [{ role: "user", content: "hi" }] })
    ).rejects.toBeInstanceOf(AllowanceDeniedError)

    // Account-wide condition — cycling candidates would just burn latency.
    expect(mockedChatComplete).toHaveBeenCalledTimes(1)
  })

  it("still cycles candidates on non-402 failures", async () => {
    mockedChatComplete.mockRejectedValue(new OpenRouterRequestError("OpenRouter request failed (500): boom", 500))

    await expect(
      runTextJob({ orgId: "org-1", job: "customer_reply", messages: [{ role: "user", content: "hi" }] })
    ).rejects.toThrow(/all candidate models failed/)

    expect(mockedChatComplete.mock.calls.length).toBeGreaterThan(1)
  })
})
