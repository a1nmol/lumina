# Next Wave — Owner feedback worklist (APPROVED, execute in full)

Distilled from the owner's voice note (2026-07-23). Wave interrupted by session limit — resume all tracks. Landing page only; all quality gates as usual (tokens, AA, reduced-motion, tsc/lint/build, browser verify).

## Track A — Hover/scroll hint sync (wick-guide.tsx) [was mid-launch]
Bugs: wrong element's hint shows; sometimes nothing shows. Fix: re-derive hint from hoverElRef at timer fire (no stale capture); entering a new [data-wick-hint] target cancels old dwell+restore immediately; stillness gate must RETRY (200ms × ~5) instead of silently dropping when user hovered right after scrolling; pointerout ignores child-to-child moves (relatedTarget within same target = no-op); A→B direct moves never flash the section line between. Dwell 300ms. Dev-only data-attr exposing current hint source for testing.

## Track B — Problem section + hero phone clarity [was mid-launch]
- problem.tsx → cause→consequence 3-beat evening timeline (staggered whileInView):
  ① 6:02 PM — door card flips to CLOSED, "You lock up."
  ② 7:41 PM / 9:12 PM — missed call card (PhoneMissed, fades to "Missed") + DM card ("Do you do birthday cakes for Saturday?" → "No reply").
  ③ NEXT MORNING — consequence card, tilted/muted: "They booked with the bakery across town." + other shop's light on.
  Then existing 62% stat as the generalization. Grid on desktop, stack mobile.
- hero-phone.tsx polish: scale to max-w 340, refined bezel + notch, header "Lumına · Front desk / answering for Sunrise Bakery" + pulsing live-dot, customer bubbles LEFT muted / Lumina replies RIGHT indigo + AI chip (match in-app inbox convention), missed-call banner two-line with icon ring, calendar chip → mini event card (CalendarCheck ring, "Cake pickup — Sat 10:00 AM", "Added to calendar"), faint status bar (9:41 PM). AA-verify new pairs.

## Track C — Lamps show the jobs + outcome cards metaphor + pilot menu presence
- lamps.tsx: under each streetlamp, a looping mini-demo vignette (~3s, IO-paused, reduced-motion static): ① Gets you seen — tiny post card slides up + heart/reach ticks; ② Never misses — mini chat Q ("Open Sunday?") auto-answered with AI chip; ③ Shows what worked — tiny thread draws from a post chip to a booking chip. Real components, small.
- outcome-cards.tsx: replace static awning cards. Chosen metaphor (fits OUR world, not sticky notes): **lit shop-window displays** — each card is a shop window; on hover/tap the window light flicks on (amber wash) and the interior micro-scene animates (booked = calendar slots filling; known = tiny feed cards rising; evenings = door sign flipping to CLOSED at 5:59 while messages keep getting answered below). Touch: first tap lights, second follows link (or light on in-view on mobile).
- pilot-menu.tsx: bigger presence (max-w ~2xl), storytelling: menu-board header with hand-drawn underline, 3 menu "items" with icons (Everything on the house / No card, no contract / Limited seats per city) each with a one-line description + price column showing "$0", Wick-glow accent, form below unchanged but roomier. Keep chalkboard-dark card on light band.

## Track D — Loop board comprehension + rich shop-picker verticals + shop windows aliveness
- loop-board.tsx: make it self-explanatory without reading: add a 3-step legend strip above the board (① You post → ② They see it → ③ They book — small icons); animate on view: post polaroid pulses → string draws toward customer chips → each chip lands with its outcome label ("Booked Sat pickup", "Called about catering") → a small till/receipt chip counts up "+3 customers". Keep hover per-post highlighting. One-line sub under H2 stays.
- shop-examples.ts + shop-picker consumers: per-vertical RICH payload (bakery/salon/plumber/café): { sampleCaption (real 1-2 sentence post), customerQ, aiAnswer (specific, from that trade's world), bookedOutcome ("Sat 10:00 cake pickup booked"), weekResult ("This week: 3 posts → 5 inquiries → 2 bookings") } — picker switch updates a mini showcase card trio (post preview / Q&A bubble pair / result chip), not just labels.
- shop-windows.tsx: alive pass — window glow flickers on softly as each enters view, hover brightens + reveals "Your shop here?" on the dimmed placeholders.

## Track E — THE STREET (signature illustrated strip) [research then build]
Owner's concept, approved: replace abstract silhouettes (final-cta vignette + footer strip + hero line-art evolution) with **one reusable illustrated Main Street row** (flat/linear SVG, not 3D, not a new section):
- 5-7 distinct storefronts left→right (bakery, salon, plumber, café, florist…), each with name sign + type details.
- Every OTHER store visibly lacking (visual-only, no text needed): CLOSED sign + a waiting customer silhouette with ✕; phone with missed-call badge ✕; dead social feed icon (no posts); tangled/blank calendar; "closed 6 PM" while DM bubbles queue.
- CENTER store outshines: glowing warm+indigo, neat, OPEN 24/7 sign, green check badges on the exact gaps others lack (posts ✓ replies ✓ bookings ✓), tidy awning — and a permanent (non-dismissible, part of the art) Wick-style bubble above it: **"We use Lumina."**
- Day/dusk variants via tokens so it works on light sections (line-art + selective glow) and the dark final-cta vignette.
- Use at: final-cta (replaces confusing dark vignette — the street IS the visual story + CTA below), footer (compact variant), hero bottom (existing line variant upgraded with the lacking/outshining storytelling, subtler).
- Research first (ui-researcher): illustrated storefront/street rows in award landing pages, flat SVG city illustration techniques, visual-negation iconography (✕ badges) done tastefully.

## Also noted (owner)
- Shop windows = future real testimonials: correct interpretation, keep honest placeholders.
- FAQ good as-is. Scroll story good as-is now.
