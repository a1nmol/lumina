-- 0015 — the Commander Update, part 1 (owner-approved plan, 2026-08-01).
--
-- ai_always_on: org-level "never go silent" switch. When true, the AI never
-- self-escalates into silence — at most it defers a specific topic to the
-- owner (warm handoff line inside a real reply) while staying in the
-- conversation. The org spend guard remains the hard floor regardless.
alter table public.business_brain
  add column if not exists ai_always_on boolean not null default false;

-- ai_memory: rolling structured conversation memory (the "commander" seam).
-- Shape (maintained by src/lib/ai/conversation-memory.ts):
--   { "facts": string[], "open_threads": string[], "vibe": string,
--     "summary": string, "updated_at": iso, "message_count": int }
-- Updated every few messages on a cheap PAID model lane (PII rule: customer
-- content never goes to free tiers), including while the AI is not replying,
-- so a resumed conversation picks up knowing everything.
alter table public.conversations
  add column if not exists ai_memory jsonb;
