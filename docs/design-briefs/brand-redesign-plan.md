# Lumina Brand & Site Redesign — Master Plan

Synthesized from dual research (Lens A: award-tier craft — Linear, Clerk, Stripe, Apple, Rive, Lusion · Lens B: what converts local-SMB owners — Podium, Housecall Pro, Jobber, Durable, Booksy). Owner-approved direction pending. This document governs the landing page + dashboard restyle.

---

## 1. What the site IS (the answer everything hangs on)

Lumina is **the shop that never closes**. The owner locks the door at 6pm; Lumina keeps the lights on — answers the 9pm "do you do birthday cakes?" DM, posts tomorrow's special, fills Thursday's calendar, and hands the owner a receipt of what happened overnight.

**We do not sell software. We sell "your business, always open."**

The buyer: a bakery/salon/plumbing owner — busy, phone-first, allergic to tech-speak, skeptical of AI. Every design and copy decision must survive the question: *"Would the owner covered in flour at 6am get this in one glance?"*

## 2. Theme: MAIN STREET AT DUSK

The golden hour when shop lights flick on against a deep indigo evening sky. It is ownable, warm-but-electric, and it literally explains the product: **warm light = the human business · indigo glow = the AI working the night shift.** Our dashboard is already electric indigo — the landing page is the street outside the same world.

**Narrative spine: ONE DAY ON MAIN STREET.** The landing page scrolls through a day at the visitor's shop — morning bake → busy noon → 6pm close → the indigo hours (Lumina working) → dawn receipt ("while you slept: 3 bookings"). Scroll = time. Every section metaphor slots into a time of day, so the page tells the story even with the copy turned off.

## 3. Palette — "Daylight & Dusk" (two registers, one world)

Research verdicts honored: the category drowns in sky-blue/white (avoid); warm-cream + one confident non-blue accent converts this buyer (Mailchimp/Claude lane); amber must be *glow, not surface* (AA contrast); dark sections reuse existing app tokens for continuity.

**Daylight register (landing light sections + app light mode, retuned):**
- `--paper`: warm cream `oklch(0.97 0.015 85)` — body surface (never pure white)
- `--ink`: deep espresso `oklch(0.24 0.03 60)` — body text (AA on paper)
- `--awning`: soft peach-sand tint `oklch(0.93 0.03 70)` — cards/alt sections
- **CTA flame**: terracotta-amber `oklch(0.66 0.16 55)` — buttons/decisive moments in light sections ONLY
- Amber glow `oklch(0.78 0.14 80)` — icon strokes, gradient stops, mascot light, badges. NEVER body text, never large fills.

