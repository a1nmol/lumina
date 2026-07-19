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
