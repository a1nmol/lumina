import "server-only"

// The code-rendered template pipeline (MASTER_PLAN.md — replaces raw-diffusion
// posters with real, code-drawn typography; AI only writes copy + an optional
// text-free background). Mirrors src/lib/media/slideshow.ts's runtime
// discipline: a single well-audited pipeline, explicit timeouts + size caps
// on every network fetch, typed errors instead of opaque throws, and no
// dependency on anything client-supplied being trusted without validation.
//
// Pipeline: resolve template -> auto-fit text (autofit.ts, done inside each
// template's build()) -> build the Satori element tree (transparent root when
// the background is an AI photo, baked-in solid/gradient otherwise) ->
// satori() to SVG -> @resvg/resvg-js to PNG -> if a photo background is
// requested, composite (sharp) photo + bottom scrim UNDER the type/logo PNG;
// otherwise the resvg PNG IS the final image.

import { readFile } from "node:fs/promises"
import net from "node:net"
import path from "node:path"
import type { ReactNode } from "react"

import { Resvg } from "@resvg/resvg-js"
import satori from "satori"
import sharp, { type OverlayOptions } from "sharp"

import type { BrandKit } from "@/lib/types"

import { clampFieldsToSchema, getTemplate, resolveColorRoles } from "./catalog"
import { computeDensityMode } from "./density"
import { parseElementKeys } from "./elements"
import { applyThemeToRoles, resolveThemeAssets } from "./themes"
import { isTallFormat, type BackgroundKind, type Colorway, type PhotoLayerSpec, type SatoriElement, type TemplateDef, type TemplateSize } from "./types"
import { DEFAULT_SEED, pickAxis } from "./variants"

// ===========================================================================
// Errors
// ===========================================================================

export class TemplateNotFoundError extends Error {
  constructor(templateId: string) {
    super(`Unknown template id "${templateId}".`)
    this.name = "TemplateNotFoundError"
  }
}

export class TemplateFontsMissingError extends Error {
  constructor(missing: string[]) {
    super(
      `Template rendering fonts are missing: ${missing.join(", ")}. See src/lib/templates/fonts/README.md for how to vendor them.`
    )
    this.name = "TemplateFontsMissingError"
  }
}

export class TemplateImageFetchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TemplateImageFetchError"
  }
}

export class TemplateRenderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TemplateRenderError"
  }
}

// ===========================================================================
// Font loading (vendored Inter TTFs — Satori needs real TTF/OTF font data)
// ===========================================================================

const FONT_FAMILY = "Inter"
const FONT_FILES = {
  regular: "Inter-Regular.ttf",
  bold: "Inter-Bold.ttf",
  black: "Inter-Black.ttf",
} as const

type FontWeightKey = keyof typeof FONT_FILES
type LoadedFonts = Record<FontWeightKey, Buffer>

// Resolved relative to process.cwd() (the project root under `next dev`/`next
// start`/vitest, all invoked from the repo root) rather than import.meta.url,
// so this works identically whether this module runs under Next's server
// bundler or plain Node (vitest, scripts/). See src/lib/templates/fonts/README.md.
function fontsDir(): string {
  return path.join(process.cwd(), "src", "lib", "templates", "fonts")
}

let cachedFonts: Promise<LoadedFonts> | null = null

async function loadFontsUncached(): Promise<LoadedFonts> {
  const dir = fontsDir()
  const entries = await Promise.all(
    (Object.entries(FONT_FILES) as Array<[FontWeightKey, string]>).map(async ([key, file]) => {
      try {
        return [key, await readFile(path.join(dir, file))] as const
      } catch {
        return [key, null] as const
      }
    })
  )

  const missing = entries.filter(([, buf]) => buf === null).map(([key]) => FONT_FILES[key])
  if (missing.length > 0) throw new TemplateFontsMissingError(missing)

  return Object.fromEntries(entries) as LoadedFonts
}

