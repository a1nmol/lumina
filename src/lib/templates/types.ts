// Shared types + tiny element-tree helpers for the code-rendered template
// engine (MASTER_PLAN.md — the Bannerbear/Canva-style architecture: real
// typography rendered by code via Satori, AI only writes copy + an optional
// text-free background). Plain module (no "server-only") so it's safe to
// import from both server-only rendering code (render.ts, catalog.ts) and
// pure/testable code (autofit.ts, contrast.ts) without pulling in Node APIs.

/** The three photo/AI-free-form-vs-baked background modes a template can support. */
export type BackgroundKind = "solid" | "gradient" | "photo_ai"

/** A coarse tone selector the design LLM (src/lib/ai/design-post.ts) picks per post — templates map this to concrete color roles via resolveColorRoles (catalog.ts). */
export type Colorway = "brand" | "dark" | "light"

export type TemplateSize = { width: number; height: number }

/** The four canvas sizes Wave 1 templates render at (design-post.ts §"Sizes"). */
export const TEMPLATE_SIZES = {
  square: { width: 1080, height: 1080 },
  portrait: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
  landscape: { width: 1200, height: 630 },
} as const satisfies Record<string, TemplateSize>

/**
 * Resolved, contrast-safe color roles for one render — derived from the
 * org's Business Brain brand kit + the chosen colorway by
 * catalog.ts#resolveColorRoles (uses src/lib/templates/contrast.ts for the
 * WCAG-safe text picks).
 */
export interface ColorRoles {
  /** The brand's own primary hex (from brand_kit.primary_color, or a sane platform default). */
  primary: string
  /** A secondary/pop hex for badges, pills, CTAs — derived from the brand kit when possible. */
  accent: string
  /** Background gradient/solid start (top) hex. */
  backgroundStart: string
  /** Background gradient/solid end (bottom) hex — equals backgroundStart for a flat solid fill. */
  backgroundEnd: string
  /** WCAG AA-safe text color for content sitting on `backgroundStart`. */
  textOnLight: string
  /** WCAG AA-safe text color for content sitting on `backgroundEnd`. */
  textOnDark: string
  /** WCAG AA-safe text color for content sitting on `accent`. */
  textOnAccent: string
  /** True when the resolved background reads as dark overall (drives default text/icon choices for photo_ai overlays). */
  isDarkBackground: boolean
}

export interface TemplateFieldSchema {
  key: string
  label: string
  required: boolean
  /** Hard character ceiling — enforced both in the design-post.ts LLM prompt AND clamped in code (catalog.ts#clampFieldsToSchema). */
  maxChars: number
  /** Informational only (not hard-enforced) — guidance for the design LLM / composer UI. */
  minChars?: number
  helpText?: string
}

/** Where the AI-generated background photo goes, for templates that allow `photo_ai` (render.ts composites this with sharp — see the module header there). */
export interface PhotoLayerSpec {
  region: { x: number; y: number; width: number; height: number }
  /** A vertical dark->transparent scrim behind the region's bottom `heightFraction`, for legibility of text sitting over the photo. Omit for templates that keep all text off the photo region entirely (e.g. promo-v1's split layout). */
  scrim?: { heightFraction: number; colorHex: string; maxOpacityPercent: number }
}

/** The build() context passed to every template's element-tree builder. */
export interface TemplateBuildContext {
  size: TemplateSize
  roles: ColorRoles
  /** Already clamped/validated against the template's field schema (catalog.ts#clampFieldsToSchema). */
  fields: Record<string, string>
  /** A `data:` URI for the org's brand_kit.logo_url, or null when absent/unset/unfetchable — templates must skip the logo slot cleanly when null. */
  logoDataUri: string | null
  /** How the background is being handled for this render — 'solid'/'gradient' means the template should paint its own root background; 'photo_ai' means the template must leave the photo's region transparent (render.ts composites the photo + scrim underneath via sharp, then the type layer on top). */
  backgroundKind: BackgroundKind
  /** The single registered Satori font family name for all weights (400/700/900) — see render.ts#loadTemplateFonts. */
  fontFamily: string
  /** Deterministic seed for this render's decorative variant pick (src/lib/templates/variants.ts#pickVariant) — always resolved by render.ts (defaults to variants.ts#DEFAULT_SEED when the caller doesn't pass one), never empty. Callers typically pass the content item id or prompt so consecutive generations vary without ever being random-ugly. */
  seed: string
}

/** A Satori-compatible element — satori accepts plain {type, props} object trees (no JSX/React runtime required). See https://github.com/vercel/satori#jsx. */
export interface SatoriElement {
  type: string
  props: Record<string, unknown>
}

export type SatoriChild = SatoriElement | string | null | false | undefined
export type SatoriChildren = SatoriChild | SatoriChild[]

function normalizeChildren(children: SatoriChildren): unknown {
  if (Array.isArray(children)) {
    return children.filter((child): child is SatoriElement | string => Boolean(child))
  }
  return children || undefined
}

/** Raw element constructor — mirrors satori's own {type, props} shape exactly. */
export function el(type: string, props: Record<string, unknown> = {}): SatoriElement {
  return { type, props }
}

/**
 * Convenience constructor for the overwhelming majority of template nodes: a
 * flex div. Defaults `display: 'flex'` (Satori only implements flexbox
 * layout and requires it set explicitly on every element with children) —
 * pass `display` in `style` to override only if you really need to.
 */
export function box(style: Record<string, string | number>, children?: SatoriChildren): SatoriElement {
  return el("div", { style: { display: "flex", flexDirection: "row", ...style }, children: normalizeChildren(children) })
}

/** An `<img>` leaf — `src` must already be a `data:` URI (Satori does not fetch remote image URLs itself). */
export function img(src: string, style: Record<string, string | number>): SatoriElement {
  return el("img", { src, style })
}

export interface TemplateDef {
  id: string
  name: string
  /** Shown to the design LLM (design-post.ts) so it can pick the right template for a request. */
  description: string
  defaultSize: TemplateSize
  allowedBackgrounds: BackgroundKind[]
  fields: TemplateFieldSchema[]
  build: (ctx: TemplateBuildContext) => SatoriElement
  /** Required (and only meaningful) when 'photo_ai' is in allowedBackgrounds — describes where the composited photo goes. */
  photoLayer?: (size: TemplateSize) => PhotoLayerSpec
}
