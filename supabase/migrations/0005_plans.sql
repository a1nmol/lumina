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
