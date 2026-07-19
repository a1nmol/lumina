// Small deterministic-from-id helpers for Analytics card decoration
// (thumbnail gradient hue + a presentational reach sparkline). Pure UI
// dressing — never used for real metrics, which always come straight
// through src/lib/analytics.ts. Mirrors the hashSeed pattern in
// src/lib/analytics.ts and the thumbnailStyle helper in
// src/app/(app)/calendar/post-card.tsx, kept local since this is UI-only.

export function hashSeed(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index++) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return hash
}

/** Brand-consistent gradient (same L/C family as the chart tokens, hue derived from id). */
export function thumbnailStyle(id: string): React.CSSProperties {
  const hue = hashSeed(id) % 360
  return {
    backgroundImage: `linear-gradient(135deg, oklch(0.74 0.13 ${hue}) 0%, oklch(0.52 0.19 ${
      (hue + 45) % 360
    }) 100%)`,
  }
}

/** A short deterministic trend line (illustrative reach shape, not real per-day data) for the Loop source card's sparkline. */
export function sparklineFromSeed(id: string, points = 8): number[] {
  const seed = hashSeed(id)
  const series: number[] = []
  let value = 40 + (seed % 30)
  for (let index = 0; index < points; index++) {
    const step = ((seed >> (index % 24)) % 17) - 6
    value = Math.max(8, value + step)
    series.push(value)
  }
  return series
}
