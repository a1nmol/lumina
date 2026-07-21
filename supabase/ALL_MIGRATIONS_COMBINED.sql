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
-- SECURITY DEFINER + empty search_path (all references below are already
-- fully schema-qualified) so it can be used inside RLS policies without
-- those policies re-triggering RLS on org_members recursively, and without
-- being susceptible to search_path hijacking.
create or replace function private.user_org_ids()
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select org_id from public.org_members where user_id = auth.uid();
$$;

-- private.is_org_owner_or_admin(org uuid) — is the current user an owner/admin of org?
create or replace function private.is_org_owner_or_admin(target_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.org_members
    where org_id = target_org_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

-- Hardening: these two helper functions are invoked from inside RLS policies
-- (as the querying user, e.g. `authenticated`), so that role needs EXECUTE —
-- but no other role should be able to call them directly.
revoke execute on function private.user_org_ids() from public;
grant execute on function private.user_org_ids() to authenticated;

revoke execute on function private.is_org_owner_or_admin(uuid) from public;
grant execute on function private.is_org_owner_or_admin(uuid) to authenticated;

-- generic updated_at maintenance trigger
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ===========================================================================
-- New-user bootstrap: default org + owner membership + entitlements + brain
-- ===========================================================================

-- Bootstraps a default org + owner membership + entitlements + empty
-- business_brain for every new auth.users row. Slug generation is
-- collision-proof with no check-then-insert race (always attempt insert,
-- retry on unique_violation). The whole body is wrapped in an outer
-- exception handler: bootstrap failure must NEVER block the auth.users
-- insert itself. If this silently fails, src/lib/org.ts#ensureOrgBootstrap
-- repairs the org on next sign-in from trusted server code.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_org_id uuid;
  base_slug text;
  candidate_slug text;
  display_name text;
  attempt int;
  inserted boolean := false;
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

  new_org_id := public.gen_random_uuid();

  -- Always attempt the insert; retry on unique_violation rather than
  -- check-then-insert (which races under concurrent signups). Max 3
  -- attempts: base slug, then a random suffix, then a suffix derived from
  -- this row's own freshly-generated uuid (which cannot collide).
  for attempt in 1..3 loop
    if attempt = 1 then
      candidate_slug := base_slug;
    elsif attempt = 2 then
      candidate_slug := base_slug || '-' || substr(md5(random()::text), 1, 6);
    else
      candidate_slug := base_slug || '-' || substr(replace(new_org_id::text, '-', ''), 1, 8);
    end if;

    begin
      insert into public.orgs (id, name, slug)
      values (new_org_id, display_name, candidate_slug);
      inserted := true;
    exception
      when unique_violation then
        inserted := false;
    end;

    exit when inserted;
  end loop;

  if not inserted then
    raise exception 'private.handle_new_user: could not allocate a unique org slug after 3 attempts';
  end if;

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
exception
  when others then
    -- Never let bootstrap failure block auth.users insert (signup must
    -- always succeed). ensureOrgBootstrap() repairs this on next request.
    raise warning 'private.handle_new_user failed for user % (%): % (sqlstate %)',
      new.id, new.email, sqlerrm, sqlstate;
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
  to authenticated
  using (id in (select private.user_org_ids()));

drop policy if exists "orgs_update_owner_admin" on public.orgs;
create policy "orgs_update_owner_admin" on public.orgs
  for update
  to authenticated
  using (private.is_org_owner_or_admin(id))
  with check (private.is_org_owner_or_admin(id));

-- org_members: members can see membership rows for their own org(s).
-- Only owner/admin can add/remove/change members.
drop policy if exists "org_members_select_members" on public.org_members;
create policy "org_members_select_members" on public.org_members
  for select
  to authenticated
  using (org_id in (select private.user_org_ids()));

drop policy if exists "org_members_insert_owner_admin" on public.org_members;
create policy "org_members_insert_owner_admin" on public.org_members
  for insert
  to authenticated
  with check (private.is_org_owner_or_admin(org_id));

drop policy if exists "org_members_update_owner_admin" on public.org_members;
create policy "org_members_update_owner_admin" on public.org_members
  for update
  to authenticated
  using (private.is_org_owner_or_admin(org_id))
  with check (private.is_org_owner_or_admin(org_id));

drop policy if exists "org_members_delete_owner_admin" on public.org_members;
create policy "org_members_delete_owner_admin" on public.org_members
  for delete
  to authenticated
  using (private.is_org_owner_or_admin(org_id));

-- plans: readable by any authenticated user (pricing/limits are not sensitive);
-- no client-side writes.
drop policy if exists "plans_select_authenticated" on public.plans;
create policy "plans_select_authenticated" on public.plans
  for select
  to authenticated
  using (true);

-- entitlements: org members can view (select-only for clients). Entitlements
-- (plan, feature flags, usage overrides) are a self-escalation risk if any
-- org member/admin could write them directly — an org admin could grant
-- themselves unlimited usage or paid feature flags. By design there is NO
-- update/insert/delete policy here for `authenticated`: all entitlement
-- writes happen exclusively via the service-role admin client from trusted
-- server code (see src/lib/entitlements.ts, src/lib/org.ts).
drop policy if exists "entitlements_select_members" on public.entitlements;
create policy "entitlements_select_members" on public.entitlements
  for select
  to authenticated
  using (org_id in (select private.user_org_ids()));

drop policy if exists "entitlements_update_owner_admin" on public.entitlements;

-- usage_events: org members can view their org's usage history.
-- No insert/update/delete policy for anon/authenticated — usage is recorded
-- exclusively via the service-role key from trusted server code.
drop policy if exists "usage_events_select_members" on public.usage_events;
create policy "usage_events_select_members" on public.usage_events
  for select
  to authenticated
  using (org_id in (select private.user_org_ids()));

-- business_brain: any org member can read and write (the whole team maintains it).
drop policy if exists "business_brain_select_members" on public.business_brain;
create policy "business_brain_select_members" on public.business_brain
  for select
  to authenticated
  using (org_id in (select private.user_org_ids()));

drop policy if exists "business_brain_insert_members" on public.business_brain;
create policy "business_brain_insert_members" on public.business_brain
  for insert
  to authenticated
  with check (org_id in (select private.user_org_ids()));

drop policy if exists "business_brain_update_members" on public.business_brain;
create policy "business_brain_update_members" on public.business_brain
  for update
  to authenticated
  using (org_id in (select private.user_org_ids()))
  with check (org_id in (select private.user_org_ids()));
-- LocalOS — 0002_content.sql
-- Phase 1 data layer: Content Studio persistence (content_items, templates,
-- media_assets). Same conventions as 0001_foundation.sql: re-runnable
-- (`if not exists` / drop-then-create policies+triggers), Row-Level Security
-- on every table, org-scoped via private.user_org_ids().
--
-- Depends on 0001_foundation.sql (public.orgs, private.user_org_ids(),
-- private.is_org_owner_or_admin(), private.set_updated_at()).

-- ===========================================================================
-- Tables
-- ===========================================================================

-- content_items — one row per generated/composed post (draft through posted).
create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  prompt text,
  caption text,
  hashtags text[] not null default '{}',
  format text not null check (format in ('single', 'carousel', 'slideshow')),
  platforms text[] not null default '{}',
  image_description text,
  media_urls jsonb not null default '[]'::jsonb,
  model text,
  cost_usd numeric(10, 6) not null default 0,
  rating smallint not null default 0 check (rating in (-1, 0, 1)),
  status text not null default 'draft' check (status in ('draft', 'queued', 'scheduled', 'posted')),
  scheduled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_items_org_created_idx
  on public.content_items (org_id, created_at desc);
create index if not exists content_items_org_status_idx
  on public.content_items (org_id, status);
create index if not exists content_items_org_scheduled_idx
  on public.content_items (org_id, scheduled_at)
  where scheduled_at is not null;

-- templates — a saved, reusable "recipe" a user can regenerate from later.
create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null,
  source_content_id uuid references public.content_items(id) on delete set null,
  prompt text,
  caption text,
  hashtags text[] not null default '{}',
  format text not null check (format in ('single', 'carousel', 'slideshow')),
  platforms text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists templates_org_created_idx
  on public.templates (org_id, created_at desc);

-- media_assets — generated images/video/audio, optionally attached to a
-- content_item (kept even if the parent item is later deleted, for cost
-- auditing — hence on delete set null rather than cascade).
create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  content_id uuid references public.content_items(id) on delete set null,
  kind text not null check (kind in ('image', 'video', 'audio')),
  url text not null,
  provider text,
  cost_usd numeric(10, 6) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists media_assets_org_created_idx
  on public.media_assets (org_id, created_at desc);
create index if not exists media_assets_content_id_idx
  on public.media_assets (content_id)
  where content_id is not null;

-- ===========================================================================
-- Triggers
-- ===========================================================================

-- Only content_items carries an updated_at column (templates/media_assets are
-- effectively append-only/immutable once created).
drop trigger if exists set_content_items_updated_at on public.content_items;
create trigger set_content_items_updated_at
  before update on public.content_items
  for each row execute function private.set_updated_at();

-- ===========================================================================
-- Row-Level Security
-- ===========================================================================

alter table public.content_items enable row level security;
alter table public.templates enable row level security;
alter table public.media_assets enable row level security;

-- content_items: any org member can read/create/edit; only owner/admin can delete.
drop policy if exists "content_items_select_members" on public.content_items;
create policy "content_items_select_members" on public.content_items
  for select
  to authenticated
  using (org_id in (select private.user_org_ids()));

drop policy if exists "content_items_insert_members" on public.content_items;
create policy "content_items_insert_members" on public.content_items
  for insert
  to authenticated
  with check (org_id in (select private.user_org_ids()));

drop policy if exists "content_items_update_members" on public.content_items;
create policy "content_items_update_members" on public.content_items
  for update
  to authenticated
  using (org_id in (select private.user_org_ids()))
  with check (org_id in (select private.user_org_ids()));

drop policy if exists "content_items_delete_owner_admin" on public.content_items;
create policy "content_items_delete_owner_admin" on public.content_items
  for delete
  to authenticated
  using (private.is_org_owner_or_admin(org_id));

-- templates: any org member can read/create/edit; only owner/admin can delete.
drop policy if exists "templates_select_members" on public.templates;
create policy "templates_select_members" on public.templates
  for select
  to authenticated
  using (org_id in (select private.user_org_ids()));

drop policy if exists "templates_insert_members" on public.templates;
create policy "templates_insert_members" on public.templates
  for insert
  to authenticated
  with check (org_id in (select private.user_org_ids()));

drop policy if exists "templates_update_members" on public.templates;
create policy "templates_update_members" on public.templates
  for update
  to authenticated
  using (org_id in (select private.user_org_ids()))
  with check (org_id in (select private.user_org_ids()));

drop policy if exists "templates_delete_owner_admin" on public.templates;
create policy "templates_delete_owner_admin" on public.templates
  for delete
  to authenticated
  using (private.is_org_owner_or_admin(org_id));

-- media_assets: any org member can read/create/edit; only owner/admin can delete.
drop policy if exists "media_assets_select_members" on public.media_assets;
create policy "media_assets_select_members" on public.media_assets
  for select
  to authenticated
  using (org_id in (select private.user_org_ids()));

drop policy if exists "media_assets_insert_members" on public.media_assets;
create policy "media_assets_insert_members" on public.media_assets
  for insert
  to authenticated
  with check (org_id in (select private.user_org_ids()));

drop policy if exists "media_assets_update_members" on public.media_assets;
create policy "media_assets_update_members" on public.media_assets
  for update
  to authenticated
  using (org_id in (select private.user_org_ids()))
  with check (org_id in (select private.user_org_ids()));

drop policy if exists "media_assets_delete_owner_admin" on public.media_assets;
create policy "media_assets_delete_owner_admin" on public.media_assets
  for delete
  to authenticated
  using (private.is_org_owner_or_admin(org_id));
-- LocalOS — 0003_frontdesk.sql
-- Phase 2 data layer: Unified Inbox + FrontDesk (text) + Contacts/CRM
-- (contacts, conversations, messages, appointments). Same conventions as
-- 0001_foundation.sql / 0002_content.sql: re-runnable (`if not exists` /
-- drop-then-create policies+triggers), Row-Level Security on every table,
-- org-scoped via private.user_org_ids().
--
-- Depends on 0001_foundation.sql (public.orgs, private.user_org_ids(),
-- private.is_org_owner_or_admin(), private.set_updated_at()).

-- ===========================================================================
-- Tables
-- ===========================================================================

-- contacts — the CRM record and the join between Content (outbound) and
-- FrontDesk (inbound) per MASTER_PLAN.md §1 ("the join between halves = the
-- Contact record").
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text,
  phone text,
  email text,
  source text not null check (
    source in (
      'web_chat', 'form', 'sms', 'email', 'instagram', 'facebook',
      'google', 'missed_call', 'manual'
    )
  ),
  status text not null default 'lead' check (status in ('lead', 'contacted', 'booked', 'customer')),
  tags text[] not null default '{}',
  notes text,
  custom jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contacts_org_created_idx
  on public.contacts (org_id, created_at desc);
create index if not exists contacts_org_status_idx
  on public.contacts (org_id, status);

-- One contact per (org, phone) / (org, email) when those fields are present.
-- Partial unique indexes (rather than `unique nulls not distinct`) so a
-- contact can have a null phone and/or null email without colliding with
-- every other null-phone contact in the org.
create unique index if not exists contacts_org_phone_key
  on public.contacts (org_id, phone)
  where phone is not null;
create unique index if not exists contacts_org_email_key
  on public.contacts (org_id, email)
  where email is not null;

-- conversations — one thread per contact per channel. channel reuses the
-- contacts.source vocabulary minus 'manual' (a conversation always arrives
-- via a real channel; manual is only for CRM-created contacts).
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  channel text not null check (
    channel in (
      'web_chat', 'form', 'sms', 'email', 'instagram', 'facebook',
      'google', 'missed_call'
    )
  ),
  status text not null default 'open' check (status in ('open', 'pending', 'resolved')),
  -- Named AI-transparency states (never a numeric confidence score) — see
  -- docs/design-briefs/phase-2-inbox-frontdesk-crm.md "AI transparency rules".
  ai_state text not null default 'human' check (
    ai_state in ('ai_answered', 'ai_draft', 'escalated', 'human')
  ),
  last_message_at timestamptz,
  unread boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_org_last_message_idx
  on public.conversations (org_id, last_message_at desc nulls last);
create index if not exists conversations_org_status_idx
  on public.conversations (org_id, status);
create index if not exists conversations_contact_id_idx
  on public.conversations (contact_id);

-- messages — append-only per-conversation message ledger (customer replies +
-- business replies + internal notes). ai_handled/model/cost_usd let a
-- message double as a usage/cost audit trail for AI-drafted or AI-sent
-- replies, mirroring usage_events' shape.
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  kind text not null default 'message' check (kind in ('message', 'note')),
  body text,
  ai_handled boolean not null default false,
  model text,
  cost_usd numeric(10, 6) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at);
create index if not exists messages_org_created_idx
  on public.messages (org_id, created_at desc);

-- appointments — bookings tied to a contact (Booking per MASTER_PLAN.md §4.D).
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz,
  service text,
  status text not null default 'scheduled' check (
    status in ('scheduled', 'completed', 'cancelled', 'no_show')
  ),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists appointments_org_starts_idx
  on public.appointments (org_id, starts_at);
create index if not exists appointments_contact_id_idx
  on public.appointments (contact_id);

-- ===========================================================================
-- Triggers
-- ===========================================================================

drop trigger if exists set_contacts_updated_at on public.contacts;
create trigger set_contacts_updated_at
  before update on public.contacts
  for each row execute function private.set_updated_at();

drop trigger if exists set_conversations_updated_at on public.conversations;
create trigger set_conversations_updated_at
  before update on public.conversations
  for each row execute function private.set_updated_at();

drop trigger if exists set_appointments_updated_at on public.appointments;
create trigger set_appointments_updated_at
  before update on public.appointments
  for each row execute function private.set_updated_at();

-- messages has no updated_at column (append-only ledger, like usage_events).

-- ===========================================================================
-- Row-Level Security
-- ===========================================================================

alter table public.contacts enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.appointments enable row level security;

-- contacts: any org member can read/create/edit; only owner/admin can delete.
drop policy if exists "contacts_select_members" on public.contacts;
create policy "contacts_select_members" on public.contacts
  for select
  to authenticated
  using (org_id in (select private.user_org_ids()));

drop policy if exists "contacts_insert_members" on public.contacts;
create policy "contacts_insert_members" on public.contacts
  for insert
  to authenticated
  with check (org_id in (select private.user_org_ids()));

drop policy if exists "contacts_update_members" on public.contacts;
create policy "contacts_update_members" on public.contacts
  for update
  to authenticated
  using (org_id in (select private.user_org_ids()))
  with check (org_id in (select private.user_org_ids()));

drop policy if exists "contacts_delete_owner_admin" on public.contacts;
create policy "contacts_delete_owner_admin" on public.contacts
  for delete
  to authenticated
  using (private.is_org_owner_or_admin(org_id));

-- conversations: any org member can read/create/edit; only owner/admin can delete.
drop policy if exists "conversations_select_members" on public.conversations;
create policy "conversations_select_members" on public.conversations
  for select
  to authenticated
  using (org_id in (select private.user_org_ids()));

drop policy if exists "conversations_insert_members" on public.conversations;
create policy "conversations_insert_members" on public.conversations
  for insert
  to authenticated
  with check (org_id in (select private.user_org_ids()));

drop policy if exists "conversations_update_members" on public.conversations;
create policy "conversations_update_members" on public.conversations
  for update
  to authenticated
  using (org_id in (select private.user_org_ids()))
  with check (org_id in (select private.user_org_ids()));

drop policy if exists "conversations_delete_owner_admin" on public.conversations;
create policy "conversations_delete_owner_admin" on public.conversations
  for delete
  to authenticated
  using (private.is_org_owner_or_admin(org_id));

-- messages: any org member can read/create (the whole team replies from the
-- inbox). No update/delete policy — messages are an append-only ledger, like
-- usage_events. Inserts also happen via the service-role admin client
-- (webhook channel ingestion, Phase 2 connections — see docs/backend-notes.md);
-- the service role bypasses RLS entirely, so this "authenticated" policy only
-- covers the in-app compose path.
drop policy if exists "messages_select_members" on public.messages;
create policy "messages_select_members" on public.messages
  for select
  to authenticated
  using (org_id in (select private.user_org_ids()));

drop policy if exists "messages_insert_members" on public.messages;
create policy "messages_insert_members" on public.messages
  for insert
  to authenticated
  with check (org_id in (select private.user_org_ids()));

-- appointments: any org member can read/create/edit; only owner/admin can delete.
drop policy if exists "appointments_select_members" on public.appointments;
create policy "appointments_select_members" on public.appointments
  for select
  to authenticated
  using (org_id in (select private.user_org_ids()));

drop policy if exists "appointments_insert_members" on public.appointments;
create policy "appointments_insert_members" on public.appointments
  for insert
  to authenticated
  with check (org_id in (select private.user_org_ids()));

drop policy if exists "appointments_update_members" on public.appointments;
create policy "appointments_update_members" on public.appointments
  for update
  to authenticated
  using (org_id in (select private.user_org_ids()))
  with check (org_id in (select private.user_org_ids()));

drop policy if exists "appointments_delete_owner_admin" on public.appointments;
create policy "appointments_delete_owner_admin" on public.appointments
  for delete
  to authenticated
  using (private.is_org_owner_or_admin(org_id));
-- LocalOS — 0004_analytics.sql
-- Phase 3 data layer: Analytics loop (analytics_events) + Reviews.
-- Same conventions as 0001/0002/0003: re-runnable (`if not exists` /
-- drop-then-create policies+triggers), Row-Level Security on every table,
-- org-scoped via private.user_org_ids().
--
-- Depends on 0001_foundation.sql (public.orgs, private.user_org_ids(),
-- private.is_org_owner_or_admin(), private.set_updated_at()), 0002_content.sql
-- (public.content_items), and 0003_frontdesk.sql (public.contacts,
-- public.conversations).

-- ===========================================================================
-- Tables
-- ===========================================================================

-- analytics_events — append-only ledger of everything the Analytics loop
-- (MASTER_PLAN.md §4.E, "loop metrics — which post → which calls/leads/
-- bookings") is built from: post publishes + their platform metrics, and
-- every inbound-side outcome (widget opens, conversations, leads, bookings,
-- reviews). content_id/contact_id/conversation_id are all nullable because
-- not every event kind carries every reference (e.g. a 'widget_open' has
-- none of the three; a 'post_metric' only has content_id).
create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.orgs(id) on delete cascade,
  kind text not null check (
    kind in (
      'post_published', 'post_metric', 'widget_open', 'conversation_started',
      'lead_captured', 'booking_created', 'review_received'
    )
  ),
  content_id uuid references public.content_items(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  -- Generic numeric payload: event count (default 1), or a metric value for
  -- 'post_metric' rows (see metadata.metric below for which metric it is).
  value numeric not null default 1,
  -- For 'post_metric': { "metric": "reach" | "engagement" | "clicks", ... }.
  -- For 'conversation_started'/'lead_captured'/etc: may carry { "channel": ... }
  -- as a denormalized fallback for events whose conversation_id is null.
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists analytics_events_org_occurred_idx
  on public.analytics_events (org_id, occurred_at desc);
create index if not exists analytics_events_org_content_idx
  on public.analytics_events (org_id, content_id)
  where content_id is not null;

-- reviews — pulled from Google/Facebook (ingestion TODO, see
-- docs/backend-notes.md) or entered manually; AI-drafted or human replies
-- tracked via reply_status (MASTER_PLAN.md §4.F "review generation" /
-- design brief phase-3-analytics-reviews.md "Reviews").
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  platform text not null check (platform in ('google', 'facebook')),
  reviewer_name text,
  rating smallint not null check (rating between 1 and 5),
  body text,
  sentiment text check (sentiment in ('positive', 'neutral', 'negative')),
  reply text,
  reply_status text not null default 'none' check (
    reply_status in ('none', 'ai_draft', 'replied', 'auto_replied')
  ),
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reviews_org_received_idx
  on public.reviews (org_id, received_at desc);
create index if not exists reviews_org_reply_status_idx
  on public.reviews (org_id, reply_status);

-- ===========================================================================
-- Triggers
-- ===========================================================================

-- analytics_events has no updated_at — it's an append-only ledger, like
-- usage_events / messages.
drop trigger if exists set_reviews_updated_at on public.reviews;
create trigger set_reviews_updated_at
  before update on public.reviews
  for each row execute function private.set_updated_at();

-- ===========================================================================
-- Row-Level Security
-- ===========================================================================

alter table public.analytics_events enable row level security;
alter table public.reviews enable row level security;

-- analytics_events: org members can read their org's events. No insert/
-- update/delete policy for `authenticated` — events are recorded exclusively
-- via the service-role admin client from trusted server/system paths
-- (webhooks, publish jobs, FrontDesk outcome recording — see
-- src/lib/analytics.ts#recordAnalyticsEvent), exactly like usage_events.
drop policy if exists "analytics_events_select_members" on public.analytics_events;
create policy "analytics_events_select_members" on public.analytics_events
  for select
  to authenticated
  using (org_id in (select private.user_org_ids()));

-- reviews: any org member can read/create/edit (drafting + sending replies
-- is a whole-team task, like contacts/conversations); only owner/admin can
-- delete.
drop policy if exists "reviews_select_members" on public.reviews;
create policy "reviews_select_members" on public.reviews
  for select
  to authenticated
  using (org_id in (select private.user_org_ids()));

drop policy if exists "reviews_insert_members" on public.reviews;
create policy "reviews_insert_members" on public.reviews
  for insert
  to authenticated
  with check (org_id in (select private.user_org_ids()));

drop policy if exists "reviews_update_members" on public.reviews;
create policy "reviews_update_members" on public.reviews
  for update
  to authenticated
  using (org_id in (select private.user_org_ids()))
  with check (org_id in (select private.user_org_ids()));

drop policy if exists "reviews_delete_owner_admin" on public.reviews;
create policy "reviews_delete_owner_admin" on public.reviews
  for delete
  to authenticated
  using (private.is_org_owner_or_admin(org_id));
-- LocalOS — 0005_plans.sql
-- Seeds the `starter` and `pro` plan rows (MASTER_PLAN.md §4.G "subscription
-- tiers — structure now, charge later"). Pricing/limits are INDICATIVE ONLY
-- — no Stripe/billing wiring yet. Every org remains on `free_test` during
-- the invite-only test phase (entitlements.plan_id defaults to 'free_test',
-- see 0001_foundation.sql). Numbers here must match src/lib/plans.ts.
--
-- Idempotent: safe to re-run (upserts by primary key).

insert into public.plans (id, name, monthly_price_cents, limits)
values
  (
    'starter',
    'Starter',
    2900,
    jsonb_build_object(
      'content_generations', 500,
      'images', 300,
      'slideshows', 60,
      'ai_replies', 2000,
      'spend_cap_usd', 25
    )
  ),
  (
    'pro',
    'Pro',
    7900,
    jsonb_build_object(
      'content_generations', 2000,
      'images', 1000,
      'slideshows', 200,
      'ai_replies', 8000,
      'spend_cap_usd', 80
    )
  )
on conflict (id) do update set
  name = excluded.name,
  monthly_price_cents = excluded.monthly_price_cents,
  limits = excluded.limits;