/** Loads (and caches) the vendored Inter TTFs. Throws TemplateFontsMissingError naming exactly which file(s) are absent — see fonts/README.md. */
function loadTemplateFonts(): Promise<LoadedFonts> {
  if (!cachedFonts) {
    cachedFonts = loadFontsUncached().catch((error: unknown) => {
      cachedFonts = null // allow a retry later (e.g. once the files are dropped in) instead of caching the failure forever.
      throw error
    })
  }
  return cachedFonts
}

// ===========================================================================
// Trusted image fetch (fal.ai background photos + org-supplied brand logos)
// ===========================================================================

const IMAGE_FETCH_TIMEOUT_MS = 12_000
const MAX_IMAGE_BYTES = 8 * 1024 * 1024 // 8MB
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])
/** fal.ai's own hosts — the ONLY allowed hosts for a `photo_ai` background, matching src/lib/media/slideshow.ts's allowlist for the same reason (these URLs only ever legitimately come from this codebase's own generate-image.ts call). */
const FAL_IMAGE_HOST_SUFFIXES = ["fal.media", "fal.run"] as const

function isAllowedHostname(hostname: string, allowedSuffixes: readonly string[] | null): boolean {
  if (!allowedSuffixes) return true // no allowlist configured — see fetchImageBuffer's caller-supplied `allowedHostSuffixes` doc.
  return allowedSuffixes.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`))
}

/**
 * Downloads + validates (protocol, host, redirect, content-type, size) a
 * remote image into memory. Mirrors slideshow.ts#downloadImage's discipline
 * (manual-redirect fetch, abort timeout, byte cap enforced both via
 * Content-Length AND while streaming) but returns bytes directly since
 * callers here need them in-process (base64 for a logo `data:` URI, or a
 * sharp composite input) rather than written to disk.
 *
 * `allowedHostSuffixes`: pass FAL_IMAGE_HOST_SUFFIXES for AI-generated
 * background photos (their only legitimate source). Pass `null` for brand
 * logos — brand_kit.logo_url is an arbitrary http(s) URL the org owner
 * pasted into Business Brain settings (settings/brain/actions.ts#isValidLogoUrl
 * only requires a valid http(s) URL, not a specific host), so no fixed
 * allowlist applies there; literal-IP hosts are still rejected as
 * defense-in-depth.
 */
async function fetchImageBuffer(
  rawUrl: string,
  allowedHostSuffixes: readonly string[] | null
): Promise<{ buffer: Buffer; contentType: string }> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new TemplateImageFetchError("Invalid image URL.")
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TemplateImageFetchError("Invalid image URL protocol.")
  }
  const hostname = url.hostname.toLowerCase()
  if (net.isIP(hostname) !== 0) {
    throw new TemplateImageFetchError("Image URL host is not allowed.")
  }
  if (!isAllowedHostname(hostname, allowedHostSuffixes)) {
    throw new TemplateImageFetchError("Image URL host is not allowed.")
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(url.toString(), { signal: controller.signal, redirect: "manual" })
  } catch (error) {
    throw new TemplateImageFetchError(
      `Failed to fetch image (${error instanceof Error ? error.message : "unknown error"}).`
    )
  } finally {
    clearTimeout(timer)
  }

  if (res.status >= 300 && res.status < 400) {
    throw new TemplateImageFetchError("Image URL responded with a redirect, which is not allowed.")
  }
  if (!res.ok) {
    throw new TemplateImageFetchError(`Failed to download image (HTTP ${res.status}).`)
  }

  const declaredType = res.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase()
  if (!declaredType || !ALLOWED_IMAGE_TYPES.has(declaredType)) {
    throw new TemplateImageFetchError(`Unsupported image content-type "${declaredType ?? "none"}".`)
  }
  const declaredLength = Number(res.headers.get("content-length") ?? "0")
  if (declaredLength > MAX_IMAGE_BYTES) {
    throw new TemplateImageFetchError("Image exceeds size limit.")
  }
  if (!res.body) {
    throw new TemplateImageFetchError("Empty image response body.")
  }

  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    total += chunk.byteLength
    if (total > MAX_IMAGE_BYTES) {
      throw new TemplateImageFetchError("Image exceeds size limit.")
    }
    chunks.push(Buffer.from(chunk))
  }

  return { buffer: Buffer.concat(chunks), contentType: declaredType }
}

async function loadLogoDataUri(logoUrl: string | undefined | null): Promise<string | null> {
  const trimmed = logoUrl?.trim()
  if (!trimmed) return null
  try {
    const { buffer, contentType } = await fetchImageBuffer(trimmed, null)
    return `data:${contentType};base64,${buffer.toString("base64")}`
  } catch (error) {
    // Skip cleanly — a broken/unreachable logo URL should never fail an
    // entire poster render (per the Wave 1 brief: "skip cleanly if absent").
    console.error(`[templates] Skipping logo — ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

// ===========================================================================
// Satori -> SVG -> PNG
// ===========================================================================

async function rasterize(tree: SatoriElement, size: TemplateSize, fonts: LoadedFonts): Promise<Buffer> {
  const svg = await satori(tree as unknown as ReactNode, {
    width: size.width,
    height: size.height,
    fonts: [
      { name: FONT_FAMILY, data: fonts.regular, weight: 400, style: "normal" },
      { name: FONT_FAMILY, data: fonts.bold, weight: 700, style: "normal" },
      { name: FONT_FAMILY, data: fonts.black, weight: 900, style: "normal" },
    ],
  })

  return new Resvg(svg, { fitTo: { mode: "width", value: size.width } }).render().asPng()
}

// ===========================================================================
// Photo background compositing (sharp)
// ===========================================================================

function buildScrimSvg(region: { width: number; height: number }, scrim: NonNullable<PhotoLayerSpec["scrim"]>): string {
  const transparentStop = Math.max(0, Math.min(1, 1 - scrim.heightFraction))
  const opacity = Math.max(0, Math.min(100, scrim.maxOpacityPercent)) / 100
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${region.width}" height="${region.height}">`,
    `<defs><linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">`,
    `<stop offset="0" stop-color="${scrim.colorHex}" stop-opacity="0" />`,
    `<stop offset="${transparentStop.toFixed(4)}" stop-color="${scrim.colorHex}" stop-opacity="0" />`,
    `<stop offset="1" stop-color="${scrim.colorHex}" stop-opacity="${opacity.toFixed(3)}" />`,
    `</linearGradient></defs>`,
    `<rect width="100%" height="100%" fill="url(#scrim)" />`,
    `</svg>`,
  ].join("")
}

