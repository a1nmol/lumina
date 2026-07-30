-- 0014 — atomic Instagram webhook dedupe.
--
-- The route's select-then-insert dedupe on metadata->>'instagram_mid' has a
-- race: two concurrent deliveries of the same Meta event can both pass the
-- select before either inserts, double-recording the message — and, since
-- attachment vision (describe-image) runs per recorded image message, double
-- paying for vision. This partial unique index makes the insert itself the
-- arbiter: the loser errors, is caught by the route's per-event try/catch,
-- and Meta still gets its 200.

create unique index if not exists messages_instagram_mid_unique
  on public.messages ((metadata->>'instagram_mid'))
  where metadata->>'instagram_mid' is not null;
