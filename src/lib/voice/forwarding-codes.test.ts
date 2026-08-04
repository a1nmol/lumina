import { describe, expect, it } from "vitest"

import { formatForwardingCodes } from "./forwarding-codes"

describe("formatForwardingCodes", () => {
  it("returns null for too-short input", () => {
    expect(formatForwardingCodes("")).toBeNull()
    expect(formatForwardingCodes("555")).toBeNull()
    expect(formatForwardingCodes("12345")).toBeNull()
  })

  it("builds both carrier code families from a plain 10-digit number", () => {
    const codes = formatForwardingCodes("5550202000")
    expect(codes).not.toBeNull()
    expect(codes).toHaveLength(2)

    const verizon = codes!.find((code) => code.id === "verizon")
    expect(verizon?.activateCode).toBe("*715550202000")
    expect(verizon?.deactivateCode).toBe("*73")

    const gsm = codes!.find((code) => code.id === "gsm")
    expect(gsm?.activateCode).toBe("004*5550202000#")
    expect(gsm?.deactivateCode).toBe("##004#")
  })

  it("strips formatting characters (spaces, dashes, parens, leading +) before building codes", () => {
    const formatted = formatForwardingCodes("+1 (555) 020-2000")
    const plain = formatForwardingCodes("15550202000")
    expect(formatted).toEqual(plain)
  })

  it("each carrier label is a non-empty, human-readable string", () => {
    const codes = formatForwardingCodes("5550202000")
    for (const code of codes ?? []) {
      expect(code.carrierLabel.trim().length).toBeGreaterThan(0)
    }
  })
})
