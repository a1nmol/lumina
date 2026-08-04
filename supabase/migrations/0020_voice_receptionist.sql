-- 0020 — AI Phone Receptionist (owner-approved: Retell + BYO Twilio pilot).
--
-- org_voice_settings: per-org receptionist config, edited from the new
-- Settings surface. voice_id refers to a curated stock-voice catalog id
-- (src/lib/voice/catalog.ts); retell_agent_id/phone binding are provisioned
-- by src/lib/voice/retell.ts when the org enables voice.
create table if not exists public.org_voice_settings (
  org_id uuid primary key references public.orgs(id) on delete cascade,
  enabled boolean not null default false,
  voice_id text,
  greeting text,
  after_hours_script text,
  transfer_number text,
  max_minutes_month integer not null default 60,
  retell_agent_id text,
  phone_number text,
  updated_at timestamptz not null default now()
);

alter table public.org_voice_settings enable row level security;

drop policy if exists "org_voice_settings_select_own_org" on public.org_voice_settings;
create policy "org_voice_settings_select_own_org" on public.org_voice_settings
  for select using (
    org_id in (select org_id from public.org_members where user_id = auth.uid())
  );
-- Writes go through server actions with the service-role client (agent
-- provisioning must stay server-controlled), matching entitlements.

-- calls: one row per phone call — the metadata spine; the conversation
-- transcript itself lives in conversations/messages with channel 'voice'.
create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  retell_call_id text unique,
  from_number text,
  to_number text,
  started_at timestamptz,
  ended_at timestamptz,
  duration_secs integer,
  outcome text,
  summary text,
  cost_usd numeric(10,4) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists calls_org_started_idx on public.calls (org_id, started_at desc);

alter table public.calls enable row level security;

drop policy if exists "calls_select_own_org" on public.calls;
create policy "calls_select_own_org" on public.calls
  for select using (
    org_id in (select org_id from public.org_members where user_id = auth.uid())
  );
