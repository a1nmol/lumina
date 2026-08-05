// Dev-time vendoring script (Wave 3 occasions + Wave 4 topics). Run with
// `npx tsx scripts/vendor-theme-assets.ts` whenever the curated icon lists
// below change. NOT imported at runtime — the template engine (decorations.ts)
// reads the *generated* standalone .svg files + manifest.ts this script
// writes, never `node_modules` directly, so production never depends on
// these devDependencies being installed.
//
// License-approved sources ONLY (see the Wave 3/4 briefs — do not add others):
//   - IconPark, via @iconify-json/icon-park     (Apache License 2.0, ByteDance)
//   - MingCute, via @iconify-json/mingcute      (Apache License 2.0, MingCute)
// Both ship a machine-readable icons.json (iconify's "icon set" JSON format:
// { prefix, width, height, icons: { [name]: { body, width?, height? } } }) —
// this script extracts SVG bodies straight from that file, so nothing is
// scraped over the network.
//
// Wave 4 owner law: emoji-style flat art is OUT. Every entry below resolves
// to a mono/two-tone, stroke- or filled-outline "drawn icon" source
// (IconPark, MingCute) — never Noto Emoji. The previous Noto-sourced set has
// been fully replaced; @iconify-json/noto is no longer read by this script
// (see package.json — the devDependency itself is dropped once this runs).
//
// Output:
//   src/lib/templates/assets/<occasion>/<name>.svg   — occasion (festival)
//     decorative assets, referenced by src/lib/templates/themes.ts.
//   src/lib/templates/assets/topics/<topic>/<name>.svg — Wave 4 semantic
//     "topic" vocabulary assets (business verticals: tech, food, salon,
//     trades, retail, fitness, music-events, celebration), referenced by
//     src/lib/ai/design-post.ts's element vocabulary + template element slots.
//   src/lib/templates/assets/manifest.ts             — generated registry:
//     every vendored asset (key, source, license, file path, which
//     occasion(s)/topic(s) use it). themes.ts + the element-catalog resolver
//     read this at runtime (a plain data import, not fs) to resolve a
//     key -> concrete asset path(s).
//
// Some icons are reused across occasions/topics ("shared" in the brief) —
// each distinct icon is written to disk exactly once (under its *primary*
// occasion/topic folder) and referenced by path from every occasion/topic
// that uses it, rather than duplicating the same bytes into multiple folders.

import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.join(__dirname, "..")
const ASSETS_DIR = path.join(REPO_ROOT, "src", "lib", "templates", "assets")
const TOPICS_DIR = path.join(ASSETS_DIR, "topics")
const MANIFEST_PATH = path.join(ASSETS_DIR, "manifest.ts")

type Source = "icon-park" | "mingcute"

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
  "icon-park": {
    packageName: "@iconify-json/icon-park",
    license: "Apache-2.0",
    attribution: "IconPark, ByteDance",
  },
  mingcute: {
    packageName: "@iconify-json/mingcute",
    license: "Apache-2.0",
    attribution: "MingCute Icon",
  },
}

/** One curated icon request: which source/icon-name to pull, which folder it's written under (its *primary* occasion or topic), and every occasion/topic key that should reference it (primary first). Exactly one of `occasions`/`topics` is set per entry — occasions live under assets/<occasion>/, topics under assets/topics/<topic>/. */
interface CuratedAsset {
  source: Source
  /** Candidate icon names to try, in preference order — the script picks the first that exists and reports the pick; every other candidate is logged as a documented alternative for the record. */
  candidates: string[]
  /** Stable output filename (without extension) — kept short/semantic, independent of the exact upstream icon name picked. */
  outputName: string
  primaryGroup: string
  occasions?: string[]
  topics?: string[]
  /** Emitted verbatim into the manifest entry — e.g. flags a religious symbol as opt-in-only so consuming code (themes.ts) never auto-applies it. */
  note?: string
}

