-- 0022 — Settings reborn (redesign R2): the '[no-followups]' standing-order
-- magic string becomes an honest, visible setting. Default true preserves
-- current behavior for every existing org.
alter table public.business_brain
  add column if not exists follow_ups_enabled boolean not null default true;

-- Backfill (review-caught): before this column existed, follow-ups were
-- gated on frontdesk_auto_reply — an org that had opted OUT of AI autonomy
-- never got nudges. Defaulting the new column to true would silently switch
-- them on for exactly that opted-out population; carry the old signal over
-- so effective behavior is unchanged for every existing org.
update public.business_brain set follow_ups_enabled = frontdesk_auto_reply;
