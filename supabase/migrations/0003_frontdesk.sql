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
