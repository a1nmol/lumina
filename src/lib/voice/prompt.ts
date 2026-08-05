// Voice system prompt — the AI Phone Receptionist's much shorter, spoken-
// style sibling of src/lib/ai/frontdesk-reply.ts's buildSystemPrompt.
// Deliberately NOT importing that module: a phone call is a different
// medium (no formatting, no bullet lists, turn-taking is real-time, and the
// legally-relevant "this call may be recorded" disclosure has to land in the
// first few seconds) — this reuses the Brain-summarizing IDEAS (compact
// hours/services/FAQ lines) but keeps its own, much tighter budget.
//
// Pure — zero I/O, unit-tested directly in prompt.test.ts. Retell's
// `general_prompt` is the persistent system prompt for the whole call;
// `begin_message` is the exact line the agent speaks first (this is where
// the 3-second disclosure requirement lives — Retell speaks it immediately
// on answer, before the caller says anything).

import type { BusinessBrain, BusinessService, OrgVoiceSettings } from "@/lib/types"

/** Retell's general_prompt is a system prompt sent on every turn — keep it short to control latency/cost. Hard cap enforced below. */
export const MAX_GENERAL_PROMPT_CHARS = 1500

const MAX_SERVICES_IN_PROMPT = 4
const MAX_FAQ_IN_PROMPT = 3
const DEFAULT_GREETING_QUESTION = "How can I help you today?"

export type VoicePromptSettings = Pick<OrgVoiceSettings, "greeting" | "after_hours_script" | "transfer_number">

export interface VoicePromptOptions {
  /** True to build the after-hours variant (uses settings.after_hours_script when present). */
  afterHours?: boolean
}

export interface VoicePromptResult {
  /** Retell `response_engine.llm_websocket_url` config's general_prompt / create-retell-llm's `general_prompt`. */
  generalPrompt: string
  /** create-retell-llm's `begin_message` — spoken first, before the caller says anything. */
  beginMessage: string
}

function businessLabel(brain: BusinessBrain | null): string {
  return brain?.business_name?.trim() || "the business"
}

function compactHoursLine(brain: BusinessBrain | null): string | null {
  const entries = Object.entries(brain?.hours ?? {})
    .map(([day, window]) => {
      if (!window) return null
      if (window.closed) return `${day} closed`
      return `${day} ${window.open}-${window.close}`
    })
    .filter((line): line is string => Boolean(line))
  if (entries.length === 0) return null
  return `Hours: ${entries.join(", ")}.`
}

function compactServicesLine(brain: BusinessBrain | null): string | null {
  const services = (brain?.services ?? []).slice(0, MAX_SERVICES_IN_PROMPT)
  if (services.length === 0) return null
  const rendered = services
    .map((service: BusinessService) => (service.price ? `${service.name} (${service.price})` : service.name))
    .filter(Boolean)
    .join(", ")
  return rendered ? `Services: ${rendered}.` : null
}

function compactFaqLine(brain: BusinessBrain | null): string | null {
  const faq = (brain?.faq ?? []).slice(0, MAX_FAQ_IN_PROMPT)
  if (faq.length === 0) return null
  const rendered = faq.map((entry) => `${entry.question} -> ${entry.answer}`).join(" | ")
  return rendered ? `FAQ: ${rendered}` : null
}

/**
 * Builds the phone receptionist's system prompt + opening line. `settings`
 * is intentionally a narrow pick (not the full OrgVoiceSettings row) so
 * unit tests don't need to fabricate unrelated columns (enabled, voice_id,
 * etc.).
 */
export function buildVoicePrompt(
  brain: BusinessBrain | null,
  settings: VoicePromptSettings,
  options: VoicePromptOptions = {}
): VoicePromptResult {
  const name = businessLabel(brain)
  const afterHours = Boolean(options.afterHours)

  // --- begin_message: the mandatory 3-second disclosure, first line spoken. ---
  const disclosure = `Hi, this is ${name}'s AI assistant — this call may be recorded.`
  const openingQuestion =
    afterHours && settings.after_hours_script?.trim()
      ? settings.after_hours_script.trim()
      : settings.greeting?.trim() || DEFAULT_GREETING_QUESTION
  const beginMessage = `${disclosure} ${openingQuestion}`

  // --- general_prompt: identity, brevity rules, Brain facts, escalation. ---
  const identity = `You are the phone receptionist for ${name}${brain?.category ? `, a ${brain.category}` : ""}. You already gave the recording/AI disclosure at the start of the call — never repeat it.`

  const toneLine = brain?.tone ? `Brand voice: ${brain.tone}.` : null

  const brevityRules =
    "Speak naturally, like a real phone conversation — short sentences, plain spoken language, no bullet points or markdown. Keep each turn to one or two sentences. Never list more than 3 things in a row; if there's more, offer to text the details instead. If the caller seems confused, offer to repeat yourself."

  const description = brain?.description?.trim().slice(0, 200)

  const factLines = [
    description ? `About the business: ${description}` : null,
    compactHoursLine(brain),
    compactServicesLine(brain),
    compactFaqLine(brain),
  ].filter((line): line is string => Boolean(line))

  const escalationParts = [
    "If you can't answer something or the caller needs the owner personally, take a message: get their name, callback number, and reason for calling, and let them know the team will call back soon.",
    settings.transfer_number?.trim()
      ? "If the caller insists on speaking to a person right now, offer to transfer them."
      : null,
  ].filter((line): line is string => Boolean(line))

  const afterHoursLine = afterHours
    ? "This call is happening after hours — say so warmly if it's relevant, and focus on taking a message rather than promising an immediate callback."
    : null

  const lines = [
    identity,
    toneLine,
    brevityRules,
    ...factLines,
    ...escalationParts,
    afterHoursLine,
    "Answer as the business (\"we\"). Be warm, brief, and helpful — you're standing in for a real front-desk person, not reading a script.",
  ].filter((line): line is string => Boolean(line))

  let generalPrompt = lines.join(" ")
  if (generalPrompt.length > MAX_GENERAL_PROMPT_CHARS) {
    generalPrompt = `${generalPrompt.slice(0, MAX_GENERAL_PROMPT_CHARS - 1).trimEnd()}…`
  }

  return { generalPrompt, beginMessage }
}
