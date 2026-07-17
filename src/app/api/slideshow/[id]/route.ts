// Streams a locally-rendered slideshow MP4 (src/lib/media/slideshow.ts) back
// to the composer. No auth required in demo mode (Supabase not configured);
// once Supabase IS configured, requires a signed-in user.

import { readdir, readFile, stat } from "node:fs/promises"
import path from "node:path"

import { NextResponse, type NextRequest } from "next/server"

import { SLIDESHOW_TMP_ROOT } from "@/lib/media/slideshow"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The render only ever writes one .mp4 per work dir — find it by extension rather than assuming a fixed filename (outName is configurable). */
async function findRenderedFile(id: string): Promise<string | null> {
  const dir = path.join(SLIDESHOW_TMP_ROOT, id)
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return null
  }
  const mp4 = entries.find((entry) => entry.toLowerCase().endsWith(".mp4"))
  return mp4 ? path.join(dir, mp4) : null
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
        const buffer = await readFile(filePath)
        const chunk = buffer.subarray(start, end + 1)
        return new NextResponse(new Uint8Array(chunk), {
          status: 206,
          headers: {
            "Content-Type": "video/mp4",
            "Accept-Ranges": "bytes",
            "Content-Range": `bytes ${start}-${end}/${fileStat.size}`,
            "Content-Length": String(chunk.length),
            "Cache-Control": "private, max-age=3600",
          },
        })
      }
    }
  }

  const buffer = await readFile(filePath)
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes",
      "Content-Length": String(buffer.length),
      "Cache-Control": "private, max-age=3600",
    },
  })
}
