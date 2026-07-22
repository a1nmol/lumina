-- LocalOS — 0007_early_access_leads.sql
-- Gate 2: marketing landing page "pilot menu" (early-access) form
-- (docs/design-briefs/landing-copy.md §14, brand-redesign-plan.md §5.11).
--
-- Public, unauthenticated visitors submit business name + email from the
-- landing page's pilot-menu form (src/app/(marketing)/actions.ts
-- saveEarlyAccessLead). That server action uses the SERVICE-ROLE ADMIN
-- CLIENT (src/lib/supabase/admin.ts), never the RLS-scoped server client —
-- the visitor has no Supabase auth session at all, so this table
-- intentionally grants NOTHING to `anon`/`authenticated` below. Row-Level
-- Security is enabled with zero policies defined: only the service role
-- (which bypasses RLS entirely) can read or write. Abuse is bounded
-- upstream by the server action's in-memory rate limit
-- (src/lib/marketing/rate-limit.ts — same "acceptable at invite-only test
-- scale" tradeoff as src/app/api/frontdesk/_shared.ts's checkRateLimit)
-- plus basic input validation (non-empty business name, a plausible email
-- shape, length caps).
--
-- NOTE (applied as a FILE ONLY): this migration is NOT run against the live
-- Supabase project by the builder — the lead applies it. Do not run this
-- migration outside that review step.

-- ===========================================================================
-- Tables
-- ===========================================================================

create table if not exists public.early_access_leads (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  email text not null,
  created_at timestamptz not null default now()
);

create index if not exists early_access_leads_created_at_idx
  on public.early_access_leads (created_at desc);

-- ===========================================================================
-- Row-Level Security — service-role only. No policies are defined for
-- `anon`/`authenticated` on purpose (see header comment); RLS enabled with
-- no matching policy denies everything to those roles by default, while the
-- service-role admin client bypasses RLS entirely as usual.
-- ===========================================================================

alter table public.early_access_leads enable row level security;