// ===========================================================================
// Occasions (festival/celebration themes — src/lib/templates/themes.ts).
// Drawn-style IconPark/MingCute equivalents of the old Noto Emoji set. Any
// occasion whose old Noto asset had no good drawn-icon match (santa-claus,
// sparkler, party-popper, ribbon, spider-web, confetti-ball) is intentionally
// dropped rather than kept as flat emoji art — themes.ts#resolveThemeAssets
// only needs >=2 pool entries per occasion, which every occasion below still
// clears with room to spare.
// ===========================================================================

const CURATED_OCCASIONS: CuratedAsset[] = [
  // --- christmas ---
  { source: "icon-park", candidates: ["christmas-tree", "christmas-tree-one"], outputName: "christmas-tree", primaryGroup: "christmas", occasions: ["christmas"] },
  { source: "mingcute", candidates: ["snowman-line"], outputName: "snowman", primaryGroup: "christmas", occasions: ["christmas"] },
  { source: "mingcute", candidates: ["gift-line"], outputName: "gift", primaryGroup: "christmas", occasions: ["christmas", "birthday"] },
  { source: "mingcute", candidates: ["star-line"], outputName: "star", primaryGroup: "christmas", occasions: ["christmas", "celebration-generic"] },

  // --- new-year ---
  { source: "mingcute", candidates: ["firework-line"], outputName: "firework", primaryGroup: "new-year", occasions: ["new-year", "diwali"] },
  { source: "mingcute", candidates: ["wineglass-2-line", "wineglass-line"], outputName: "toast-glass", primaryGroup: "new-year", occasions: ["new-year"] },
  // star (shared from christmas) rounds out new-year's pool.

  // --- diwali ---
  { source: "mingcute", candidates: ["candle-line", "candles-line"], outputName: "diya-lamp", primaryGroup: "diwali", occasions: ["diwali"] },
  { source: "mingcute", candidates: ["sparkles-line"], outputName: "sparkles", primaryGroup: "diwali", occasions: ["diwali", "eid", "sale-generic", "celebration-generic"] },
  // firework (shared from new-year) rounds out diwali's pool.

  // --- halloween ---
  { source: "mingcute", candidates: ["pumpkin-line", "pumpkin-lantern-line"], outputName: "pumpkin", primaryGroup: "halloween", occasions: ["halloween"] },
  { source: "mingcute", candidates: ["ghost-line"], outputName: "ghost", primaryGroup: "halloween", occasions: ["halloween"] },
  { source: "icon-park", candidates: ["bat"], outputName: "bat", primaryGroup: "halloween", occasions: ["halloween"] },

  // --- eid (religious symbol — opt-in only, see note) ---
  {
    source: "mingcute",
    candidates: ["moon-line", "moon-fill"],
    outputName: "crescent-moon",
    primaryGroup: "eid",
    occasions: ["eid"],
    note: "Religious symbol — opt-in only. Never auto-applied by heuristics; only usable when the requester's copy explicitly names the occasion (e.g. \"Eid\").",
  },
  // sparkles (shared from diwali) rounds out eid's pool.

  // --- valentines ---
  { source: "mingcute", candidates: ["heart-line"], outputName: "heart", primaryGroup: "valentines", occasions: ["valentines"] },
  { source: "mingcute", candidates: ["heart-hand-line", "hand-heart-line"], outputName: "heart-gesture", primaryGroup: "valentines", occasions: ["valentines"] },
  { source: "mingcute", candidates: ["rose-line"], outputName: "rose", primaryGroup: "valentines", occasions: ["valentines"] },

  // --- birthday ---
  { source: "mingcute", candidates: ["cake-line"], outputName: "birthday-cake", primaryGroup: "birthday", occasions: ["birthday"] },
  { source: "mingcute", candidates: ["balloon-2-line", "air-balloon-line"], outputName: "balloon", primaryGroup: "birthday", occasions: ["birthday"] },
  // gift (shared from christmas) rounds out birthday's pool.

  // --- sale-generic ---
  { source: "icon-park", candidates: ["tag", "tag-one", "coupon", "percentage"], outputName: "tag", primaryGroup: "sale-generic", occasions: ["sale-generic"] },
  { source: "mingcute", candidates: ["percentage-line"], outputName: "percent", primaryGroup: "sale-generic", occasions: ["sale-generic"] },
  // sparkles (shared from diwali) rounds out sale-generic's pool.

  // --- celebration-generic ---
  // sparkles, star, gift all reused from above — see their occasions arrays.
]

