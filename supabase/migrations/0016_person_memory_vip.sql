-- 0016 — Commander Update part 2 (owner-approved: person-memory,
-- relationship awareness, VIP).
--
-- contacts.ai_memory: durable PERSON-level memory, distinct from the
-- per-thread conversations.ai_memory (0015). Survives across conversations:
-- who this person is, relationship notes, running topics, inside jokes.
-- Updated by the same cheap paid-lane memory job whenever conversation
-- memory updates — including while the AI is off and when the owner is the
-- one replying. Shape maintained in src/lib/ai/conversation-memory.ts.
alter table public.contacts
  add column if not exists ai_memory jsonb;

-- contacts.is_vip: owner-flagged people (professor, family, key client).
-- VIP threads: AI drafts but never auto-sends, and the owner gets an
-- instant alert — these are the messages the owner never wants handled.
alter table public.contacts
  add column if not exists is_vip boolean not null default false;
