-- 0012 — durable webhook delivery receipts (diagnostic).
--
-- Vercel runtime logs proved too short-lived/opaque to debug Meta's
-- webhook envelopes with confidence. Every POST to a webhook route now
-- stores its raw (signature-verified) payload here so "what did Meta
-- actually send" is answerable from SQL, verbatim. Service-role only;
-- no client reads. Safe to prune at will.

create table if not exists public.webhook_receipts (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.webhook_receipts enable row level security;
-- No policies: service-role only, invisible to authenticated clients.