// ===========================================================================
// Topics (Wave 4 — semantic business-vertical vocabulary for AI-selected
// poster elements, src/lib/ai/design-post.ts + template element slots).
// Deliberately avoids exact-string collisions with decorations.ts's
// hand-transcribed Tier A ICON_KEYS (calendar, map-pin, clock, trophy,
// sparkles, arrow-right, star, megaphone, tag, phone, scissors, coffee,
// wrench, check, users, code, keyboard, laptop, bug, rocket, dumbbell,
// music, gift, camera, book, heart, leaf, paw, pizza, cup, scale,
// calendar-check, mic, ticket) — topics round OUT those verticals with
// additional vendored icons rather than duplicating the same concept.
// "confetti" has no good vendored icon anywhere in either source (verified
// by hand) — it's intentionally NOT here; it's a code-drawn shape
// (decorations.ts#confettiScatter) selectable from the same element catalog.
// ===========================================================================

const CURATED_TOPICS: CuratedAsset[] = [
  // --- tech ---
  { source: "mingcute", candidates: ["terminal-line"], outputName: "terminal", primaryGroup: "tech", topics: ["tech"] },
  { source: "mingcute", candidates: ["group-line"], outputName: "team", primaryGroup: "tech", topics: ["tech"] },
  { source: "mingcute", candidates: ["cloud-line"], outputName: "cloud", primaryGroup: "tech", topics: ["tech"] },
  { source: "icon-park", candidates: ["data-server", "server"], outputName: "server", primaryGroup: "tech", topics: ["tech"] },
  { source: "mingcute", candidates: ["chip-line"], outputName: "chip", primaryGroup: "tech", topics: ["tech"] },
  { source: "mingcute", candidates: ["monitor-line"], outputName: "monitor", primaryGroup: "tech", topics: ["tech"] },
  { source: "mingcute", candidates: ["mouse-line"], outputName: "computer-mouse", primaryGroup: "tech", topics: ["tech"] },
  { source: "mingcute", candidates: ["wifi-line"], outputName: "wifi", primaryGroup: "tech", topics: ["tech"] },
  { source: "icon-park", candidates: ["printer", "printer-one"], outputName: "printer", primaryGroup: "tech", topics: ["tech"] },
  { source: "icon-park", candidates: ["browser", "browser-chrome"], outputName: "browser", primaryGroup: "tech", topics: ["tech"] },

  // --- food (café/restaurant) ---
  { source: "mingcute", candidates: ["bread-line"], outputName: "bread", primaryGroup: "food", topics: ["food"] },
  { source: "mingcute", candidates: ["cake-line"], outputName: "cake-slice", primaryGroup: "food", topics: ["food"] },
  { source: "mingcute", candidates: ["table-line", "table-2-line"], outputName: "dining-table", primaryGroup: "food", topics: ["food"] },
  { source: "mingcute", candidates: ["truck-line"], outputName: "delivery-truck", primaryGroup: "food", topics: ["food", "retail"] },
  { source: "icon-park", candidates: ["coffee-machine"], outputName: "coffee-machine", primaryGroup: "food", topics: ["food"] },
  { source: "icon-park", candidates: ["cocktail"], outputName: "cocktail", primaryGroup: "food", topics: ["food"] },
  { source: "mingcute", candidates: ["wine-line"], outputName: "wine", primaryGroup: "food", topics: ["food"] },
  { source: "icon-park", candidates: ["teapot"], outputName: "teapot", primaryGroup: "food", topics: ["food"] },
  { source: "icon-park", candidates: ["sandwich", "sandwich-one"], outputName: "sandwich", primaryGroup: "food", topics: ["food"] },
  { source: "mingcute", candidates: ["hamburger-line"], outputName: "burger", primaryGroup: "food", topics: ["food"] },

  // --- salon (beauty/personal care) ---
  { source: "icon-park", candidates: ["comb"], outputName: "comb", primaryGroup: "salon", topics: ["salon"] },
  { source: "mingcute", candidates: ["mirror-line"], outputName: "mirror", primaryGroup: "salon", topics: ["salon"] },
  { source: "icon-park", candidates: ["nail-polish", "nail-polish-one"], outputName: "nail-polish", primaryGroup: "salon", topics: ["salon"] },
  { source: "mingcute", candidates: ["scissors-line", "scissors-2-line"], outputName: "scissors-2", primaryGroup: "salon", topics: ["salon"] },
  { source: "mingcute", candidates: ["brush-line", "brush-2-line"], outputName: "hair-brush", primaryGroup: "salon", topics: ["salon"] },
  { source: "icon-park", candidates: ["spa-candle"], outputName: "spa-candle", primaryGroup: "salon", topics: ["salon"] },
  { source: "icon-park", candidates: ["razor", "straight-razor"], outputName: "razor", primaryGroup: "salon", topics: ["salon"] },
  { source: "icon-park", candidates: ["perfume", "perfumer-bottle"], outputName: "perfume", primaryGroup: "salon", topics: ["salon"] },
  { source: "mingcute", candidates: ["lipstick-line"], outputName: "lipstick", primaryGroup: "salon", topics: ["salon"] },

  // --- trades (home services/contracting) ---
  { source: "mingcute", candidates: ["hammer-line"], outputName: "hammer", primaryGroup: "trades", topics: ["trades"] },
  { source: "icon-park", candidates: ["toolkit"], outputName: "toolbox", primaryGroup: "trades", topics: ["trades"] },
  { source: "mingcute", candidates: ["tool-line"], outputName: "tool", primaryGroup: "trades", topics: ["trades"] },
  { source: "icon-park", candidates: ["electric-drill"], outputName: "drill", primaryGroup: "trades", topics: ["trades"] },
  { source: "mingcute", candidates: ["clipboard-line"], outputName: "clipboard", primaryGroup: "trades", topics: ["trades"] },
  { source: "icon-park", candidates: ["ladder", "ladder-one"], outputName: "ladder", primaryGroup: "trades", topics: ["trades"] },
  { source: "mingcute", candidates: ["ruler-line", "pencil-ruler-line"], outputName: "ruler", primaryGroup: "trades", topics: ["trades"] },
  { source: "icon-park", candidates: ["tape-measure"], outputName: "tape-measure", primaryGroup: "trades", topics: ["trades"] },

  // --- retail (sale/promo) ---
  { source: "mingcute", candidates: ["percentage-line"], outputName: "percent-badge", primaryGroup: "retail", topics: ["retail"] },
  { source: "mingcute", candidates: ["shopping-bag-2-line", "shopping-bag-1-line"], outputName: "shopping-bag-2", primaryGroup: "retail", topics: ["retail"] },
  { source: "icon-park", candidates: ["bill"], outputName: "receipt", primaryGroup: "retail", topics: ["retail"] },
  { source: "mingcute", candidates: ["coupon-line"], outputName: "coupon", primaryGroup: "retail", topics: ["retail"] },
  { source: "mingcute", candidates: ["barcode-line"], outputName: "barcode", primaryGroup: "retail", topics: ["retail"] },
  { source: "mingcute", candidates: ["wallet-line", "wallet-2-line"], outputName: "wallet", primaryGroup: "retail", topics: ["retail"] },
  { source: "mingcute", candidates: ["shopping-cart-1-line", "shopping-cart-2-line"], outputName: "shopping-cart", primaryGroup: "retail", topics: ["retail"] },
  { source: "mingcute", candidates: ["gift-card-line"], outputName: "gift-card", primaryGroup: "retail", topics: ["retail"] },
  { source: "icon-park", candidates: ["stamp"], outputName: "stamp", primaryGroup: "retail", topics: ["retail"] },

  // --- fitness ---
  { source: "mingcute", candidates: ["run-line"], outputName: "running", primaryGroup: "fitness", topics: ["fitness"] },
  { source: "icon-park", candidates: ["heart-rate"], outputName: "heartbeat", primaryGroup: "fitness", topics: ["fitness"] },
  { source: "mingcute", candidates: ["yoga-line"], outputName: "yoga", primaryGroup: "fitness", topics: ["fitness"] },
  { source: "mingcute", candidates: ["run-treadmill-line"], outputName: "treadmill", primaryGroup: "fitness", topics: ["fitness"] },
  { source: "mingcute", candidates: ["medal-line"], outputName: "medal", primaryGroup: "fitness", topics: ["fitness", "celebration"] },
  { source: "mingcute", candidates: ["award-line"], outputName: "award", primaryGroup: "fitness", topics: ["fitness"] },
  { source: "icon-park", candidates: ["stopwatch", "stopwatch-start"], outputName: "stopwatch", primaryGroup: "fitness", topics: ["fitness"] },
  { source: "mingcute", candidates: ["bottle-line", "bottle-glass-line"], outputName: "water-bottle", primaryGroup: "fitness", topics: ["fitness"] },

  // --- music-events ---
  { source: "mingcute", candidates: ["guitar-line"], outputName: "guitar", primaryGroup: "music-events", topics: ["music-events"] },
  { source: "mingcute", candidates: ["headphone-line", "headphone-2-line"], outputName: "headphone", primaryGroup: "music-events", topics: ["music-events"] },
  { source: "icon-park", candidates: ["piano"], outputName: "piano", primaryGroup: "music-events", topics: ["music-events"] },
  { source: "mingcute", candidates: ["film-line"], outputName: "film", primaryGroup: "music-events", topics: ["music-events"] },
  { source: "mingcute", candidates: ["video-camera-line", "video-camera-2-line"], outputName: "video-camera", primaryGroup: "music-events", topics: ["music-events"] },
  { source: "mingcute", candidates: ["mic-2-line"], outputName: "microphone-2", primaryGroup: "music-events", topics: ["music-events"] },
  { source: "icon-park", candidates: ["ticket-one", "tickets-one"], outputName: "ticket-2", primaryGroup: "music-events", topics: ["music-events"] },
  { source: "mingcute", candidates: ["drum-line"], outputName: "drum", primaryGroup: "music-events", topics: ["music-events"] },
  { source: "icon-park", candidates: ["crown", "crown-two"], outputName: "crown", primaryGroup: "music-events", topics: ["music-events", "celebration"] },

  // --- celebration (drawn icons only — "confetti" itself is code-drawn, see decorations.ts#confettiScatter) ---
  { source: "mingcute", candidates: ["balloon-2-line", "air-balloon-line"], outputName: "balloon-2", primaryGroup: "celebration", topics: ["celebration"] },
  { source: "icon-park", candidates: ["gift-box"], outputName: "gift-box", primaryGroup: "celebration", topics: ["celebration"] },
  { source: "mingcute", candidates: ["sparkles-line"], outputName: "sparkle", primaryGroup: "celebration", topics: ["celebration"] },
  { source: "mingcute", candidates: ["celebrate-line"], outputName: "celebrate", primaryGroup: "celebration", topics: ["celebration"] },
  // medal + crown (shared from fitness/music-events) round out celebration's pool.
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
  occasions?: string[]
  topics?: string[]
  note?: string
}

