-- LocalOS — 0008_social_connections.sql
-- Meta (Facebook/Instagram) CONNECT layer. Publishing/insights are a later
-- wave (MASTER_PLAN.md §4.B/§4.E) — this table only stores the OAuth result
-- of connecting a Facebook Page (+ its linked Instagram Business account) to
-- an org, so a later pass can publish/read insights against it. Same
-- conventions as prior migrations: re-runnable (`if not exists` /
-- drop-then-create policies+trigger), Row-Level Security, org-scoped via
-- private.user_org_ids().
--
-- Depends on 0001_foundation.sql (public.orgs, private.user_org_ids(),
-- private.set_updated_at()).
--
-- NOTE (applied as a FILE ONLY): this migration is NOT run against the live
-- Supabase project by the builder — the lead applies it. Do not run this
-- migration outside that review step.

-- ===========================================================================
-- Tables
-- ===========================================================================

-- social_connections — one row per connected Facebook Page (and, when the
-- Page has one linked, its Instagram Business account). access_token is a
-- long-lived Page access token, obtained from a long-lived user token via
-- GET /me/accounts — Meta documents these as not expiring in the normal
-- case, but token_expires_at is kept for the (rarer) cases Meta does set an
-- expiry, or a future refresh flow. access_token is sensitive — see the RLS
-- section below: only the service role ever writes it.
create table if not exists public.social_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  provider text not null check (provider in ('meta')),
  page_id text not null,
  page_name text,
  ig_user_id text,
  ig_username text,
  access_token text not null,
  token_expires_at timestamptz,
  connected_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, provider, page_id)
);

create index if not exists social_connections_org_idx
  on public.social_connections (org_id);

-- ===========================================================================
-- Triggers
-- ===========================================================================

drop trigger if exists set_social_connections_updated_at on public.social_connections;
create trigger set_social_connections_updated_at
  before update on public.social_connections
  for each row execute function private.set_updated_at();

-- ===========================================================================
-- Row-Level Security
-- ===========================================================================

alter table public.social_connections enable row level security;

-- Any org member can see which channels are connected (page name, IG
-- @username, connected date) — but access_token is still only ever read by
-- server code using the service-role admin client, never sent to the
-- browser (see src/app/(app)/settings/channels-card.tsx).
drop policy if exists "social_connections_select_members" on public.social_connections;
create policy "social_connections_select_members" on public.social_connections
  for select
  to authenticated
  using (org_id in (select private.user_org_ids()));

-- No insert/update/delete policy for `authenticated` on purpose (tokens are
-- sensitive, like usage_events restricts writes to service-role — see
-- 0001_foundation.sql's usage_events policies). All writes (the OAuth
-- callback's upsert, the settings "Disconnect" action's delete) go through
-- src/lib/supabase/admin.ts's service-role client, which bypasses RLS
-- entirely.
