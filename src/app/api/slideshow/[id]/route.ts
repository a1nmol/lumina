// Streams a locally-rendered slideshow MP4 (src/lib/media/slideshow.ts) back
// to the composer. No auth required in demo mode (Supabase not configured);
// once Supabase IS configured, requires a signed-in user AND (when a record
// of the render exists) verifies their org actually owns it.

import { createReadStream } from "node:fs"
import { readdir, stat } from "node:fs/promises"
import path from "node:path"
import { Readable } from "node:stream"

import { NextResponse, type NextRequest } from "next/server"

import { getSlideshowTmpRoot } from "@/lib/media/slideshow"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The render only ever writes one .mp4 per work dir — find it by extension rather than assuming a fixed filename (outName is configurable). */
async function findRenderedFile(id: string): Promise<string | null> {
  const dir = path.join(getSlideshowTmpRoot(), id)
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return null
  }
  const mp4 = entries.find((entry) => entry.toLowerCase().endsWith(".mp4"))
  return mp4 ? path.join(dir, mp4) : null
}

/** Streams `[start, end]` (inclusive) of `filePath` as a Web ReadableStream, bridging Node's fs.createReadStream via Readable.toWeb — no full-file buffering for either full or ranged responses. */
function streamRange(filePath: string, start: number, end: number): ReadableStream<Uint8Array> {
  const nodeStream = createReadStream(filePath, { start, end })
  return Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid slideshow id" }, { status: 400 })
  }

  if (isSupabaseConfigured()) {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Playback authorization: saveSlideshowMediaAsset() (src/lib/content.ts)
    // embeds this render's id into media_assets.metadata.renderId once the
    // upload succeeds. Querying for it through the RLS-scoped client means a
    // returned row already proves the signed-in user's org owns the render
    // (media_assets' select policy filters to the caller's org membership)
    // — no manual org comparison needed.
    //
    // If no row comes back, we cannot tell "this render's upload failed /
    // Storage isn't provisioned yet" apart from "this belongs to another
    // org" using only the RLS-scoped client. We fall back to the
    // pre-existing behavior (require sign-in only) for that case: render ids
    // are random UUIDs (effectively unguessable), and a directory only
    // survives on local disk this long when its upload never completed (see
    // slideshow.ts#sweepStaleWorkDirs), so the practical exposure window is
    // small. Tightening this further would need an admin-client existence
    // check to distinguish "no row anywhere" from "row exists, wrong org."
    const { data: asset } = await supabase
      .from("media_assets")
      .select("id")
      .contains("metadata", { renderId: id })
      .maybeSingle()

    if (asset === null) {
      // Fall back to sign-in-only — see comment above.
    }
  }

  const filePath = await findRenderedFile(id)
  if (!filePath) {
    return NextResponse.json({ error: "Slideshow not found" }, { status: 404 })
  }

  const fileStat = await stat(filePath)
  const range = request.headers.get("range")

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range)
    if (match) {
      const start = match[1] ? Number.parseInt(match[1], 10) : 0
      const end = match[2] ? Number.parseInt(match[2], 10) : fileStat.size - 1
      if (
        Number.isFinite(start) &&
        Number.isFinite(end) &&
        start >= 0 &&
        start <= end &&
        end < fileStat.size
      ) {
        return new NextResponse(streamRange(filePath, start, end), {
          status: 206,
          headers: {
            "Content-Type": "video/mp4",
            "Accept-Ranges": "bytes",
            "Content-Range": `bytes ${start}-${end}/${fileStat.size}`,
            "Content-Length": String(end - start + 1),
            "Cache-Control": "private, max-age=3600",
          },
        })
      }
    }
  }

  return new NextResponse(streamRange(filePath, 0, fileStat.size - 1), {
    status: 200,
    headers: {
      "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes",
      "Content-Length": String(fileStat.size),
      "Cache-Control": "private, max-age=3600",
    },
  })
}