**Dusk register (hero, night sections, dashboard dark mode — EXISTING tokens):**
- Indigo-violet primary `oklch(0.68 0.17 277)`, dark base `oklch(0.135 0.008 277)`, chart hues as-is. The brand thread across both registers is the electric indigo; it appears in daylight sections as the "AI presence" color (chat bubbles, glows, the firefly's trail).

**The signature gradient** (Stripe-style single-shader plane, reused landing hero + app loading/empty states): dusk sweep `indigo 277 → violet → amber 80` with simplex-noise drift. One shader, near-zero geometry cost, our visual watermark.

## 4. Mascot: **WICK the firefly** 🪰✨

A firefly: tiny, glows after dark, works while everyone sleeps — the product thesis as a creature. Warm amber body-light, faint indigo wing-trail (both brand registers in one character). Name "Wick" (candle wick — keeps the light going; short, warm, ownable).

- **Build**: Rive state machine, rigged ONCE — states: idle-hover, curious (tilts toward input), thinking (light pulses), celebrating (loop-de-loop + sparkle trail), sleeping (dim pulse), oops (light flickers). Driven by real app events.
- **Deploy at emotional edges ONLY** (Duolingo/Mailchimp/GitHub rule): empty states, onboarding steps, form nudges, success/celebration toasts, 404, "reminders enabled", first-lead-captured moment, landing-page guide (flies down the page with scroll, perches near section titles).
- **NEVER in**: pricing/billing, settings, dense tables, security, error-recovery for real failures. Whimsy near money erodes trust.
- Reduced-motion: static Wick with a soft CSS glow, no flight.

## 5. Landing page — section by section (each with a meaning-carrying device)

Order per conversion research; every device tells the product story by itself.

1. **NAV** — cream bar; logo wordmark with a tiny amber light dot over the "O" (the shop light). Sticky; gains a soft awning shadow on scroll.
2. **HERO — "The cover" (dusk)**: pinned layered scene — a stylized storefront at dusk (CSS/parallax layers + shader sky, NO WebGL geometry), OPEN sign flickering on in amber neon. In front: a real phone mockup playing our **signature 4s loop**: missed call → Lumina auto-text → reply → calendar slot fills (real UI components, Clerk-style, not screenshots). Headline: **"The shop that never closes."** Sub: "Lumina writes your posts, answers your customers, and books your jobs — even at 9pm." One CTA: "Get early access". Wick drifts in, lands on the OPEN sign, lights it.
3. **TRUST BAR** — "Built for main street" chips (bakery/salon/plumber/café icons) + pilot framing ("Free for invited local businesses"); rating badges slot in here once they exist.
4. **PROBLEM — "6:02 PM" (day fades)**: split scene: owner flips sign to CLOSED; phone on the counter lights up with 3 missed things (call, DM, review). Copy names the fear (Durable's trick): "You can't answer at 9pm. So that customer books somewhere that does." One visceral stat as a big number.
5. **HOW IT WORKS — 3 lamps** (plain-English pillars, Jobber's trick): "Gets you seen" (posts) · "Never misses a customer" (front desk) · "Shows what worked" (loop). Each pillar is a streetlamp that lights as it scrolls in; no AI jargon anywhere.
6. **THE DAY STRIP — pinned scroll story (the centerpiece)**: one pinned scene, scroll scrubs the sky gradient dawn→noon→dusk→night→dawn while vignettes swap:
   - **7 AM — the menu board writes itself**: chalkboard texture; AI caption "chalk-writes" on (Content Studio).
   - **12 PM — the ticket rail**: order tickets slide along a kitchen rail = queue/calendar; one drags itself to Thursday (drag-drop calendar).
   - **6 PM — the shop bell**: door bell dings, chat bubbles queue at the door; Lumina answers each; one escalates to the owner's phone with a soft "needs you" glow (FrontDesk + transparency states).
   - **11 PM — the indigo hours**: the scene *becomes our dashboard's dark UI* — the actual inbox thread of the 9pm DM, AI reply visible. Landing and app fuse in one scroll moment.
   - **6:45 AM — the receipt**: a receipt prints from the top of the viewport: "While you slept — 2 leads · 1 booking · 1 five-star review." Tear-off animation. (Analytics + the morning-report emotion.)
7. **THE LOOP BOARD** — corkboard with polaroid posts and customer cards connected by glowing indigo string (string-and-pin = our linked-pair Loop visual, same device as the dashboard). Hover a post → its strings light to the customers it brought. Copy: "The first tool that shows which post rang the till."
8. **FEATURES BY OUTCOME** — three awning-striped cards (Get booked / Get known / Get time back), each opening with a real embedded component demo (composer generating, inbox replying, calendar filling).
9. **PICK YOUR SHOP** — vertical selector tabs (Bakery/Salon/Plumber/Café — Booksy's trick): switching swaps every mockup's content, stats, and Wick's perch. Proves "made for you."
10. **SHOP WINDOWS (testimonials)** — a row of lit shop windows at night; each window is a testimonial card with owner name + one number ("+22 bookings in March"). Placeholder-honest until real pilots exist.
11. **EARLY ACCESS (pricing slot)** — a hand-painted **menu board**: "Pilot menu — Free. No card. No contract. Limited seats for [city]." Single form: business name + email. (Research: early-access card beats plan grids in invite phase.)
12. **FAQ — the flip signs**: owner-voiced questions on OPEN/CLOSED flip signs that rotate to reveal answers: "Will customers know it's AI?" · "What if it doesn't know the answer?" (it flags you — never invents) · "Do I keep my phone number?" · "How much work is setup?" (10 minutes, the wizard).
13. **FINAL CTA — "Lights on?"**: full dusk scene, every window on the street dark except yours. Neon sign buzzes on: "Your lights, always on." CTA + Wick lands on the button. Footer = street silhouette at night, amber windows as link dots.

**Micro-signatures (site-wide glue):** toasts print like receipts (already have receipt motif in analytics) · scroll progress = a streetlamp wire lighting along the page edge · section headers get a tiny time-of-day stamp ("7:00 AM") · selection/focus glow = warm amber in light, indigo in dark.

## 6. Motion & 3D strategy (craft with a budget)

- **Primary technique: CSS/Framer scroll choreography** (Linear/Clerk prove the award bar without WebGL). Pinned scenes via position sticky + scroll-linked transforms; spring physics from our motion tokens.
- **One shader, everywhere**: the dusk gradient plane (Stripe-style) — hero sky + app loading/empty states. That's our only always-on WebGL, and it's geometry-free.
- **Rive for Wick** (WASM canvas, mobile-cheap). No Lottie sprawl, no Spline embeds in production.
- **R3F reserved**: only if the hero storefront later graduates to true 3D; v1 is layered parallax. If built: lazy-mounted behind a poster after LCP, IntersectionObserver-gated, density gated on hardwareConcurrency.
- **Hard budgets**: LCP < 2.5s, INP < 200ms, CLS < 0.1; every scene has a reduced-motion static composition (not a blank).
- **Clerk's continuity trick**: all product "screenshots" on the landing page are REAL rendered components from our design system.

## 7. Dashboard translation (same world, still Linear-calm)

- **Dark mode = the indigo hours** (unchanged tokens — it already is the night register).
- **Light mode retunes to Daylight**: backgrounds shift from blue-white to warm paper/cream tints, ink text espresso-warmed. Same structure, warmer soul. (Token-level change only.)
- Dusk shader gradient appears in: app loading states, empty-state backdrops, the login aurora (replace current aurora with the signature shader).
- Wick appears at edges: first-run empty states, "reminders enabled 🎉", first lead captured, 404 — never in tables/settings/admin.
- Receipts as a motif: analytics export, "while you were away" digest card on Command Center.
- Everything else (spacing, radii, shadows, component family, motion tokens) stays — the restraint IS the brand in-app.

## 8. Copy voice rules

Outcome-first, owner-vocabulary, zero jargon. Banned words on the landing page: *agentic, AI-powered platform, operating system, unified, leverage, seamless*. The AI speaks first-person and humble ("I couldn't answer this — flagging it for you"). Every claim carries a number or a demo. Name the reader: "for bakers, barbers, and the people who fix sinks."

## 9. Implementation roadmap (each gate = build → review → verify → commit)

1. **Tokens & primitives**: add daylight register + flame CTA + shader gradient component + receipt/toast restyle. Retune light mode.
2. **Landing skeleton**: `/` marketing page (signed-out) with all 13 sections in final order, real copy, static compositions — converts before it dazzles.
3. **Signature scenes**: hero phone loop → day-strip pinned story → loop board → flip-sign FAQ (one at a time, each reviewed).
4. **Wick**: Rive rig + landing appearances + 3 app edge-moments.
5. **Dashboard infusion**: login shader, empty states, digest receipt, light-mode retune.
6. **Polish pass**: perf audit vs budgets, a11y sweep, reduced-motion audit, copy read-aloud test.

## 10. Open decisions for the owner

1. Approve theme "Main Street at Dusk" + day-arc landing story.
2. Approve Wick the firefly (alternates considered: night-shift owl — Duolingo-adjacent risk; corgi concierge — charming but says nothing about "always on").
3. Approve palette registers (daylight cream/espresso/flame + existing dusk indigo).
4. Hero v1 ships as layered-parallax CSS scene (upgradeable to R3F later) — approve.
