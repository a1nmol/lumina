// Small deterministic-from-id helper for Analytics card decoration
// (thumbnail gradient hue). Pure UI dressing — never used for real metrics,
// which always come straight through src/lib/analytics.ts. Mirrors the
// hashSeed pattern in src/lib/analytics.ts and the thumbnailStyle helper in
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
