-- 0017 — never-go-dark ops watchdog (owner-approved wave, 2026-08-02).
--
-- Lesson from the live outage: an empty OpenRouter wallet silenced the AI
-- and nobody knew until a human noticed. A scheduled watchdog now checks
-- account credits, connected-channel token expiry, webhook liveness, and
-- per-org usage burn — and emails the owner BEFORE customers feel anything.
-- This table dedupes those alerts (one per kind per quiet period), so a
-- failing check nags on a sane cadence instead of every cron tick.

create table if not exists public.watchdog_alerts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  kind text not null,
  detail text,
  sent_at timestamptz not null default now()
);

create index if not exists watchdog_alerts_org_kind_sent_idx
  on public.watchdog_alerts (org_id, kind, sent_at desc);

-- Service-role writes only (the cron route uses the admin client); owners
-- may read their own org's alert history if we ever surface it in-app.
alter table public.watchdog_alerts enable row level security;

drop policy if exists "watchdog_alerts_select_own_org" on public.watchdog_alerts;
create policy "watchdog_alerts_select_own_org" on public.watchdog_alerts
  for select using (
    org_id in (select org_id from public.org_members where user_id = auth.uid())
  );
