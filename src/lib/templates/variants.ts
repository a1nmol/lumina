// Deterministic-from-seed variant picking — how each template gets "designer
// variety" (which 1-large-accent arrangement, which palette micro-rotation)
// without ever looking random-ugly: same seed always picks the same variant,
// different seeds (e.g. consecutive content ids) spread across the full set.
// Pure + framework-free, mirrors src/components/analytics/seeded.ts's
// hashSeed pattern (FNV-1a-flavored multiply/xor hash) but lives here since
// it's part of the render pipeline's public contract (render.ts wires the
// caller's seed through), not UI-only dressing.

/** FNV-1a-style string hash -> unsigned 32-bit int. Same shape as analytics/seeded.ts#hashSeed, kept local to avoid a client-UI <-> server-render cross-import. */
export function hashSeed(value: string): number {
  let hash = 2166136261 // FNV offset basis
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619) // FNV prime
  }
  return hash >>> 0
}

/** Stable index in [0, count) derived from `seedString` — the same seed always yields the same index; different seeds spread roughly evenly across the range. Throws if `count` isn't a positive integer. */
export function pickVariant(seedString: string, count: number): number {
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error(`pickVariant: count must be a positive integer, got ${count}.`)
  }
  return hashSeed(seedString) % count
}

/** Default seed used when a caller (render.ts) doesn't pass one — keeps every existing call site (and every test) deterministic rather than suddenly "random". */
export const DEFAULT_SEED = "lumina"

/**
 * Wave 4 anti-repetition machine: picks ONE option from `options`, namespaced
 * under `axisName` so this axis's pick is independent of every other axis
 * derived from the same render `seed` (e.g. a template's `headlineAlignment`
 * axis and its `bigAccent` axis never accidentally move in lockstep just
 * because they share a seed). Equivalent to
 * `options[pickVariant(`${seed}:${axisName}`, options.length)]` — this
 * wrapper just returns the option itself instead of the index, since every
 * call site immediately wants the value.
 */
export function pickAxis<T>(seed: string, axisName: string, options: readonly T[]): T {
  if (options.length === 0) {
    throw new Error(`pickAxis: options for axis "${axisName}" must be non-empty.`)
  }
  return options[pickVariant(`${seed}:${axisName}`, options.length)]
}
