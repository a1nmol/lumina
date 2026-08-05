-- 0018 — edit-learning (Outlast wave 2).
--
-- Every time the owner edits an AI draft before sending, the pair (what the
-- AI would have said vs. what the owner actually sent) is free training
-- signal. Stored here and injected as few-shot exemplars into the reply
-- prompts, so the AI converges on the owner's real texting fingerprint over
-- time — no fine-tuning, just accumulated example pairs.

create table if not exists public.ai_style_examples (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  channel text,
  ai_draft text not null,
  owner_text text not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_style_examples_org_created_idx
  on public.ai_style_examples (org_id, created_at desc);

alter table public.ai_style_examples enable row level security;

drop policy if exists "ai_style_examples_select_own_org" on public.ai_style_examples;
create policy "ai_style_examples_select_own_org" on public.ai_style_examples
  for select using (
    org_id in (select org_id from public.org_members where user_id = auth.uid())
  );

drop policy if exists "ai_style_examples_insert_own_org" on public.ai_style_examples;
create policy "ai_style_examples_insert_own_org" on public.ai_style_examples
  for insert with check (
    org_id in (select org_id from public.org_members where user_id = auth.uid())
  );
