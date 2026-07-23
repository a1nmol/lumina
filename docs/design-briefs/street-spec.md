# The Street — build spec (Track E, research-grounded)

Extend `street-silhouette.tsx` with a `variant="main-street"` (NOT a new component) so hero/footer/final-cta stay one family. Full research rationale lives in the wave transcript; the operative rules:

## Craft rules (non-negotiable)
- One stroke system: 1.5px silhouettes · 1px features · 0.75px detail. Rect/polyline/text primitives only (no freehand paths, no images). Whole SVG ≤ ~40KB.
- **Single color differential**: every shop is flat ink line-art; the ONLY color/glow in the scene belongs to the center shop (amber + a hint of indigo). Negation cues use muted ink / desaturation — never a second accent hue, never whole-building graying.
- Max ONE negation cue per lacking shop (✕ chip 16-20px low-sat + optionally one dimmed prop). Administrative, not sad.
- Selective detail: each shop gets ONE identifying prop (sign glyph), not full trade detail.

## Composition — 7 shops, center = #4
1. Bakery — CLOSED door sign (muted ink, no buzz)
2. Salon — waiting customer silhouette at door + ✕ chip
3. Plumber — phone glyph + missed-call ✕ chip above sign
4. **Café — THE Lumina shop**: layered drop-shadow glow on the sign (reuse .sign-buzz full), low-opacity radial amber wash rect behind (color-mix pattern from globals ~line 408), OPEN 24/7 text sign, tidy LineAwning, three tiny green ✓ chips above awning (posts/replies/bookings), and a permanent **SignBubble** above the roofline: "We use Lumina." (tail pointing down at the shop)
5. Florist — dead feed glyph (dashed ghost card, no posts)
6. Barber — blank calendar grid outline
7. Hardware — "closed 6 PM" ink sign + 2 empty speech-bubble outlines queued at the door

## New primitives
- `SignBubble`: sibling of wick-bubble's visual DNA (rect rx, card/border fills, rotated-square tail pointing DOWN), non-dismissible, no typing; enters once via ScrollReveal-style fade/rise. Real `<text>`, ≤3 words.
- Negation ✕ chip + green ✓ chip glyphs (tiny inline SVG paths, not Lucide imports inside the SVG).

## Deployment (three depths, same composition data)
- **final-cta.tsx**: REPLACE the current dusk vignette card with the full main-street render inside the existing `.dusk-section` scene-lock — the street becomes the visual argument; CTA copy + flame button below unchanged.
- **hero bottom**: keep `variant="line"` subtle — adopt the 7-shop prop asymmetry but NO negation chips, NO center glow beyond the existing OPEN sign.
- **footer.tsx** `FooterSkylineStrip`: add 1-2 ✕ micro-marks and make the center building's lit dot brighter/larger. No text at that scale.

## Glow technique
Layered `drop-shadow()` (existing sign-buzz pattern, 2-3 passes increasing blur/decreasing opacity) + ONE radial-gradient wash rect at 8-12% opacity. NO feGaussianBlur regions, NO mix-blend-mode.

## Accessibility
Whole street `aria-hidden`; one adjacent `sr-only` paragraph: "Illustration: a row of shops on Main Street. Every shop except one is missing something — a closed sign, a missed call, an empty feed, a blank calendar. The centre shop, lit warm and glowing with a sign reading 'We use Lumina', has posts, replies, and bookings all handled."