async function compositePhotoBackground(input: {
  size: TemplateSize
  backgroundHex: string
  photoBuffer: Buffer
  photoLayer: PhotoLayerSpec
  typeLayerPng: Buffer
}): Promise<Buffer> {
  const { size, backgroundHex, photoBuffer, photoLayer, typeLayerPng } = input

  const resizedPhoto = await sharp(photoBuffer)
    .resize(photoLayer.region.width, photoLayer.region.height, { fit: "cover", position: "centre" })
    .png()
    .toBuffer()

  const composites: OverlayOptions[] = [
    { input: resizedPhoto, left: photoLayer.region.x, top: photoLayer.region.y },
  ]

  if (photoLayer.scrim) {
    const scrimPng = new Resvg(buildScrimSvg(photoLayer.region, photoLayer.scrim), {
      fitTo: { mode: "width", value: photoLayer.region.width },
    })
      .render()
      .asPng()
    composites.push({ input: scrimPng, left: photoLayer.region.x, top: photoLayer.region.y })
  }

  composites.push({ input: typeLayerPng, left: 0, top: 0 })

  return sharp({
    create: { width: size.width, height: size.height, channels: 4, background: backgroundHex },
  })
    .composite(composites)
    .png()
    .toBuffer()
}

// ===========================================================================
// Wave 4 format-density coupling (design-review fix)
// ===========================================================================

