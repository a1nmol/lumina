-- 0019 — Outlast wave 3: standing orders + proactive follow-ups.
--
-- standing_orders: persistent owner instructions the AI weaves into every
-- reply while active ("I'm at a wedding till Sunday — tell people I'll be
-- slow", "registrations closed, stop taking signups"). Unlike a whisper
-- (one-shot, one thread), these are org-wide and expire on their own.
create table if not exists public.standing_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  instruction text not null,
  expires_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists standing_orders_org_active_idx
  on public.standing_orders (org_id, active, expires_at);

alter table public.standing_orders enable row level security;

drop policy if exists "standing_orders_all_own_org" on public.standing_orders;
create policy "standing_orders_all_own_org" on public.standing_orders
  for all using (
    org_id in (select org_id from public.org_members where user_id = auth.uid())
  ) with check (
    org_id in (select org_id from public.org_members where user_id = auth.uid())
  );

-- Proactive follow-ups: one nudge per conversation per quiet-thread window,
-- tracked directly on the conversation (no queue table needed at this scale).
alter table public.conversations
  add column if not exists last_follow_up_at timestamptz;
