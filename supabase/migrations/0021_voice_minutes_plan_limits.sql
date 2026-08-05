-- 0021 — adds `voice_minutes` to each seeded plan's `limits` jsonb (AI Phone
-- Receptionist pilot, migration 0020). This is a data-only change (no schema
-- change — `plans.limits` is already jsonb) that keeps the live `plans`
-- table in sync with src/lib/plans.ts's PLAN_CATALOG, matching
-- 0005_plans.sql's own header note ("Numbers here must match
-- src/lib/plans.ts"). Merges rather than replaces `limits` so any other
-- future key added out-of-band isn't clobbered. Idempotent — safe to re-run.
--
-- NOTE: the ACTUAL per-org voice cap enforced at call time is
-- org_voice_settings.max_minutes_month (settings-configurable, defaults 60
-- via migration 0020) — this plan-level number is the catalog ceiling shown
-- in /admin, not what src/lib/voice/webhook.ts#hasVoiceMinutesRemaining
-- reads.

update public.plans
set limits = limits || jsonb_build_object('voice_minutes', 30)
where id = 'free_test';

update public.plans
set limits = limits || jsonb_build_object('voice_minutes', 60)
where id = 'starter';

update public.plans
set limits = limits || jsonb_build_object('voice_minutes', 200)
where id = 'pro';