/**
 * A render's total non-empty field character count below this reads as
 * "thin content" even when a template's own optional-field count doesn't
 * cross into density.ts's "rich" tier (e.g. a template with 3+ optional
 * fields that are all still just a word or two) — a second, template-
 * agnostic signal alongside densityMode. Calibrated against this catalog's
 * real sample copy: a fully-filled event-poster hackathon sample runs
 * ~185 chars; a bare-minimum one (required fields only, short copy) runs
 * ~60-90 chars. 90 sits just above that floor.
 */
const CONTENT_VOLUME_CHAR_THRESHOLD = 90

/**
 * Resolves the "format" variety axis with content-volume awareness: a tall
 * format (portrait/story — types.ts#isTallFormat) is only ELIGIBLE for the
 * seeded auto-pick when this render's content can plausibly own the extra
 * height — densityMode isn't "rich" (per `def.densityFields`, when the
 * template declares it) AND the total non-empty field character count
 * clears CONTENT_VOLUME_CHAR_THRESHOLD. Sparse content restricts the pick
 * to non-tall sizes only (currently always square, the only non-tall entry
 * in every template's supportedSizes).
 *
 * This governs the AUTOMATIC pick only — an explicit `input.size` always
 * wins (see renderTemplate below), and the 4 full-axis templates still
 * guarantee a mid-band filler (decorations.ts#midBandFiller) whenever a
 * tall format DOES end up rendering, however it was chosen, so an explicit
 * portrait/story pin on sparse content still reads full.
 */
function resolveFormat(def: TemplateDef, fields: Record<string, string>, seed: string): TemplateSize {
  const supported = def.supportedSizes && def.supportedSizes.length > 0 ? def.supportedSizes : [def.defaultSize]
  if (supported.length === 1) return supported[0]

  const densityMode = def.densityFields ? computeDensityMode(def.densityFields(fields)) : null
  const totalChars = Object.values(fields).reduce((sum, value) => sum + value.trim().length, 0)
  const contentIsSparse = densityMode === "rich" || totalChars < CONTENT_VOLUME_CHAR_THRESHOLD

  const eligible = contentIsSparse ? supported.filter((candidate) => !isTallFormat(candidate)) : supported
  // Never leave a template with zero eligible sizes (e.g. every declared
  // size happens to be tall) — fall back to the full pool rather than throw.
  const pool = eligible.length > 0 ? eligible : supported
  return pickAxis(seed, "format", pool)
}

// ===========================================================================
// Public entry point
// ===========================================================================

export type RenderBackgroundInput =
  | { type: "solid" }
  | { type: "gradient" }
  | { type: "photo_ai"; imageUrl: string }

export interface RenderTemplateInput {
  templateId: string
  fields: Record<string, string>
  colorway?: Colorway
  background?: RenderBackgroundInput
  brandKit?: BrandKit | null
  size?: TemplateSize
  /** Deterministic seed for decorative variant selection (variants.ts#pickVariant) — pass the content item id or prompt so consecutive generations vary; defaults to variants.ts#DEFAULT_SEED (always the same variant) when omitted. */
  seed?: string
  /**
   * Optional themed decoration pass (Wave 3 — src/lib/templates/themes.ts).
   * When present with a recognized `key`, this resolves 2-4 vendored
   * stickers (deterministic from `seed`) and nudges the resolved color
   * roles' accent/background toward the theme's palette hint (brand primary
   * is never overridden) before the template builds its tree. An unknown
   * key, or a template with no sticker slots, degrades cleanly to "no
   * stickers" — never a render failure.
   */
  theme?: { key: string }
  /**
   * Wave 4 — semantic elements the design LLM chose for this request (raw,
   * untrusted model output — see src/lib/templates/elements.ts#parseElementKeys,
   * which this always runs through before templates ever see it). Unknown
   * keys, non-string entries, dupes, and anything past the first 4 are
   * dropped silently, same "defensive, degrade cleanly" contract as `theme`.
   */
  elements?: string[]
}

