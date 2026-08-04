import { describe, expect, it } from "vitest"

import { DEFAULT_VOICE_ID, findVoiceCatalogEntry, isKnownVoiceId, VOICE_CATALOG } from "./catalog"

describe("VOICE_CATALOG", () => {
  it("has at least a handful of entries, each with a non-empty id/label/vibe", () => {
    expect(VOICE_CATALOG.length).toBeGreaterThanOrEqual(4)
    for (const entry of VOICE_CATALOG) {
      expect(entry.id.trim().length).toBeGreaterThan(0)
      expect(entry.label.trim().length).toBeGreaterThan(0)
      expect(entry.vibe.trim().length).toBeGreaterThan(0)
      expect(["male", "female", "neutral"]).toContain(entry.gender)
    }
  })

  it("has unique ids", () => {
    const ids = VOICE_CATALOG.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("DEFAULT_VOICE_ID is itself a known catalog entry", () => {
    expect(isKnownVoiceId(DEFAULT_VOICE_ID)).toBe(true)
  })
})

describe("isKnownVoiceId / findVoiceCatalogEntry", () => {
  it("recognizes a real catalog id and rejects a made-up one", () => {
    expect(isKnownVoiceId(VOICE_CATALOG[0].id)).toBe(true)
    expect(isKnownVoiceId("not-a-real-voice")).toBe(false)
  })

  it("looks up an entry by id, or returns null", () => {
    expect(findVoiceCatalogEntry(VOICE_CATALOG[0].id)?.label).toBe(VOICE_CATALOG[0].label)
    expect(findVoiceCatalogEntry("nope")).toBeNull()
    expect(findVoiceCatalogEntry(null)).toBeNull()
    expect(findVoiceCatalogEntry(undefined)).toBeNull()
  })
})
