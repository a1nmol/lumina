// TEMPORARY DIAGNOSTIC (Bug 2 repro) — calls the REAL designPost() pipeline
// (real OpenRouter call, real Supabase allowance/usage bookkeeping against
// the live org) with the two prompts from the bug report, then renders each
// result through the real template pipeline and writes the PNGs to disk for
// visual inspection. Mirrors scripts/upload-roundtrip.diag.test.ts's
// skipIf-when-unconfigured guard so CI (which runs keyless) skips cleanly.
import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { designPost } from "../src/lib/ai/design-post"
import { renderTemplate } from "../src/lib/templates/render"

// An existing live org (queried directly from the `orgs` table) — used only
// so checkAllowance()/recordUsage() have a real row to read/write against,
// same as any real content-generation call in production.
const REAL_ORG_ID = "e2a268ac-1150-43e2-ae39-27ca7e11ec44"

const PROMPTS: Array<{ name: string; prompt: string }> = [
  { name: "sparse-christmas-graphics", prompt: "christmas graphics" },
  {
    name: "full-context-christmas-party",
    prompt: "Christmas party this Saturday 7pm at Riverside Hall, live music, free cocoa, bring the kids!",
  },
]

describe("design-post theme + rich-fill (real pipeline diagnostic)", () => {
  it.skipIf(!process.env.OPENROUTER_API_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)(
    "designs + renders both bug-report prompts end to end",
    async () => {
      const dir = await mkdtemp(path.join(os.tmpdir(), "lumina-design-post-diag-"))
      console.log("[design-post-diag] output dir:", dir)

      for (const { name, prompt } of PROMPTS) {
        const designed = await designPost({ orgId: REAL_ORG_ID, prompt, businessBrain: null })
        expect(designed).not.toBeNull()
        if (!designed) continue

        console.log(
          `[design-post-diag] ${name} designPost() ->`,
          JSON.stringify(
            {
              templateId: designed.templateId,
              colorway: designed.colorway,
              background: designed.background,
              theme: designed.theme,
              elements: designed.elements,
              fields: designed.fields,
            },
            null,
            2
          )
        )

        const png = await renderTemplate({
          templateId: designed.templateId,
          fields: designed.fields,
          colorway: designed.colorway,
          background: { type: designed.background.type === "photo_ai" ? "solid" : designed.background.type },
          theme: designed.theme ?? undefined,
          elements: designed.elements,
          seed: name,
        })

        expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a")

        const outPath = path.join(dir, `${name}.png`)
        await writeFile(outPath, png)
        console.log(`[design-post-diag] ${name} PNG -> ${outPath} (${png.length} bytes)`)
      }
    },
    60000
  )
})