/**
 * Renders one template to a flattened PNG buffer. Throws TemplateNotFoundError
 * (unknown templateId), TemplateFieldValidationError (a required field is
 * missing after clamping — see catalog.ts), TemplateFontsMissingError (see
 * fonts/README.md), TemplateImageFetchError (the photo_ai background image
 * couldn't be downloaded), or TemplateRenderError (Satori/resvg/sharp
 * failure). Callers that want a raw-image fallback on ANY of these (e.g.
 * src/app/(app)/studio/actions.ts) should wrap the whole call in one
 * try/catch rather than branching per error type.
 */
export async function renderTemplate(input: RenderTemplateInput): Promise<Buffer> {
  const def = getTemplate(input.templateId)
  if (!def) throw new TemplateNotFoundError(input.templateId)

  const requestedBackground: BackgroundKind = input.background?.type ?? "solid"
  const backgroundKind: BackgroundKind = def.allowedBackgrounds.includes(requestedBackground)
    ? requestedBackground
    : "solid" // e.g. a photo_ai request against quote-v1 (which never allows photos) demotes cleanly rather than failing the render.

  const seed = input.seed?.trim() || DEFAULT_SEED
  // Clamped before format resolution now (Wave 4 design-review fix) — the
  // format-density coupling below needs the final field values (character
  // count, densityMode) to decide which sizes are even eligible.
  const fields = clampFieldsToSchema(def, input.fields)
  // Wave 4 "format" variety axis: an unpinned request picks one of the
  // template's own supported sizes, seeded and content-volume-aware — see
  // resolveFormat above. A template that doesn't declare supportedSizes
  // (every pre-Wave-4 template) always resolves to its single defaultSize,
  // unchanged behavior. An explicit `input.size` always wins outright.
  const size = input.size ?? resolveFormat(def, fields, seed)
  const colorway = input.colorway ?? "brand"
  const baseRoles = resolveColorRoles(input.brandKit ?? null, colorway, backgroundKind)
  const roles = input.theme?.key ? applyThemeToRoles(baseRoles, input.theme.key) : baseRoles

  const [fonts, logoDataUri] = await Promise.all([loadTemplateFonts(), loadLogoDataUri(input.brandKit?.logo_url)])

  // A theme is only meaningful when it actually resolves to at least one
  // vendored asset — an unknown/typo'd key degrades to "no theme" here
  // rather than merely "no stickers," so a bad key doesn't even nudge the
  // palette above without anything decorative to show for it. (applyThemeToRoles
  // was already called with the raw key, which is fine — getTheme() there
  // independently no-ops on an unknown key too; this just governs the
  // build-context `theme` field template defs read for stickers.)
  const themeAssets = input.theme?.key ? resolveThemeAssets(input.theme.key, seed) : []
  const theme = input.theme?.key && themeAssets.length > 0 ? { key: input.theme.key, assets: themeAssets } : undefined
  const elements = parseElementKeys(input.elements)

  const tree = await def.build({
    size,
    roles,
    fields,
    logoDataUri,
    backgroundKind,
    fontFamily: FONT_FAMILY,
    seed,
    theme,
    elements,
  })

  try {
    const typeLayerPng = await rasterize(tree, size, fonts)

    if (backgroundKind !== "photo_ai") {
      return typeLayerPng
    }

    if (input.background?.type !== "photo_ai" || !def.photoLayer) {
      // Demoted above already if the template disallows photo_ai; this only
      // guards the (unreachable in practice) case of a mismatched input.
      return typeLayerPng
    }

    const { buffer: photoBuffer } = await fetchImageBuffer(input.background.imageUrl, FAL_IMAGE_HOST_SUFFIXES)

    return await compositePhotoBackground({
      size,
      backgroundHex: roles.backgroundEnd,
      photoBuffer,
      photoLayer: def.photoLayer(size),
      typeLayerPng,
    })
  } catch (error) {
    if (error instanceof TemplateImageFetchError) throw error
    throw new TemplateRenderError(
      `Failed to render template "${def.id}": ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
