-- 0013 — the honest-AI intro (owner direction).
--
-- Personal profiles (and businesses) may want NEW or long-quiet
-- conversations to open with a one-time, owner-written disclosure that an
-- AI is answering right now — without watermarking every message.
-- ai_intro_text is the owner's own words ("You're not talking to Anmol
-- right now — this is an AI he built. Leave your message, he'll see it.").
-- Sent at most once per conversation "session": on the first-ever AI
-- auto-reply of a conversation, or when the AI auto-replies after a long
-- silence (session gap constant lives in code).

alter table public.business_brain
  add column if not exists ai_intro_enabled boolean not null default false;

alter table public.business_brain
  add column if not exists ai_intro_text text;
