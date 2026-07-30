import "server-only"

// Thin OpenRouter chat-completions client. Deliberately dependency-free
// (plain fetch, no SDK) so it stays cheap to audit and has no supply-chain
// surface. See src/lib/ai/router.ts for model selection + usage metering —
// this module only knows how to talk to the OpenRouter HTTP API.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

export type ChatRole = "system" | "user" | "assistant"

/**
 * OpenAI/OpenRouter-style multimodal content parts — only used by
 * vision-capable jobs (src/lib/ai/describe-image.ts). `image_url.url` is
 * passed straight through to OpenRouter; this client never downloads or
 * re-uploads the image itself.
 */
export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }

export type ChatMessage = {
  role: ChatRole
  /** Plain text for every existing job; an array of parts for vision jobs that attach an image. */
  content: string | ChatContentPart[]
}

export interface ChatCompleteInput {
  model: string
  messages: ChatMessage[]
  maxTokens?: number
  temperature?: number
  /** When true, consumes the response as an SSE stream (see chatComplete's onDelta). */
  stream?: boolean
  /** Called with each incremental text chunk when `stream` is true. Ignored otherwise. */
  onDelta?: (delta: string) => void
}

export interface ChatCompleteResult {
  text: string
  /** The model id OpenRouter actually served the request with. */
  model: string
  promptTokens: number
  completionTokens: number
}

export class OpenRouterNotConfiguredError extends Error {
  constructor() {
    super("OpenRouter is not configured. Set OPENROUTER_API_KEY in .env.local.")
    this.name = "OpenRouterNotConfiguredError"
  }
}

export class OpenRouterRequestError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = "OpenRouterRequestError"
    this.status = status
  }
}

/** True once OPENROUTER_API_KEY is present. */
export function isOpenRouterConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY)
}

function buildHeaders(): HeadersInit {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new OpenRouterNotConfiguredError()

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    // OpenRouter etiquette headers — identify the app for their leaderboards
    // and rate-limit tooling. Never contain secrets.
    "HTTP-Referer": appUrl,
    "X-Title": "Lumina",
  }
}

interface OpenRouterChoice {
  message?: { content?: string | null }
  delta?: { content?: string | null }
}

interface OpenRouterUsage {
  prompt_tokens?: number
  completion_tokens?: number
}

interface OpenRouterResponseBody {
  model?: string
  choices?: OpenRouterChoice[]
  usage?: OpenRouterUsage
}

async function requestNonStreaming(input: ChatCompleteInput): Promise<ChatCompleteResult> {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({
      model: input.model,
      messages: input.messages,
      max_tokens: input.maxTokens,
      temperature: input.temperature ?? 0.7,
      stream: false,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new OpenRouterRequestError(
      `OpenRouter request failed (${res.status}): ${body.slice(0, 300)}`,
      res.status
    )
  }

  const json = (await res.json()) as OpenRouterResponseBody
  const text = json.choices?.[0]?.message?.content ?? ""

  return {
    text,
    model: json.model ?? input.model,
    promptTokens: json.usage?.prompt_tokens ?? 0,
    completionTokens: json.usage?.completion_tokens ?? 0,
  }
}

/**
 * Consumes an OpenRouter Server-Sent-Events stream and aggregates it into the
 * same ChatCompleteResult shape as the non-streaming path, invoking
 * `onDelta` (if provided) with each incremental text chunk as it arrives.
 */
async function requestStreaming(input: ChatCompleteInput): Promise<ChatCompleteResult> {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({
      model: input.model,
      messages: input.messages,
      max_tokens: input.maxTokens,
      temperature: input.temperature ?? 0.7,
      stream: true,
    }),
  })

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "")
    throw new OpenRouterRequestError(
      `OpenRouter streaming request failed (${res.status}): ${body.slice(0, 300)}`,
      res.status
    )
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()

  let buffer = ""
  let text = ""
  let model = input.model
  let promptTokens = 0
  let completionTokens = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    // Keep the last (possibly incomplete) line in the buffer for next chunk.
    buffer = lines.pop() ?? ""

    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line.startsWith("data:")) continue

      const data = line.slice("data:".length).trim()
      if (data === "[DONE]" || data === "") continue

      try {
        const parsed = JSON.parse(data) as OpenRouterResponseBody
        const delta = parsed.choices?.[0]?.delta?.content
        if (delta) {
          text += delta
          input.onDelta?.(delta)
        }
        if (parsed.model) model = parsed.model
        if (parsed.usage) {
          promptTokens = parsed.usage.prompt_tokens ?? promptTokens
          completionTokens = parsed.usage.completion_tokens ?? completionTokens
        }
      } catch {
        // Ignore malformed/keep-alive SSE lines rather than aborting the stream.
      }
    }
  }

  return { text, model, promptTokens, completionTokens }
}

/**
 * Runs one OpenRouter chat completion. Non-streaming by default; pass
 * `stream: true` (with an optional `onDelta` callback) to consume the
 * response incrementally — either way the function resolves once the full
 * response is aggregated, matching the same result shape.
 */
export async function chatComplete(input: ChatCompleteInput): Promise<ChatCompleteResult> {
  return input.stream ? requestStreaming(input) : requestNonStreaming(input)
}
