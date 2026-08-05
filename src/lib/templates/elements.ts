// Wave 4 — the semantic "elements" vocabulary: the single catalog
// design-post.ts's LLM picks from (0-4 keys) to decorate a poster with
// icons/shapes that match the ACTUAL request ("hackathon" -> keyboard/code/
// trophy, not a generic sparkle) — see MASTER_PLAN.md's design philosophy
// ("elements are semantic to the prompt"). Framework-free (no Satori/fs
// import) so it's cheap to import from both design-post.ts and every
// template def.
//
// Two resolution tiers, both keyed by a flat catalog of unique string keys:
//   Tier A — decorations.ts#ICON_KEYS: hand-transcribed Lucide paths, no
//     disk I/O, always available (rendered via decorations.ts#iconChip).
//   Tier B — assets/manifest.ts entries with a `topics` field: vendored
//     IconPark/MingCute SVGs read from disk at render time (rendered via
//     decorations.ts#stickerElement) — the business-vertical vocabulary
//     (tech/food/salon/trades/retail/fitness/music-events/celebration).
//   Special — "confetti": no vendored icon exists anywhere in either
//     license-approved source (verified by hand, see
//     scripts/vendor-theme-assets.ts's module header); it resolves to
//     decorations.ts#confettiScatter instead of a file/icon.
//
// Templates never need to know "Tier A vs B vs confetti" — they call
// resolveElement(key) and switch on the returned discriminated union.

import { THEME_ASSET_MANIFEST } from "./assets/manifest"
import { ICON_KEYS, type IconKey } from "./decorations"

export const CONFETTI_ELEMENT_KEY = "confetti"

const TOPIC_MANIFEST_ENTRIES = THEME_ASSET_MANIFEST.filter((entry) => (entry.topics?.length ?? 0) > 0)

/**
 * Every key the design LLM (design-post.ts) is allowed to pick from — Tier A
 * icon keys, then every distinct Tier B topic asset name, then the special
 * code-drawn "confetti" key. Stable order so the system prompt's catalog
 * listing (and any test asserting its shape) is deterministic.
 */
export function elementCatalogKeys(): string[] {
  const topicNames = Array.from(new Set(TOPIC_MANIFEST_ENTRIES.map((entry) => entry.name)))
  return [...ICON_KEYS, ...topicNames, CONFETTI_ELEMENT_KEY]
}

const ELEMENT_CATALOG_SET = new Set(elementCatalogKeys())

/** True for a key that exists somewhere in the combined element catalog (Tier A, Tier B, or "confetti"). */
export function isElementKey(value: string): boolean {
  return ELEMENT_CATALOG_SET.has(value)
}

export type ResolvedElement =
  | { kind: "icon"; key: IconKey }
  | { kind: "topic-asset"; path: string; name: string; source: "icon-park" | "mingcute"; topics: string[] }
  | { kind: "confetti" }

/** True for a resolved element that reads as "celebratory" (the code-drawn confetti key, or any topic-asset whose manifest entry lists the "celebration" topic) — templates use this to decide whether to pair an element with a highlight/price field instead of a generic icon slot (Wave 4 brief's semantic pairing rule). */
export function isCelebrationElement(resolved: ResolvedElement): boolean {
  return resolved.kind === "confetti" || (resolved.kind === "topic-asset" && resolved.topics.includes("celebration"))
}

const TOPIC_ASSET_BY_NAME = new Map(TOPIC_MANIFEST_ENTRIES.map((entry) => [entry.name, entry]))
const ICON_KEY_SET = new Set<string>(ICON_KEYS)

/**
 * Resolves one element key to whichever catalog tier it lives in. Returns
 * null for an unrecognized key — callers (template defs) must drop it
 * silently, same "defensive, never throw" contract as every other AI-output
 * field this pipeline parses (see parseElementKeys below, which already
 * filters to isElementKey — this mainly guards a stale/renamed key reaching
 * a template via an old stored content item).
 */
export function resolveElement(key: string): ResolvedElement | null {
  if (key === CONFETTI_ELEMENT_KEY) return { kind: "confetti" }
  if (ICON_KEY_SET.has(key)) return { kind: "icon", key: key as IconKey }
  const topicEntry = TOPIC_ASSET_BY_NAME.get(key)
  if (topicEntry) {
    return { kind: "topic-asset", path: topicEntry.path, name: topicEntry.name, source: topicEntry.source, topics: topicEntry.topics ?? [] }
  }
  return null
}

const MAX_ELEMENTS = 4

/**
 * Defensively parses a raw (untrusted, model-authored) list of element keys:
 * keeps only strings, drops anything not in the combined catalog, dedupes,
 * and hard-caps at 4 — mirrors clampFieldsToSchema's "last line of defense
 * in code, not just the prompt" discipline (catalog.ts).
 */
export function parseElementKeys(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of raw) {
    if (typeof item !== "string") continue
    const trimmed = item.trim()
    if (!trimmed || seen.has(trimmed) || !isElementKey(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
    if (result.length >= MAX_ELEMENTS) break
  }
  return result
}
