// Shared (server-safe) range definitions for the Analytics page. Kept out of
// range-segmented.tsx because that file is "use client" and server components
// cannot call functions imported from a client module.

export type RangeValue = "today" | "7d" | "30d";

export const RANGE_OPTIONS: { value: RangeValue; label: string; days: number }[] = [
  { value: "today", label: "24h", days: 1 },
  { value: "7d", label: "7d", days: 7 },
  { value: "30d", label: "30d", days: 30 },
];

export const DEFAULT_RANGE: RangeValue = "7d";

/** Resolves the "range" search param to a known RangeValue, defaulting to 7d for anything missing/invalid. */
export function parseRangeParam(value: string | string[] | undefined): RangeValue {
  const raw = Array.isArray(value) ? value[0] : value;
  return RANGE_OPTIONS.some((option) => option.value === raw) ? (raw as RangeValue) : DEFAULT_RANGE;
}

export function rangeDaysFor(value: RangeValue): number {
  return RANGE_OPTIONS.find((option) => option.value === value)?.days ?? 7;
}
