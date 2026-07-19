# Design Brief — Phase 3: Analytics Loop + Reviews

Synthesized from ui-researcher report (Triple Whale/HubSpot pairing, Plausible/Fathom restraint, shadcn chart blocks, Birdeye reviews). Tokens/motion from `globals.css` + `src/lib/motion.ts`. Recharts is approved (already a planned dep); charts client-only.

## The Loop (signature moment — `/analytics`, "Loop" tab)

**Linked Card Pair + animated thread. NOT a Sankey** (sparse per-post links would look empty; no new deps).

- Left: **source card** — post thumbnail (gradient/real), platform glyph, caption snippet, publish date, reach/likes sparkline.
- Right: **outcome chip stack** — one chip per call/lead/booking: channel glyph, contact name, timestamp + **"3h after post" time-delta badge** (the credibility maker — always show the delta, never a bare count).
- Connector: single SVG bezier thread (`--chart-1`, ~1.5px, 40% opacity), draw-in via animated stroke-dashoffset (Framer, ~duration.slow, ease-out; static under reduced motion). Hover/focus a pair → thread thickens + both ends highlight together.
- Attribution transparency: small icon+text caption ("matched by booking within 24h of post") — AiStateChip convention, never a bare score.
- Layout: reverse-chron feed of pairs; roll-up stat strip above ("This week: 4 posts drove 11 leads") using StatCards.

## Analytics dashboard (`/analytics`, default tab)

- Primitive everywhere: **big tabular-nums number + delta pill (success/destructive) + muted sparkline**, one accent color only.
- Time range: segmented control (Today · 7d · 30d) top-right in PageHeader, persisted in URL query param.
- Per-post metric cards: max 3 numbers on the face (reach, engagement, clicks) + loop-outcome count; everything else in a drawer.
- Charts: Recharts area/bar with `var(--color-chart-*)` fills, `useId()`-prefixed gradient defs, custom tooltip styled with card/popover tokens, `"use client"` + mounted gate (no SSR 0-width flash).

## AI insights

Dismissible banner at top of Analytics (and Command Center later): `Sparkles` icon + ONE specific numeric sentence ("Tuesday posts get 2× more calls") + ONE CTA ("Make more Tuesday posts" → /studio prefilled). Brand-violet left accent bar, fade/slide ~250ms, dismissal remembered (localStorage day-key). One at a time, queue the rest. Never generic praise.

## Reviews (`/growth` reviews section or `/analytics` Reviews tab → decide: **Growth page becomes Reviews + widget home**)

- List rows: star rating + platform glyph + reviewer + snippet + sentiment text tag (success/secondary/destructive — text+color, mirrors StatusPill).
- Reply flow: REUSE the inbox AI-draft pattern verbatim (prefilled draft, indigo left border, Send/Edit/Regenerate/Discard).
- Auto-publish rule: Business Brain setting — auto-send AI replies for 4–5★, manual approval for 1–3★ (toggle + threshold).
- Review generation: simple 3-step wizard (channel: SMS/QR/link → preview message → send/print), reusing the Brain wizard shell pattern. Separate action, not mixed into the list.

## Data (demo-first; Ayrshare wiring needs keys)

Demo: derive loop pairs from DEMO content items ↔ DEMO conversations/appointments with plausible timestamps; DEMO_REVIEWS (~8, mixed ratings/sentiment). Live seam: analytics_events + reviews tables (migration 0004) + Ayrshare fetch TODO. Insights: computed rule-based from demo data now (real analysis later) — but honest copy (computed from the visible data).

## Acceptance

DESIGN_SYSTEM checklist + thread animation reduced-motion-safe + charts keyboard/AA (values available as text) + no wall-of-numbers (3 max per card face).
