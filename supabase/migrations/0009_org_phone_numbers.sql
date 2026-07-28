-- LocalOS — 0009_org_phone_numbers.sql
-- Twilio SMS + missed-call-to-text channel connection (MASTER_PLAN.md §4.D
-- "text channels first... SMS two-way", "★missed-call-to-text").
--
-- Maps a Twilio phone number (E.164) to the org it's provisioned for, so the
-- inbound webhooks (src/app/api/twilio/sms, src/app/api/twilio/voice) can
-- resolve "To" -> org from the request alone, with no other identifying
-- info. Numbers are provisioned by the platform admin/CLI for the pilot —
-- there's no in-app UI to claim/release a number this wave — so every write
-- goes through the service-role admin client only, same "service-role only"
-- write posture as 0007_early_access_leads.sql.
--
-- Same conventions as prior migrations: re-runnable (`if not exists` /
-- drop-then-create policies), Row-Level Security on every table, org-scoped
-- reads via private.user_org_ids().
--
-- Depends on 0001_foundation.sql (public.orgs, private.user_org_ids()).
--
-- NOTE (applied as a FILE ONLY): this migration is NOT run against the live
-- Supabase project by the builder — the lead applies it. Do not run this
-- migration outside that review step.

-- ===========================================================================
-- Tables
-- ===========================================================================

create table if not exists public.org_phone_numbers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  -- E.164 (e.g. +15551234567). Unique across the whole platform, not just
  -- per org — a real phone number can only ever be provisioned to one org.
  phone_number text not null unique,
  twilio_sid text,
  created_at timestamptz not null default now()
);

create index if not exists org_phone_numbers_org_idx
  on public.org_phone_numbers (org_id);

-- ===========================================================================
-- Row-Level Security — members can read their own org's number(s); writes
-- (provisioning) are service-role only, so no insert/update/delete policy is
-- defined for `authenticated` — RLS enabled with no matching policy denies
-- those by default, while the service-role admin client bypasses RLS
-- entirely as usual.
-- ===========================================================================

alter table public.org_phone_numbers enable row level security;

drop policy if exists "org_phone_numbers_select_members" on public.org_phone_numbers;
create policy "org_phone_numbers_select_members" on public.org_phone_numbers
  for select
  to authenticated
  using (org_id in (select private.user_org_ids()));
