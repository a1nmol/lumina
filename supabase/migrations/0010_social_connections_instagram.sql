-- LocalOS — 0010_social_connections_instagram.sql
-- Instagram Business Login CONNECT path (src/lib/social/instagram.ts) — the
-- Page-less alternative to the Meta/Facebook-Login flow
-- (supabase/migrations/0008_social_connections.sql, src/lib/social/meta.ts).
-- An Instagram professional (Business/Creator) account connects with its own
-- instagram.com login — no Facebook Page required. Reuses the same
-- social_connections table; this migration only widens the `provider` check
-- constraint to allow 'instagram' alongside 'meta'.
--
-- Column reuse for provider='instagram' rows (see src/lib/social/instagram.ts):
--   page_id      — reused to store the Instagram user id (column is `not null`,
--                  and there is no Page in this flow, so the IG user id fills
--                  the same "external account id" role the Facebook Page id
--                  fills for provider='meta').
--   ig_user_id   — the same Instagram user id, duplicated here for symmetry
--                  with provider='meta' rows and so callers can rely on
--                  ig_user_id being populated regardless of provider.
--   ig_username  — the @handle.
--   page_name    — null for provider='instagram' rows (no Page name exists);
--                  the UI falls back to the @username.
--
-- Same conventions as prior migrations: re-runnable (drop-then-add
-- constraint), no data migration needed (existing rows are all
-- provider='meta', which remains valid).
--
-- Depends on 0008_social_connections.sql.
--
-- NOTE (applied as a FILE ONLY): this migration is NOT run against the live
-- Supabase project by the builder — the lead applies it. Do not run this
-- migration outside that review step.

-- ===========================================================================
-- Widen the provider check constraint
-- ===========================================================================

-- Postgres auto-named this constraint `<table>_<column>_check` since 0008
-- declared it inline (`provider text not null check (provider in ('meta'))`)
-- rather than as a named table constraint.
alter table public.social_connections
  drop constraint if exists social_connections_provider_check;

alter table public.social_connections
  add constraint social_connections_provider_check
  check (provider in ('meta', 'instagram'));
