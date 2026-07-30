// Dev-time vendoring script (Wave 3 — themed decorative assets). Run with
// `npx tsx scripts/vendor-theme-assets.ts` whenever the curated icon list
// below changes. NOT imported at runtime — the template engine (decorations.ts)
// reads the *generated* standalone .svg files + manifest.ts this script
// writes, never `node_modules` directly, so production never depends on
// these devDependencies being installed.
//
// License-approved sources ONLY (see the Wave 3 brief — do not add others):
//   - Noto Emoji, via @iconify-json/noto        (Apache License 2.0, Google)
//   - IconPark, via @iconify-json/icon-park     (Apache License 2.0, ByteDance)
// Both ship a machine-readable icons.json (iconify's "icon set" JSON format:
// { prefix, width, height, icons: { [name]: { body, width?, height? } } }) —
// this script extracts SVG bodies straight from that file, so nothing is
// scraped over the network.
//
// Output:
//   src/lib/templates/assets/<occasion>/<name>.svg  — standalone, self-closed
//     SVG documents (real files, committed to git — see the module header
//     of decorations.ts for why runtime never touches node_modules for this).
//   src/lib/templates/assets/manifest.ts             — generated registry:
//     every vendored asset (key, source, license, file path, which
//     occasion(s) use it). src/lib/templates/themes.ts reads this at
//     runtime (a plain data import, not fs) to resolve theme -> asset paths.
//
// Some icons are reused across occasions ("shared" in the brief) — each
// distinct icon is written to disk exactly once (under its *primary*
// occasion's folder) and referenced by path from every occasion that uses
// it, rather than duplicating the same bytes into multiple folders.

import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.join(__dirname, "..")
const ASSETS_DIR = path.join(REPO_ROOT, "src", "lib", "templates", "assets")
const MANIFEST_PATH = path.join(ASSETS_DIR, "manifest.ts")

type Source = "noto" | "icon-park"

interface IconSetJson {
  prefix: string
  width: number
  height: number
  icons: Record<string, { body: string; width?: number; height?: number }>
}

interface SourceMeta {
  packageName: string
  license: string
  attribution: string
}

const SOURCES: Record<Source, SourceMeta> = {
  noto: {
    packageName: "@iconify-json/noto",
    license: "Apache-2.0",
    attribution: "Noto Emoji, Google",
  },
  "icon-park": {
    packageName: "@iconify-json/icon-park",
    license: "Apache-2.0",
    attribution: "IconPark, ByteDance",
  },
}

/** One curated icon request: which source/icon-name to pull, which occasion folder it's written under (its *primary* occasion), and every occasion key that should reference it (primary first). */
interface CuratedAsset {
  source: Source
  /** Candidate icon names to try, in preference order — the script picks the first that exists and reports the pick; every other candidate is logged as a documented alternative for the record. */
  candidates: string[]
  /** Stable output filename (without extension) — kept short/semantic, independent of the exact upstream icon name picked. */
  outputName: string
  primaryOccasion: string
  occasions: string[]
  /** Emitted verbatim into the manifest entry — e.g. flags a religious symbol as opt-in-only so consuming code (themes.ts) never auto-applies it. */
  note?: string
}

