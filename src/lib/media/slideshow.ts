import "server-only"

// Slideshow renderer — the cheap "video" format (MASTER_PLAN.md §4.A/§5:
// "Slideshows (default 'video') → FLUX images + FFmpeg"). Assembles 3-5
// still images (real URLs or solid-color placeholder specs, for demo mode)
// into a 1080x1920 H.264 MP4 with a subtle Ken Burns zoom per slide and a
// 0.4s crossfade between slides. No SDK — a single child_process spawn of
// the system `ffmpeg` binary, args array only (never a shell string), so
// behavior is fully auditable in one file.
//
// Cost: $0 (local CPU) — metered as units:1/cost:0 via src/lib/usage.ts so
// the "slideshows" allowance still caps how many an org can render per
// month, independent of dollar cost.

import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"

import { AllowanceDeniedError } from "@/lib/ai/errors"
import { checkAllowance, recordUsage } from "@/lib/usage"

// ===========================================================================
// Config
// ===========================================================================

const OUTPUT_WIDTH = 1080
const OUTPUT_HEIGHT = 1920
const FPS = 24
const CROSSFADE_SEC = 0.4
/** Subtle Ken Burns zoom ceiling — noticeable but never disorienting. */
const ZOOM_MAX = 1.12
const RENDER_TIMEOUT_MS = 60_000
const DOWNLOAD_TIMEOUT_MS = 15_000

const MIN_IMAGES = 3
const MAX_IMAGES = 5
const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10MB
const MAX_DURATION_PER_IMAGE_SEC = 10
const DEFAULT_DURATION_PER_IMAGE_SEC = 2.2
const DEFAULT_OUT_NAME = "output"

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])
const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

/** Basic SSRF guard — not exhaustive (no DNS resolution check), just blocks obvious loopback/metadata hosts. */
const BLOCKED_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "169.254.169.254"])

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/

/** Root temp directory every render lives under, keyed by render id — the API route reads from here too. */
export const SLIDESHOW_TMP_ROOT = path.join(os.tmpdir(), "localos-slideshows")

// ===========================================================================
// Errors
// ===========================================================================

export class FfmpegMissingError extends Error {
  constructor() {
    super("ffmpeg is not installed or not on PATH. Install ffmpeg to enable slideshow rendering.")
    this.name = "FfmpegMissingError"
  }
}

export class SlideshowValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SlideshowValidationError"
  }
}

export class SlideshowRenderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SlideshowRenderError"
  }
}

// ===========================================================================
// Public types
// ===========================================================================

/** A slide source: a remote http(s) image URL, or a solid-color placeholder spec for demo mode. */
export type SlideshowSource = string | { color: string; label?: string }

export interface RenderSlideshowInput {
  orgId: string
  /** 3-5 slide sources. */
  images: SlideshowSource[]
  /** Seconds each slide is fully visible before/after its crossfade. Default 2.2s. */
  durationPerImageSec?: number
  /** Base output filename (sanitized, no extension). Default "output". */
  outName?: string
}

export interface RenderSlideshowResult {
  filePath: string
  id: string
  durationSec: number
}

// ===========================================================================
// ffmpeg availability probe (cached — only ever actually spawned once)
// ===========================================================================

let ffmpegAvailability: Promise<boolean> | null = null

function probeFfmpeg(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const proc = spawn("ffmpeg", ["-version"], { stdio: "ignore", shell: false })
      proc.on("error", () => resolve(false))
      proc.on("close", (code) => resolve(code === 0))
    } catch {
      resolve(false)
    }
  })
}

async function isFfmpegAvailable(): Promise<boolean> {
  if (!ffmpegAvailability) {
    ffmpegAvailability = probeFfmpeg()
  }
  return ffmpegAvailability
}

// ===========================================================================
// Validation helpers
// ===========================================================================

function sanitizeOutName(raw?: string): string {
  if (!raw) return DEFAULT_OUT_NAME
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64)
  return cleaned || DEFAULT_OUT_NAME
}

function assertSafeUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new SlideshowValidationError(`Invalid image URL: ${raw}`)
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SlideshowValidationError(`Image URL must be http(s): ${raw}`)
  }
  const hostname = url.hostname.toLowerCase()
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith(".local")) {
    throw new SlideshowValidationError(`Image URL host is not allowed: ${hostname}`)
  }
  return url
}

function assertValidColor(color: string): void {
  if (!HEX_COLOR_RE.test(color)) {
    throw new SlideshowValidationError(`Invalid placeholder color (expected #rrggbb): ${color}`)
  }
}

/** Sniffs an image buffer's real format from its magic bytes — defense against a spoofed Content-Type header. */
function sniffImageExt(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpg"
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "png"
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp"
  }
  return null
}

// ===========================================================================
// Image download
// ===========================================================================

/** Downloads + validates (type, size, magic bytes) a remote image into `${destBasePath}.<ext>`. Returns the final path. */
async function downloadImage(url: URL, destBasePath: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(url.toString(), { signal: controller.signal, redirect: "follow" })
  } catch (error) {
    throw new SlideshowValidationError(
      `Failed to fetch image (${error instanceof Error ? error.message : "unknown error"}): ${url}`
    )
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    throw new SlideshowValidationError(`Failed to download image (HTTP ${res.status}): ${url}`)
  }

  const declaredType = res.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase()
  if (!declaredType || !ALLOWED_IMAGE_TYPES.has(declaredType)) {
    throw new SlideshowValidationError(
      `Unsupported or missing image content-type "${declaredType ?? "none"}": ${url}`
    )
  }

  const declaredLength = Number(res.headers.get("content-length") ?? "0")
  if (declaredLength > MAX_IMAGE_BYTES) {
    throw new SlideshowValidationError(`Image exceeds ${MAX_IMAGE_BYTES}-byte limit: ${url}`)
  }
  if (!res.body) {
    throw new SlideshowValidationError(`Empty response body for image: ${url}`)
  }

  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    total += chunk.byteLength
    if (total > MAX_IMAGE_BYTES) {
      throw new SlideshowValidationError(`Image exceeds ${MAX_IMAGE_BYTES}-byte limit: ${url}`)
    }
    chunks.push(Buffer.from(chunk))
  }

  const bytes = Buffer.concat(chunks)
  const sniffedExt = sniffImageExt(bytes)
  const declaredExt = EXT_BY_TYPE[declaredType]
  if (!sniffedExt || sniffedExt !== declaredExt) {
    throw new SlideshowValidationError(`Image content does not match declared type "${declaredType}": ${url}`)
  }

  const finalPath = `${destBasePath}.${declaredExt}`
  await fs.writeFile(finalPath, bytes)
  return finalPath
}

// ===========================================================================
// Per-slide input preparation
// ===========================================================================

interface PreparedInput {
  /** ffmpeg args for this input, up to and including its `-i <source>`. */
  inputArgs: string[]
  /** Local downloaded file path (image inputs only — null for lavfi color inputs), for post-render cleanup. */
  filePath: string | null
}

async function prepareInput(
  source: SlideshowSource,
  index: number,
  workDir: string,
  clipLenSec: number
): Promise<PreparedInput> {
  if (typeof source === "string") {
    const url = assertSafeUrl(source)
    const destBasePath = path.join(workDir, `input-${index}`)
    const filePath = await downloadImage(url, destBasePath)
    return {
      filePath,
      inputArgs: ["-framerate", String(FPS), "-loop", "1", "-t", clipLenSec.toFixed(3), "-i", filePath],
    }
  }

  assertValidColor(source.color)
  return {
    filePath: null,
    inputArgs: [
      "-f",
      "lavfi",
      "-t",
      clipLenSec.toFixed(3),
      "-i",
      `color=c=${source.color}:s=${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}:r=${FPS}`,
    ],
  }
}

