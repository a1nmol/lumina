// Template catalog + shared resolution helpers — the registry render.ts and
// design-post.ts both read from. Adding a new template later means: write
// src/lib/templates/defs/<id>.ts, then register it in TEMPLATES below.

import type { BrandKit } from "@/lib/types"

import { darkenHex, lightenHex, pickTextColor } from "./contrast"
import { EVENT_POSTER_V1 } from "./defs/event-poster-v1"
import { PROMO_V1 } from "./defs/promo-v1"
import { QUOTE_V1 } from "./defs/quote-v1"
import type { BackgroundKind, ColorRoles, Colorway, TemplateDef } from "./types"

export const TEMPLATES: Record<string, TemplateDef> = {
  [EVENT_POSTER_V1.id]: EVENT_POSTER_V1,
  [PROMO_V1.id]: PROMO_V1,
  [QUOTE_V1.id]: QUOTE_V1,
}

export type TemplateId = keyof typeof TEMPLATES

/** Looks up a template def by id. Returns null (never throws) for an unknown id — callers (render.ts, design-post.ts) treat that as "fall back". */
export function getTemplate(id: string): TemplateDef | null {
  return Object.prototype.hasOwnProperty.call(TEMPLATES, id) ? TEMPLATES[id] : null
}

export function listTemplates(): TemplateDef[] {
  return Object.values(TEMPLATES)
}

export class TemplateFieldValidationError extends Error {
  constructor(templateId: string, fieldKey: string) {
    super(`Missing required field "${fieldKey}" for template "${templateId}".`)
    this.name = "TemplateFieldValidationError"
  }
}

/**
 * Trims + hard-clamps every field in `raw` to its schema's maxChars, drops
 * any key not declared by the template, and throws TemplateFieldValidationError
 * if a required field is missing/empty. This is the LAST line of defense —
 * design-post.ts's LLM prompt also asks for max-length copy, but a model can
 * always ignore instructions, so this always re-clamps in code before
 * anything reaches Satori.
 */
export function clampFieldsToSchema(def: TemplateDef, raw: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const field of def.fields) {
    const value = typeof raw[field.key] === "string" ? raw[field.key].trim() : ""
    if (field.required && !value) {
      throw new TemplateFieldValidationError(def.id, field.key)
    }
    result[field.key] = value.slice(0, field.maxChars)
  }
  return result
}

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/
/** Platform default brand primary — matches the "chart-1"/brand violet used elsewhere as a fallback brand hue (src/app/(app)/studio/actions.ts BRAND_HUE_COLORS[0]). */
const DEFAULT_PRIMARY = "#6D4AFF"

function safeHex(value: string | undefined | null, fallback: string): string {
  return typeof value === "string" && HEX_RE.test(value) ? value : fallback
}

/**
 * Resolves the org's brand kit + a colorway pick into concrete, contrast-safe
 * color roles (src/lib/templates/types.ts#ColorRoles). BrandKit doesn't
 * (yet) persist a dedicated secondary/accent color, so `accent` is derived
 * from `primary` when one isn't set — this keeps every template usable
 * before that Business Brain setting exists, and upgrades automatically once
 * it does (reads `brand_kit.secondary_color` if present).
 */
export function resolveColorRoles(
  brandKit: BrandKit | null | undefined,
  colorway: Colorway,
  backgroundKind: BackgroundKind
): ColorRoles {
  const primary = safeHex(brandKit?.primary_color, DEFAULT_PRIMARY)
  const secondary = (brandKit as { secondary_color?: string } | null | undefined)?.secondary_color
  const accent = safeHex(secondary, lightenHex(primary, 0.18))

  const isDark = colorway !== "light"
  // A photo_ai background typically reads dark once the scrim is applied
  // (render.ts), so text roles stay dark-background-safe for that case
  // regardless of colorway, matching the eventual composited result.
  const treatAsDark = isDark || backgroundKind === "photo_ai"

  const backgroundStart = treatAsDark ? darkenHex(primary, 0.74) : lightenHex(primary, 0.9)
  const backgroundEnd = treatAsDark ? darkenHex(primary, 0.9) : lightenHex(primary, 0.97)

  return {
    primary,
    accent,
    backgroundStart,
    backgroundEnd,
    textOnLight: pickTextColor(backgroundStart),
    textOnDark: pickTextColor(backgroundEnd),
    textOnAccent: pickTextColor(accent),
    isDarkBackground: treatAsDark,
  }
}