const CURATED: CuratedAsset[] = [
  // --- christmas ---
  { source: "noto", candidates: ["christmas-tree"], outputName: "christmas-tree", primaryOccasion: "christmas", occasions: ["christmas"] },
  { source: "noto", candidates: ["santa-claus"], outputName: "santa-claus", primaryOccasion: "christmas", occasions: ["christmas"] },
  { source: "noto", candidates: ["wrapped-gift", "gift"], outputName: "wrapped-gift", primaryOccasion: "christmas", occasions: ["christmas", "birthday"] },
  { source: "noto", candidates: ["star"], outputName: "star", primaryOccasion: "christmas", occasions: ["christmas"] },
  { source: "noto", candidates: ["snowman-without-snow", "snowman"], outputName: "snowman-without-snow", primaryOccasion: "christmas", occasions: ["christmas"] },

  // --- new-year ---
  { source: "noto", candidates: ["party-popper"], outputName: "party-popper", primaryOccasion: "new-year", occasions: ["new-year", "birthday"] },
  { source: "noto", candidates: ["confetti-ball"], outputName: "confetti-ball", primaryOccasion: "new-year", occasions: ["new-year", "celebration-generic"] },
  { source: "noto", candidates: ["fireworks"], outputName: "fireworks", primaryOccasion: "new-year", occasions: ["new-year", "diwali"] },
  { source: "noto", candidates: ["sparkler"], outputName: "sparkler", primaryOccasion: "new-year", occasions: ["new-year"] },
  { source: "noto", candidates: ["clinking-glasses"], outputName: "clinking-glasses", primaryOccasion: "new-year", occasions: ["new-year"] },

  // --- diwali ---
  { source: "noto", candidates: ["diya-lamp"], outputName: "diya-lamp", primaryOccasion: "diwali", occasions: ["diwali"] },
  { source: "noto", candidates: ["sparkles"], outputName: "sparkles", primaryOccasion: "diwali", occasions: ["diwali", "eid", "sale-generic", "celebration-generic"] },
  // fireworks reused from new-year — see the "new-year" entry above (occasions includes "diwali").

  // --- halloween ---
  { source: "noto", candidates: ["jack-o-lantern"], outputName: "jack-o-lantern", primaryOccasion: "halloween", occasions: ["halloween"] },
  { source: "noto", candidates: ["ghost"], outputName: "ghost", primaryOccasion: "halloween", occasions: ["halloween"] },
  { source: "noto", candidates: ["spider-web"], outputName: "spider-web", primaryOccasion: "halloween", occasions: ["halloween"] },
  { source: "noto", candidates: ["bat"], outputName: "bat", primaryOccasion: "halloween", occasions: ["halloween"] },

  // --- eid (religious symbol — opt-in only, see note) ---
  {
    source: "noto",
    candidates: ["crescent-moon"],
    outputName: "crescent-moon",
    primaryOccasion: "eid",
    occasions: ["eid"],
    note: "Religious symbol — opt-in only. Never auto-applied by heuristics; only usable when the requester's copy explicitly names the occasion (e.g. \"Eid\").",
  },
  // sparkles reused from diwali — see above (occasions includes "eid").

  // --- valentines ---
  { source: "noto", candidates: ["red-heart"], outputName: "red-heart", primaryOccasion: "valentines", occasions: ["valentines"] },
  { source: "noto", candidates: ["sparkling-heart"], outputName: "sparkling-heart", primaryOccasion: "valentines", occasions: ["valentines"] },
  { source: "noto", candidates: ["rose"], outputName: "rose", primaryOccasion: "valentines", occasions: ["valentines"] },

  // --- birthday ---
  { source: "noto", candidates: ["birthday-cake"], outputName: "birthday-cake", primaryOccasion: "birthday", occasions: ["birthday"] },
  { source: "noto", candidates: ["balloon"], outputName: "balloon", primaryOccasion: "birthday", occasions: ["birthday"] },
  // wrapped-gift + party-popper reused from christmas / new-year — see above.

  // --- sale-generic ---
  { source: "icon-park", candidates: ["tag", "tag-one", "coupon", "percentage"], outputName: "tag", primaryOccasion: "sale-generic", occasions: ["sale-generic"] },
  { source: "noto", candidates: ["ribbon"], outputName: "ribbon", primaryOccasion: "sale-generic", occasions: ["sale-generic", "celebration-generic"] },
  // sparkles reused from diwali — see above (occasions includes "sale-generic").

  // --- celebration-generic ---
  // confetti-ball reused from new-year, ribbon reused from sale-generic, sparkles reused from diwali — all above.
]

async function loadIconSet(source: Source): Promise<IconSetJson> {
  const jsonPath = path.join(REPO_ROOT, "node_modules", SOURCES[source].packageName, "icons.json")
  const raw = await readFile(jsonPath, "utf8")
  return JSON.parse(raw) as IconSetJson
}

