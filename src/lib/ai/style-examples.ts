import "server-only"

// Edit-learning exemplars (Outlast wave 2, Part A) — ai_style_examples
// (supabase/migrations/0018_style_examples.sql) holds pairs of (what the AI
// drafted, what the owner actually sent) captured whenever the owner edits
// an AI draft before sending it (see sendReply in
// src/app/(app)/inbox/actions.ts). This module fetches the newest pairs and
// renders them into a compact prompt block injected into the reply-drafting
// prompts (src/lib/ai/frontdesk-reply.ts's buildSystemPrompt and
// src/lib/ai/reply-assist.ts's suggestReplies), framed as style guidance the
// model should learn FROM, never a literal instruction to copy.
//
// This COMPLEMENTS src/lib/ai/reply-assist.ts's fetchVoiceAnchors rather than
// replacing it: voice anchors are the owner's own outbound messages (what the
// owner writes from scratch); these are corrections to what the AI itself
// got wrong (what the AI drafted vs. what the owner actually sent instead) —
// a sharper, more direct signal about the AI's specific phrasing misses.
//
// Uses the service-role admin client (not the RLS-scoped server client)
// because fetchStyleExamples is called from draftCustomerReply, which itself
// runs from unauthenticated webhook routes (Instagram, Twilio SMS, missed-
// call) with no user session — mirrors src/lib/usage.ts's
// getAiRepliesUsageFraction, which frontdesk-reply.ts already fetches from
// the exact same call site for the exact same reason.

import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin"

export interface StyleExamplePair {
  aiDraft: string
  ownerText: string
}

// ---------------------------------------------------------------------------
// Pure decision logic — no I/O, unit-tested directly (style-examples.test.ts).
// ---------------------------------------------------------------------------

/**
 * Whether sendReply (src/app/(app)/inbox/actions.ts) should capture an
 * edit-learning exemplar for this send: `originalAiDraft` must be a
 * non-blank string (a "from scratch" reply — never prefilled from an AI
 * draft or suggestion, or the composer's ref was cleared because the box was
 * emptied by hand — has nothing to compare against), and its trimmed text
 * must differ from the trimmed text actually sent (an unedited send is
 * nothing to learn from). sendReply is itself a "use server" file, which
 * Next.js restricts to exporting only async functions — this predicate lives
 * here instead so it stays a plain, synchronously testable pure function.
 */
export function shouldCaptureStyleExample(originalAiDraft: string | null | undefined, sentBody: string): boolean {
  const trimmedDraft = originalAiDraft?.trim() ?? ""
  if (!trimmedDraft) return false
  return trimmedDraft !== sentBody.trim()
}

const DEFAULT_LIMIT = 3
/**
 * Each side is truncated to this many characters when RENDERED into the
 * prompt block (the DB row itself may hold up to 1000 chars/side — see
 * sendReply's MAX_STYLE_EXAMPLE_TEXT_LENGTH). 3 pairs x 1000 chars/side on
 * every single reply is too fat a token cost to justify — 220 chars/side is
 * still plenty to convey a phrasing correction.
 */
const MAX_RENDER_CHARS_PER_SIDE = 220

/**
 * Fetches the newest `limit` style-example pairs for an org, newest first.
 * Returns [] (never throws) when Supabase isn't configured or the query
 * fails — this is a style-guidance convenience layer, never a blocker for
 * drafting a reply.
 */
export async function fetchStyleExamples(orgId: string, limit: number = DEFAULT_LIMIT): Promise<StyleExamplePair[]> {
  if (!isSupabaseConfigured()) return []

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("ai_style_examples")
      .select("ai_draft, owner_text")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error || !data) return []

    return data
      .map((row) => ({ aiDraft: row.ai_draft?.trim() ?? "", ownerText: row.owner_text?.trim() ?? "" }))
      .filter((pair) => pair.aiDraft.length > 0 && pair.ownerText.length > 0)
  } catch (error) {
    console.error("[style-examples] failed to fetch style examples", error)
    return []
  }
}

/**
 * Renders style-example pairs into a compact prompt block, framed as style
 * guidance to learn FROM (not verbatim lines to reuse) — the model is told
 * how the owner's real texting differs from a typical AI draft, not given a
 * script. Pure, no I/O. Returns "" when there's nothing to render.
 */
export function renderStyleExamplesBlock(pairs: StyleExamplePair[]): string {
  if (pairs.length === 0) return ""

  const rendered = pairs
    .map((pair) => {
      const ai = pair.aiDraft.slice(0, MAX_RENDER_CHARS_PER_SIDE)
      const owner = pair.ownerText.slice(0, MAX_RENDER_CHARS_PER_SIDE)
      return `AI version: "${ai}" -> what the owner really sent: "${owner}"`
    })
    .join(" | ")

  return `How the owner actually texts — learn from these past corrections (AI version -> what the owner really sent instead), and let that shape your own phrasing; don't copy any of them verbatim: ${rendered}`
}
