# Design Brief — Phase 2: Unified Inbox, FrontDesk (text), Contacts/CRM

Synthesized from ui-researcher report (Chatwoot, Front/Missive, Intercom, Attio, Twenty, Crisp). Tokens/motion from `globals.css` + `src/lib/motion.ts`. Simplified for solo owners — no support-team chrome.

## Unified Inbox (`/inbox`, 3-pane)

- **Pane 1 — thread list:** row = avatar with channel-glyph badge (bottom-right corner chip) → name → 1-line snippet (muted) → relative time (top-right) → unread dot (brand indigo, left edge) → status as tiny colored dot (Open/Pending/Resolved). AI-handled = small sparkle chip next to channel badge, icon-only. Filters row on top (All · Needs you · AI handled · channel filter dropdown).
- **Pane 2 — conversation:** header (name, channel, status, named AI state: "AI answered" / "AI drafted — needs review" / "Escalated to you"), message bubbles (customer left, business right), internal notes with amber-tinted background. **Composer:** Reply/Note toggle tabs above input — note mode tints the whole composer amber. AI draft arrives PRE-FILLED in the composer with a brand-indigo left border + "AI draft" label; action row beneath: Send · Edit (default focus) · Regenerate · Discard.
- **Pane 3 — context:** contact identity block, pipeline status pill, quick actions (status, tags, note) pinned top, past conversations accordion (collapsed), linked bookings.
- Responsive: pane 3 collapses to a Sheet < xl; list → full-screen detail pattern on mobile.
- **Channel identity:** icon glyphs ONLY (monochrome, currentColor); color is reserved for status/unread. Custom minimal SVG glyph set for SMS/IG/Google where Lucide lacks marks.

## AI transparency rules (FrontDesk)

Three named states, never numeric confidence: **AI answered** (auto-sent) · **AI drafted — needs review** · **Escalated to you**. Owner can jump into any AI thread instantly (no "take over" ceremony). AI failure copy is plain: "I couldn't answer this — flagging for you."
**Instant lead alert:** toast (brand left accent, contact + channel icon + one-line reason + View CTA, 8s) AND a persistent notification tray (bell in the app header) — a toast is never the only record. `aria-live="polite"`.

## Contacts/CRM (`/contacts`)

- Table: generous row height, hairline inner borders, pastel status pills (Lead / Contacted / Booked / Customer — soft bg + bold text), tag chips, hover-reveal row actions (message, book, call). Search + status filter.
- Quick view: slide-in drawer (Sheet) from the table/inbox. Full profile page (`/contacts/[id]`): Twenty-style unified activity timeline — messages across channels, status changes, appointments, notes — chronological, type icons, collapsed entries expand.
- Simplicity: tags + one pipeline dropdown + notes. NO custom-field builder.

## Web chat widget (embeddable, Phase 2 build)

Circular FAB bottom-right, brand fill, chat↔X icon morph (200ms). Delayed one-line welcome teaser (dismissible, appears after ~8s, not on load). Unread counter badge springs in. Full-screen panel below 480px. Bundle: tiny standalone script, zero dashboard deps, lazy-loaded.

## New reusable components

Channel glyph set · `AiStateChip` (named states) · notification tray · pastel `StatusPill` · activity timeline. Virtualize the thread list past ~50 threads (defer until needed).

## Data (migration 0003)

`contacts`, `conversations`, `messages` (channel, direction, ai_handled), `appointments`, `notes` or timeline events — per MASTER_PLAN §8, RLS per org, same conventions as 0001/0002. FrontDesk replies route via `runTextJob('customer_reply')` (Claude Haiku per §5) with `ai_replies` metering; customer PII never to free tiers.

## Acceptance

DESIGN_SYSTEM checklist + status never color-alone + AI state always icon+text + toasts announced + demo mode fully functional (canned threads/contacts).