/** Wraps a raw iconify icon body into a standalone, self-contained SVG document. */
function toStandaloneSvg(body: string, width: number, height: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${body}</svg>\n`
}

interface ManifestEntry {
  key: string
  name: string
  source: Source
  license: string
  attribution: string
  path: string
  occasions: string[]
  note?: string
}

async function main() {
  console.log("[vendor-theme-assets] Loading icon sets...")
  const iconSets: Record<Source, IconSetJson> = {
    noto: await loadIconSet("noto"),
    "icon-park": await loadIconSet("icon-park"),
  }

  const manifest: ManifestEntry[] = []
  const skipped: string[] = []

  for (const asset of CURATED) {
    const set = iconSets[asset.source]
    let pickedName: string | null = null
    for (const candidate of asset.candidates) {
      if (Object.prototype.hasOwnProperty.call(set.icons, candidate)) {
        pickedName = candidate
        break
      }
    }

    if (!pickedName) {
      // Report near-miss candidates (substring match against every icon key
      // in the set) so a human can pick the closest documented name by hand.
      const firstCandidate = asset.candidates[0]
      const nearMisses = Object.keys(set.icons)
        .filter((key) => key.includes(firstCandidate.split("-")[0]))
        .slice(0, 10)
      console.warn(
        `[vendor-theme-assets] MISS: ${asset.source}/${asset.candidates.join(" | ")} for "${asset.outputName}" (occasions: ${asset.occasions.join(", ")}). Candidates in set: ${nearMisses.join(", ") || "(none found)"}`
      )
      skipped.push(asset.outputName)
      continue
    }

    if (pickedName !== asset.candidates[0]) {
      console.log(`[vendor-theme-assets] Using fallback name "${pickedName}" for "${asset.outputName}" (preferred "${asset.candidates[0]}" not found).`)
    }

    const icon = set.icons[pickedName]
    const width = icon.width ?? set.width
    const height = icon.height ?? set.height
    const svg = toStandaloneSvg(icon.body, width, height)

    const relativePath = path.posix.join(asset.primaryOccasion, `${asset.outputName}.svg`)
    const outDir = path.join(ASSETS_DIR, asset.primaryOccasion)
    await mkdir(outDir, { recursive: true })
    await writeFile(path.join(outDir, `${asset.outputName}.svg`), svg, "utf8")

    manifest.push({
      key: `${asset.source}:${pickedName}`,
      name: asset.outputName,
      source: asset.source,
      license: SOURCES[asset.source].license,
      attribution: SOURCES[asset.source].attribution,
      path: relativePath,
      occasions: asset.occasions,
      note: asset.note,
    })

    console.log(`[vendor-theme-assets] OK: ${asset.source}/${pickedName} -> ${relativePath} (occasions: ${asset.occasions.join(", ")})`)
  }

  const manifestSource = [
    "// GENERATED by scripts/vendor-theme-assets.ts — do not hand-edit.",
    "// Re-run `npx tsx scripts/vendor-theme-assets.ts` to regenerate after",
    "// changing the curated asset list in that script.",
    "//",
    "// Every entry here is a real vendored SVG file under this same directory",
    "// (src/lib/templates/assets/<path>) — this module is a plain data import",
    "// (no fs access), safe to import anywhere; src/lib/templates/themes.ts",
    "// reads it at build/render time to resolve a theme key to concrete asset",
    "// paths, and decorations.ts#stickerElement reads the actual SVG file at",
    "// render time (see that module's header for why the read happens there",
    "// instead of here).",
    "",
    "export interface ThemeAssetManifestEntry {",
    "  /** `${source}:${upstream icon name}` — stable identity for dedup/debugging, not used for lookups. */",
    "  key: string",
    "  /** Stable output name (matches the .svg filename, without extension). */",
    "  name: string",
    "  source: \"noto\" | \"icon-park\"",
    "  license: string",
    "  attribution: string",
    "  /** Relative to src/lib/templates/assets/ — e.g. \"christmas/christmas-tree.svg\". */",
    "  path: string",
    "  /** Every occasion key this asset is available for (first = its primary/home occasion, where the file physically lives). */",
    "  occasions: string[]",
    "  note?: string",
    "}",
    "",
    `export const THEME_ASSET_MANIFEST: ThemeAssetManifestEntry[] = ${JSON.stringify(manifest, null, 2)}`,
    "",
  ].join("\n")

  await writeFile(MANIFEST_PATH, manifestSource, "utf8")
  console.log(`[vendor-theme-assets] Wrote manifest with ${manifest.length} entries -> ${MANIFEST_PATH}`)

  if (skipped.length > 0) {
    console.warn(`[vendor-theme-assets] Skipped ${skipped.length} asset(s) with no matching icon name: ${skipped.join(", ")}`)
  }
}

main().catch((error) => {
  console.error("[vendor-theme-assets] Failed:", error)
  process.exitCode = 1
})
