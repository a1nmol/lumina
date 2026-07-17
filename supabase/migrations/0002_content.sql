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