async function processGroup(
  groupLabel: string,
  curated: CuratedAsset[],
  iconSets: Record<Source, IconSetJson>,
  outputRootDir: string,
  manifest: ManifestEntry[],
  skipped: string[]
) {
  for (const asset of curated) {
    const set = iconSets[asset.source]
    let pickedName: string | null = null
    for (const candidate of asset.candidates) {
      if (Object.prototype.hasOwnProperty.call(set.icons, candidate)) {
        pickedName = candidate
        break
      }
    }

    const groupKeys = asset.occasions ?? asset.topics ?? []

    if (!pickedName) {
      const firstCandidate = asset.candidates[0]
      const nearMisses = Object.keys(set.icons)
        .filter((key) => key.includes(firstCandidate.split("-")[0]))
        .slice(0, 10)
      console.warn(
        `[vendor-theme-assets] MISS (${groupLabel}): ${asset.source}/${asset.candidates.join(" | ")} for "${asset.outputName}" (groups: ${groupKeys.join(", ")}). Candidates in set: ${nearMisses.join(", ") || "(none found)"}`
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

    const relativePath = path.posix.join(
      ...(outputRootDir === ASSETS_DIR ? [] : ["topics"]),
      asset.primaryGroup,
      `${asset.outputName}.svg`
    )
    const outDir = path.join(outputRootDir, asset.primaryGroup)
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
      topics: asset.topics,
      note: asset.note,
    })

    console.log(`[vendor-theme-assets] OK (${groupLabel}): ${asset.source}/${pickedName} -> ${relativePath} (groups: ${groupKeys.join(", ")})`)
  }
}

