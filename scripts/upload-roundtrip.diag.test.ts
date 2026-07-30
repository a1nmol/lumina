// TEMPORARY DIAGNOSTIC — render a real template, upload via the same
// supabase-js call saveRenderedPosterAsset uses, download, compare bytes.
import { describe, expect, it } from "vitest"
import { createClient } from "@supabase/supabase-js"
import { renderTemplate } from "../src/lib/templates/render"

describe("upload roundtrip", () => {
  // Skipped when Supabase env is absent (CI runs keyless by design).
  it.skipIf(!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)(
    "uploads PNG bytes without corruption", async () => {
    const png = await renderTemplate({
      templateId: "quote-v1",
      fields: { quote: "Bytes should survive the trip.", attribution: "Diagnostic" },
      colorway: "dark",
      background: { type: "solid" },
      brandKit: { primary_color: "#4f46e5" },
    })
    expect(png[0]).toBe(0x89)
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const path = "diagnostics/roundtrip.png"
    const up = await admin.storage.from("media").upload(path, png, { contentType: "image/png", upsert: true })
    expect(up.error).toBeNull()
    const down = await admin.storage.from("media").download(path)
    expect(down.error).toBeNull()
    const bytes = Buffer.from(await down.data!.arrayBuffer())
    console.log("uploaded:", png.length, "downloaded:", bytes.length, "first bytes:", bytes.subarray(0, 4).toString("hex"))
    expect(bytes.length).toBe(png.length)
    expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a")
    await admin.storage.from("media").remove([path])
  }, 30000)
})
