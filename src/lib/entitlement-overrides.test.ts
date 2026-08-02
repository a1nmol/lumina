import { describe, expect, it } from "vitest"

import {
  clearCapOverride,
  clearFlagOverride,
  computePlanDiff,
  isCapOverridden,
  isFlagOverridden,
  mergeCapOverrides,
  mergeFlagOverride,
  type EntitlementOverrides,
} from "./entitlement-overrides"
import { FEATURE_FLAG_LABELS, PLAN_LIMIT_LABELS } from "./plans"

const LABELS = { limits: PLAN_LIMIT_LABELS, flags: FEATURE_FLAG_LABELS }

describe("mergeFlagOverride", () => {
  it("creates overrides.feature_flags on an empty overrides object", () => {
    expect(mergeFlagOverride({}, "voice", true)).toEqual({ feature_flags: { voice: true } })
  })

  it("preserves existing flags and cap overrides while adding the new one", () => {
    const overrides: EntitlementOverrides = { images: 50, feature_flags: { video: true } }
    expect(mergeFlagOverride(overrides, "voice", false)).toEqual({
      images: 50,
      feature_flags: { video: true, voice: false },
    })
  })

  it("does not mutate the input object", () => {
    const overrides: EntitlementOverrides = { feature_flags: { video: true } }
    mergeFlagOverride(overrides, "voice", true)
    expect(overrides).toEqual({ feature_flags: { video: true } })
  })
})

describe("clearFlagOverride", () => {
  it("removes only the given flag, keeping siblings", () => {
    const overrides: EntitlementOverrides = { feature_flags: { voice: true, video: true } }
    expect(clearFlagOverride(overrides, "voice")).toEqual({ feature_flags: { video: true } })
  })

  it("drops the feature_flags key entirely once empty, rather than leaving {}", () => {
    const overrides: EntitlementOverrides = { images: 10, feature_flags: { voice: true } }
    expect(clearFlagOverride(overrides, "voice")).toEqual({ images: 10 })
  })

  it("is a no-op (returns the same reference) when the flag isn't overridden", () => {
    const overrides: EntitlementOverrides = { feature_flags: { video: true } }
    expect(clearFlagOverride(overrides, "voice")).toBe(overrides)
  })

  it("is a no-op when overrides has no feature_flags at all", () => {
    const overrides: EntitlementOverrides = { images: 10 }
    expect(clearFlagOverride(overrides, "voice")).toBe(overrides)
  })
})

describe("mergeCapOverrides", () => {
  it("merges multiple cap keys in one call without touching feature_flags", () => {
    const overrides: EntitlementOverrides = { feature_flags: { voice: true } }
    expect(mergeCapOverrides(overrides, { images: 500, ai_replies: 4000 })).toEqual({
      feature_flags: { voice: true },
      images: 500,
      ai_replies: 4000,
    })
  })

  it("overwrites an existing cap override for the same key", () => {
    expect(mergeCapOverrides({ images: 100 }, { images: 250 })).toEqual({ images: 250 })
  })
})

describe("clearCapOverride", () => {
  it("removes a single cap key", () => {
    expect(clearCapOverride({ images: 100, ai_replies: 200 }, "images")).toEqual({ ai_replies: 200 })
  })

  it("is a no-op (same reference) when the key isn't overridden", () => {
    const overrides: EntitlementOverrides = { images: 100 }
    expect(clearCapOverride(overrides, "ai_replies")).toBe(overrides)
  })
})

describe("isCapOverridden / isFlagOverridden", () => {
  it("reports overridden only when the key/flag is explicitly present", () => {
    expect(isCapOverridden({ images: 100 }, "images")).toBe(true)
    expect(isCapOverridden({}, "images")).toBe(false)
    expect(isFlagOverridden({ feature_flags: { voice: false } }, "voice")).toBe(true)
    expect(isFlagOverridden({ feature_flags: { voice: false } }, "video")).toBe(false)
    expect(isFlagOverridden({}, "voice")).toBe(false)
  })
})

describe("computePlanDiff", () => {
  it("shows every non-overridden cap/flag that differs between free_test and pro", () => {
    const diff = computePlanDiff("free_test", {}, "pro", LABELS)
    expect(diff.capDiffs.map((entry) => entry.key).sort()).toEqual(
      ["ai_replies", "content_generations", "images", "slideshows", "spend_cap_usd"].sort()
    )
    const spendCap = diff.capDiffs.find((entry) => entry.key === "spend_cap_usd")
    expect(spendCap).toEqual({ key: "spend_cap_usd", label: "Spend cap", from: 10, to: 80 })

    expect(diff.flagDiffs.map((entry) => entry.flag).sort()).toEqual(
      ["remove_branding", "video", "white_label_reports"].sort()
    )
  })

  it("excludes fields the org already has an override for", () => {
    const overrides: EntitlementOverrides = { spend_cap_usd: 999, feature_flags: { video: true } }
    const diff = computePlanDiff("free_test", overrides, "pro", LABELS)
    expect(diff.capDiffs.find((entry) => entry.key === "spend_cap_usd")).toBeUndefined()
    expect(diff.flagDiffs.find((entry) => entry.flag === "video")).toBeUndefined()
    // white_label_reports still differs and isn't overridden — still present.
    expect(diff.flagDiffs.find((entry) => entry.flag === "white_label_reports")).toBeDefined()
  })

  it("returns no diffs when moving to the same plan", () => {
    const diff = computePlanDiff("starter", {}, "starter", LABELS)
    expect(diff.capDiffs).toEqual([])
    expect(diff.flagDiffs).toEqual([])
  })
})
