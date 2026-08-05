import { describe, expect, it } from "vitest"

import { DEFAULT_SEED, hashSeed, pickVariant } from "./variants"

describe("hashSeed", () => {
  it("is deterministic for the same string", () => {
    expect(hashSeed("hello")).toBe(hashSeed("hello"))
  })

  it("differs for different strings (no trivial collisions on similar inputs)", () => {
    expect(hashSeed("hello")).not.toBe(hashSeed("hellp"))
    expect(hashSeed("content-item-1")).not.toBe(hashSeed("content-item-2"))
  })

  it("always returns a non-negative 32-bit integer", () => {
    for (const value of ["", "a", "lumina", "a very long seed string with spaces and punctuation!!"]) {
      const hash = hashSeed(value)
      expect(Number.isInteger(hash)).toBe(true)
      expect(hash).toBeGreaterThanOrEqual(0)
      expect(hash).toBeLessThanOrEqual(0xffffffff)
    }
  })
})

describe("pickVariant", () => {
  it("is deterministic for the same seed + count", () => {
    expect(pickVariant("hackathon-2026", 3)).toBe(pickVariant("hackathon-2026", 3))
  })

  it("always returns an index in [0, count)", () => {
    for (const seed of ["a", "b", "c", "coffee-promo", "quote-maria", ""]) {
      for (const count of [1, 2, 3, 4]) {
        const index = pickVariant(seed, count)
        expect(index).toBeGreaterThanOrEqual(0)
        expect(index).toBeLessThan(count)
      }
    }
  })

  it("spreads across the full range for a set of varied seeds (not always index 0)", () => {
    const seeds = Array.from({ length: 12 }, (_, i) => `content-item-${i}-${"abcdefghijkl"[i]}`)
    const indices = new Set(seeds.map((seed) => pickVariant(seed, 3)))
    expect(indices.size).toBeGreaterThan(1)
  })

  it("throws for a non-positive or non-integer count", () => {
    expect(() => pickVariant("x", 0)).toThrow()
    expect(() => pickVariant("x", -1)).toThrow()
    expect(() => pickVariant("x", 1.5)).toThrow()
  })
})

describe("DEFAULT_SEED", () => {
  it("is a non-empty string, usable directly by pickVariant", () => {
    expect(typeof DEFAULT_SEED).toBe("string")
    expect(DEFAULT_SEED.length).toBeGreaterThan(0)
    expect(() => pickVariant(DEFAULT_SEED, 3)).not.toThrow()
  })
})
