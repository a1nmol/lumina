-- LocalOS — 0006_push_subscriptions.sql
-- Phase 1/2 data layer: Web Push subscriptions for the ★reminder-to-post flow
-- (MASTER_PLAN.md §4.B "push → caption copied → deep-link → paste"). Same
-- conventions as prior migrations: re-runnable (`if not exists` /
-- drop-then-create policies), Row-Level Security, org-scoped via
-- private.user_org_ids().
--
-- Depends on 0001_foundation.sql (public.orgs, private.user_org_ids()).
--
-- NOTE (applied as a FILE ONLY): this migration is NOT run against the live
-- Supabase project by the builder — the lead applies it. Do not run this
-- migration outside that review step.
--
-- Scope note: this table stores subscriptions (permission + endpoint/keys)
-- so the server CAN push. It intentionally adds nothing else to the schema
-- (no reminder_at/scheduled-send columns) — real server-side scheduled
-- delivery needs a cron host (Vercel Cron or similar) and is a follow-up;
-- today's win is permission + subscription + an immediate test push. See
-- src/lib/push.ts for the server module this backs.

-- ===========================================================================
-- Tables
-- ===========================================================================

-- push_subscriptions — one row per browser/device Web Push subscription,
-- scoped to the org + user that created it. `endpoint` is globally unique
-- per the Push API spec (one push service endpoint per subscription), so it
-- doubles as the natural dedupe key on re-subscribe.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_org_idx
  on public.push_subscriptions (org_id);
create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

-- ===========================================================================
-- Row-Level Security
-- ===========================================================================

alter table public.push_subscriptions enable row level security;

-- Any org member can see which endpoints are subscribed for their org (no
-- sensitive payload beyond push keys, which are useless without the VAPID
-- private key held server-side only).
drop policy if exists "push_subscriptions_select_members" on public.push_subscriptions;
create policy "push_subscriptions_select_members" on public.push_subscriptions
  for select
  to authenticated
  using (org_id in (select private.user_org_ids()));

-- A member can only ever create a subscription for themselves, in an org
-- they belong to (prevents subscribing on another member's behalf).
drop policy if exists "push_subscriptions_insert_self" on public.push_subscriptions;
create policy "push_subscriptions_insert_self" on public.push_subscriptions
  for insert
  to authenticated
  with check (
    org_id in (select private.user_org_ids())
    and user_id = (select auth.uid())
  );

-- A member can unsubscribe their own device; owners/admins can also clean up
-- stale subscriptions org-wide (e.g. a departed member's browser).
drop policy if exists "push_subscriptions_delete_self_or_admin" on public.push_subscriptions;
create policy "push_subscriptions_delete_self_or_admin" on public.push_subscriptions
  for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    or private.is_org_owner_or_admin(org_id)
  );