// ===========================================================================
// Filter graph
// ===========================================================================

/** Scale-to-cover + crop to the target frame, then a slow continuous Ken Burns zoom (no drawtext/font dependency). */
function buildSlideFilter(index: number, clipLenSec: number): string {
  const totalFrames = Math.max(1, Math.round(clipLenSec * FPS))
  const zoomStep = (ZOOM_MAX - 1) / totalFrames
  return (
    `[${index}:v]scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:force_original_aspect_ratio=increase,` +
    `crop=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT},` +
    `scale=${OUTPUT_WIDTH * 2}:${OUTPUT_HEIGHT * 2},` +
    `zoompan=z='min(zoom+${zoomStep.toFixed(8)},${ZOOM_MAX})':d=1:` +
    `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}:fps=${FPS},` +
    `setsar=1[v${index}]`
  )
}

/**
 * Chains N per-slide streams with 0.4s xfade crossfades. Each slide's own
 * clip length already includes the crossfade overlap (clipLenSec =
 * durationPerImageSec + CROSSFADE_SEC), so each xfade `offset` advances by
 * exactly `durationPerImageSec` and the final duration comes out to
 * `N * durationPerImageSec + CROSSFADE_SEC`.
 */
function buildXfadeChain(count: number, clipLenSec: number): { filters: string[]; outputLabel: string } {
  if (count === 1) return { filters: [], outputLabel: "v0" }

  const filters: string[] = []
  let prevLabel = "v0"
  let accDur = clipLenSec

  for (let i = 1; i < count; i++) {
    const offset = Math.max(0, accDur - CROSSFADE_SEC)
    const isLast = i === count - 1
    const outLabel = isLast ? "vout" : `x${i}`
    filters.push(
      `[${prevLabel}][v${i}]xfade=transition=fade:duration=${CROSSFADE_SEC}:offset=${offset.toFixed(3)}[${outLabel}]`
    )
    prevLabel = outLabel
    accDur = accDur + clipLenSec - CROSSFADE_SEC
  }

  return { filters, outputLabel: prevLabel }
}

