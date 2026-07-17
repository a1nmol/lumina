-- LocalOS — 0001_foundation.sql
-- Phase 0 data foundation: orgs, membership, plans, entitlements, usage metering,
-- and the Business Brain. Enforces Row-Level Security per org everywhere.
--
-- This migration is written to be safely re-runnable: it uses `if not exists`,
-- `create or replace`, and drops/recreates policies and triggers by name before
-- creating them again.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto; -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Private schema for internal helper functions (not exposed via PostgREST)
-- ---------------------------------------------------------------------------
create schema if not exists private;

-- ===========================================================================
-- Tables
-- ===========================================================================

-- orgs — one row per business/account
create table if not exists public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

-- org_members — join table between auth.users and orgs, with a role
create table if not exists public.org_members (
  org_id uuid not null references public.orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id) -- also satisfies the unique(org_id, user_id) requirement
);

create index if not exists org_members_user_id_idx on public.org_members(user_id);

-- plans — pricing/limit tiers. Free during invite-only test phase.
create table if not exists public.plans (
  id text primary key,
  name text not null,
  monthly_price_cents integer not null default 0,
  limits jsonb not null default '{}'::jsonb
);

-- entitlements — one row per org: plan + feature flags + per-org overrides
create table if not exists public.entitlements (
  org_id uuid primary key references public.orgs(id) on delete cascade,
  plan_id text not null default 'free_test' references public.plans(id),
  feature_flags jsonb not null default '{}'::jsonb,
  overrides jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- usage_events — append-only ledger of metered usage + cost, for the spend guard
create table if not exists public.usage_events (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.orgs(id) on delete cascade,
  feature text not null,
  model text,
  units numeric not null default 1,
  cost_usd numeric(10, 6) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists usage_events_org_created_idx
  on public.usage_events (org_id, created_at desc);
create index if not exists usage_events_org_feature_created_idx
  on public.usage_events (org_id, feature, created_at desc);

-- business_brain — one row per org: hours/services/prices/faq/tone/brand/channels
create table if not exists public.business_brain (
  org_id uuid primary key references public.orgs(id) on delete cascade,
  business_name text,
  category text,
  description text,
  hours jsonb not null default '{}'::jsonb,
  services jsonb not null default '[]'::jsonb,
  prices jsonb not null default '{}'::jsonb,
  faq jsonb not null default '[]'::jsonb,
  tone text,
  brand_kit jsonb not null default '{}'::jsonb,
  connected_channels jsonb not null default '{}'::jsonb,
  onboarding_step integer not null default 0,
  completed boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ===========================================================================
-- Seed data
-- ===========================================================================

insert into public.plans (id, name, monthly_price_cents, limits)
values (
  'free_test',
  'Free (Test Phase)',
  0,
  jsonb_build_object(
    'content_generations', 200,
    'images', 100,
    'slideshows', 20,
    'ai_replies', 500,
    'spend_cap_usd', 10
  )
)
on conflict (id) do update set
  name = excluded.name,
  monthly_price_cents = excluded.monthly_price_cents,
  limits = excluded.limits;

-- ===========================================================================
-- Helper functions
-- ===========================================================================

-- private.user_org_ids() — the set of org_ids the current auth user belongs to.
-- SECURITY DEFINER + fixed search_path so it can be used inside RLS policies
-- without those policies re-triggering RLS on org_members recursively.
create or replace function private.user_org_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select org_id from public.org_members where user_id = auth.uid();
$$;

-- private.is_org_owner_or_admin(org uuid) — is the current user an owner/admin of org?
create or replace function private.is_org_owner_or_admin(target_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.org_members
    where org_id = target_org_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

-- generic updated_at maintenance trigger
create or replace function private.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ===========================================================================
-- New-user bootstrap: default org + owner membership + entitlements + brain
-- ===========================================================================

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  base_slug text;
  candidate_slug text;
  suffix int := 0;
  display_name text;
begin
  display_name := coalesce(
    new.raw_user_meta_data ->> 'business_name',
    new.raw_user_meta_data ->> 'full_name',
    split_part(new.email, '@', 1),
    'My Business'
  );

  base_slug := regexp_replace(lower(coalesce(split_part(new.email, '@', 1), 'business')), '[^a-z0-9]+', '-', 'g');
  base_slug := trim(both '-' from base_slug);
  if base_slug is null or base_slug = '' then
    base_slug := 'business';
  end if;

  candidate_slug := base_slug;
  while exists (select 1 from public.orgs where slug = candidate_slug) loop
    suffix := suffix + 1;
    candidate_slug := base_slug || '-' || suffix::text;
  end loop;

  insert into public.orgs (name, slug)
  values (display_name, candidate_slug)
  returning id into new_org_id;

  insert into public.org_members (org_id, user_id, role)
  values (new_org_id, new.id, 'owner')
  on conflict (org_id, user_id) do nothing;

  insert into public.entitlements (org_id, plan_id)
  values (new_org_id, 'free_test')
  on conflict (org_id) do nothing;

  insert into public.business_brain (org_id, business_name)
  values (new_org_id, display_name)
  on conflict (org_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- updated_at triggers
drop trigger if exists set_entitlements_updated_at on public.entitlements;
create trigger set_entitlements_updated_at
  before update on public.entitlements
  for each row execute function private.set_updated_at();

drop trigger if exists set_business_brain_updated_at on public.business_brain;
create trigger set_business_brain_updated_at
  before update on public.business_brain
  for each row execute function private.set_updated_at();

-- ===========================================================================
-- Row-Level Security
-- ===========================================================================

alter table public.orgs enable row level security;
alter table public.org_members enable row level security;
alter table public.plans enable row level security;
alter table public.entitlements enable row level security;
alter table public.usage_events enable row level security;
alter table public.business_brain enable row level security;

-- orgs: members can see their own org(s). No client-side insert (created via trigger).
drop policy if exists "orgs_select_members" on public.orgs;
create policy "orgs_select_members" on public.orgs
  for select
  using (id in (select private.user_org_ids()));

drop policy if exists "orgs_update_owner_admin" on public.orgs;
create policy "orgs_update_owner_admin" on public.orgs
  for update
  using (private.is_org_owner_or_admin(id))
  with check (private.is_org_owner_or_admin(id));

-- org_members: members can see membership rows for their own org(s).
-- Only owner/admin can add/remove/change members.
drop policy if exists "org_members_select_members" on public.org_members;
create policy "org_members_select_members" on public.org_members
  for select
  using (org_id in (select private.user_org_ids()));

drop policy if exists "org_members_insert_owner_admin" on public.org_members;
create policy "org_members_insert_owner_admin" on public.org_members
  for insert
  with check (private.is_org_owner_or_admin(org_id));

drop policy if exists "org_members_update_owner_admin" on public.org_members;
create policy "org_members_update_owner_admin" on public.org_members
  for update
  using (private.is_org_owner_or_admin(org_id))
  with check (private.is_org_owner_or_admin(org_id));

drop policy if exists "org_members_delete_owner_admin" on public.org_members;
create policy "org_members_delete_owner_admin" on public.org_members
  for delete
  using (private.is_org_owner_or_admin(org_id));

-- plans: readable by any authenticated user (pricing/limits are not sensitive);
-- no client-side writes.
drop policy if exists "plans_select_authenticated" on public.plans;
create policy "plans_select_authenticated" on public.plans
  for select
  to authenticated
  using (true);

-- entitlements: org members can view; only owner/admin can change plan/flags/overrides.
drop policy if exists "entitlements_select_members" on public.entitlements;
create policy "entitlements_select_members" on public.entitlements
  for select
  using (org_id in (select private.user_org_ids()));

drop policy if exists "entitlements_update_owner_admin" on public.entitlements;
create policy "entitlements_update_owner_admin" on public.entitlements
  for update
  using (private.is_org_owner_or_admin(org_id))
  with check (private.is_org_owner_or_admin(org_id));

-- usage_events: org members can view their org's usage history.
-- No insert/update/delete policy for anon/authenticated — usage is recorded
-- exclusively via the service-role key from trusted server code.
drop policy if exists "usage_events_select_members" on public.usage_events;
create policy "usage_events_select_members" on public.usage_events
  for select
  using (org_id in (select private.user_org_ids()));

-- business_brain: any org member can read and write (the whole team maintains it).
drop policy if exists "business_brain_select_members" on public.business_brain;
create policy "business_brain_select_members" on public.business_brain
  for select
  using (org_id in (select private.user_org_ids()));

drop policy if exists "business_brain_insert_members" on public.business_brain;
create policy "business_brain_insert_members" on public.business_brain
  for insert
  with check (org_id in (select private.user_org_ids()));

drop policy if exists "business_brain_update_members" on public.business_brain;
create policy "business_brain_update_members" on public.business_brain
  for update
  using (org_id in (select private.user_org_ids()))
  with check (org_id in (select private.user_org_ids()));
