-- 0011 — per-conversation + org-default AI auto-reply controls.
--
-- Owner direction ("maximize AI control"): the AI's right to auto-reply is
-- decided per CONVERSATION — auto for this customer, off for that one —
-- with an org-wide default for new threads. 'off' means the AI never sends
-- on its own for that thread; it still prepares drafts for the owner
-- (ai_state 'ai_draft'), so the assist never disappears, only the autonomy.
--
-- Additive only; both columns default to today's behavior (auto replies on).

alter table public.conversations
  add column if not exists ai_mode text not null default 'auto'
  constraint conversations_ai_mode_check check (ai_mode in ('auto', 'off'));

alter table public.business_brain
  add column if not exists frontdesk_auto_reply boolean not null default true;