// ===========================================================================
// ffmpeg / ffprobe process runners
// ===========================================================================

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"], shell: false })
    let stderr = ""
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      proc.kill("SIGKILL")
      reject(new SlideshowRenderError(`ffmpeg render timed out after ${RENDER_TIMEOUT_MS}ms`))
    }, RENDER_TIMEOUT_MS)

    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString("utf8")).slice(-8000)
    })

    proc.on("error", (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(new SlideshowRenderError(`Failed to start ffmpeg: ${err.message}`))
    })

    proc.on("close", (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new SlideshowRenderError(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`))
    })
  })
}

/** Best-effort actual duration via ffprobe. Returns null (never throws) if ffprobe is missing or fails. */
function probeDurationSeconds(filePath: string): Promise<number | null> {
  return new Promise((resolve) => {
    try {
      const proc = spawn(
        "ffprobe",
        ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath],
        { stdio: ["ignore", "pipe", "ignore"], shell: false }
      )
      let stdout = ""
      proc.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8")
      })
      proc.on("error", () => resolve(null))
      proc.on("close", (code) => {
        if (code !== 0) {
          resolve(null)
          return
        }
        const value = Number.parseFloat(stdout.trim())
        resolve(Number.isFinite(value) ? value : null)
      })
    } catch {
      resolve(null)
    }
  })
}

// ===========================================================================
// Public entry point
// ===========================================================================

/**
 * Renders 3-5 still images into a 1080x1920 MP4 slideshow (Ken Burns zoom +
 * crossfades, no audio yet). Metered against the org's "slideshows"
 * allowance (fails closed via AllowanceDeniedError); demo-safe because
 * checkAllowance/recordUsage already no-op when Supabase isn't configured.
 *
 * Throws FfmpegMissingError, SlideshowValidationError, SlideshowRenderError,
 * or AllowanceDeniedError. On any failure the work directory is removed; on
 * success only the source images are cleaned up and the MP4 is left in
 * place at the returned `filePath` for the API route to stream.
 */
export async function renderSlideshow(input: RenderSlideshowInput): Promise<RenderSlideshowResult> {
  const { orgId, images } = input
  const durationPerImageSec = input.durationPerImageSec ?? DEFAULT_DURATION_PER_IMAGE_SEC
  const outName = sanitizeOutName(input.outName)

  if (typeof orgId !== "string" || orgId.trim().length === 0) {
    throw new SlideshowValidationError("renderSlideshow: orgId is required.")
  }
  if (!Array.isArray(images) || images.length < MIN_IMAGES || images.length > MAX_IMAGES) {
    throw new SlideshowValidationError(
      `renderSlideshow: images must contain ${MIN_IMAGES}-${MAX_IMAGES} sources (got ${
        Array.isArray(images) ? images.length : "a non-array"
      }).`
    )
  }
  if (
    !Number.isFinite(durationPerImageSec) ||
    durationPerImageSec <= 0 ||
    durationPerImageSec > MAX_DURATION_PER_IMAGE_SEC
  ) {
    throw new SlideshowValidationError(
      `renderSlideshow: durationPerImageSec must be between 0 and ${MAX_DURATION_PER_IMAGE_SEC}.`
    )
  }

  if (!(await isFfmpegAvailable())) {
    throw new FfmpegMissingError()
  }

  // Fails closed (see src/lib/usage.ts) and no-ops to { allowed: true } in
  // demo mode (Supabase not configured), so local dev never blocks here.
  const allowance = await checkAllowance(orgId, "slideshows")
  if (!allowance.allowed) {
    throw new AllowanceDeniedError("slideshows", allowance.reason)
  }

  const id = randomUUID()
  const workDir = path.join(SLIDESHOW_TMP_ROOT, id)
  await fs.mkdir(workDir, { recursive: true })

  const clipLenSec = durationPerImageSec + CROSSFADE_SEC
  const outputPath = path.join(workDir, `${outName}.mp4`)

  try {
    const prepared = await Promise.all(
      images.map((source, index) => prepareInput(source, index, workDir, clipLenSec))
    )

    const inputArgs = prepared.flatMap((p) => p.inputArgs)
    const slideFilters = prepared.map((_, index) => buildSlideFilter(index, clipLenSec))
    const { filters: xfadeFilters, outputLabel } = buildXfadeChain(prepared.length, clipLenSec)
    const filterComplex = [...slideFilters, ...xfadeFilters].join(";")

    const args = [
      "-y",
      "-loglevel",
      "error",
      ...inputArgs,
      "-filter_complex",
      filterComplex,
      "-map",
      `[${outputLabel}]`,
      "-r",
      String(FPS),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      // TODO(audio): mix in a licensed royalty-free music bed here once one
      // is selected (MASTER_PLAN.md §5) — e.g. an extra `-i track.mp3`
      // input + `-c:a aac -shortest`. No audio track for now.
      "-an",
      outputPath,
    ]

    await runFfmpeg(args)

    // The mp4 now has everything it needs — drop the downloaded sources.
    await Promise.all(
      prepared.map((p) => (p.filePath ? fs.unlink(p.filePath).catch(() => {}) : Promise.resolve()))
    )

    const estimatedDurationSec = prepared.length * durationPerImageSec + CROSSFADE_SEC
    const durationSec = (await probeDurationSeconds(outputPath)) ?? estimatedDurationSec

    await recordUsage(orgId, {
      feature: "slideshows",
      units: 1,
      costUsd: 0,
      metadata: { imageCount: prepared.length, durationPerImageSec, durationSec },
    })

    return { filePath: outputPath, id, durationSec }
  } catch (error) {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {})
    throw error
  }
}