async function main() {
  console.log("[vendor-theme-assets] Loading icon sets...")
  const iconSets: Record<Source, IconSetJson> = {
    "icon-park": await loadIconSet("icon-park"),
    mingcute: await loadIconSet("mingcute"),
  }

  const manifest: ManifestEntry[] = []
  const skipped: string[] = []

  await processGroup("occasion", CURATED_OCCASIONS, iconSets, ASSETS_DIR, manifest, skipped)
  await processGroup("topic", CURATED_TOPICS, iconSets, TOPICS_DIR, manifest, skipped)

  const manifestSource = [
    "// GENERATED by scripts/vendor-theme-assets.ts — do not hand-edit.",
    "// Re-run `npx tsx scripts/vendor-theme-assets.ts` to regenerate after",
    "// changing the curated asset lists in that script.",
    "//",
    "// Every entry here is a real vendored SVG file under this same directory",
    "// (src/lib/templates/assets/<path>) — this module is a plain data import",
    "// (no fs access), safe to import anywhere. src/lib/templates/themes.ts",
    "// resolves `occasions` entries (festival stickers); the Wave 4 element",
    "// catalog (src/lib/ai/design-post.ts + src/lib/templates/elements.ts)",
    "// resolves `topics` entries (semantic business-vertical icons).",
    "// decorations.ts#stickerElement reads the actual SVG file at render",
    "// time (see that module's header for why the read happens there instead",
    "// of here).",
    "",
    "export interface ThemeAssetManifestEntry {",
    "  /** `${source}:${upstream icon name}` — stable identity for dedup/debugging, not used for lookups. */",
    "  key: string",
    "  /** Stable output name (matches the .svg filename, without extension). */",
    "  name: string",
    "  source: \"icon-park\" | \"mingcute\"",
    "  license: string",
    "  attribution: string",
    "  /** Relative to src/lib/templates/assets/ — e.g. \"christmas/christmas-tree.svg\" or \"topics/tech/terminal.svg\". */",
    "  path: string",
    "  /** Every occasion (festival) key this asset is available for (first = its primary/home occasion), when applicable. */",
    "  occasions?: string[]",
    "  /** Every topic (business-vertical semantic) key this asset is available for (first = its primary/home topic), when applicable. */",
    "  topics?: string[]",
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
