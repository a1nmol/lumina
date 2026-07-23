# DESIGN_SYSTEM.md — Lumina design bible

Fable owns design quality. The bar: every screen looks like a **senior product designer with a futuristic, creative eye** built it — one coherent system, not a bag of parts. Beautiful *and* usable. Delightful motion, never janky or gratuitous.

## Principles

1. **Calm, confident layout** — Linear/Notion-level restraint. Generous whitespace, clear hierarchy, never cluttered. Content first; chrome recedes.
2. **One system** — every component (button, card, input, modal, chart) shares tokens and reads like family. Define tokens once; never hand-pick random values.
3. **Motion with meaning** — smooth micro-interactions on hover/press/focus, spring physics, tasteful enter/exit and layout transitions. 3D/animated accents ONLY where they elevate (hero, empty states, key data viz, onboarding) — never on every element.
4. **Accessible + dark-mode-first** — WCAG AA contrast, focus rings, keyboard nav, semantic HTML, ARIA where needed. All motion respects `prefers-reduced-motion`. Test light + dark.
5. **Fast** — animations 150–400ms, GPU-friendly (transform/opacity). Lazy-load heavy 3D. No layout thrash. Performance is part of "beautiful."
6. **Responsive** — designed mobile-first; works from phone to wide desktop.

## Design tokens (single source; wire into Tailwind theme)

- **Color:** a neutral gray scale + one brand primary + semantic (success/warn/danger/info). Light + dark variants. Charts follow the **dataviz** palette method (accessible categorical/sequential sets, consistent across light/dark).
- **Type:** one modern sans (e.g., Inter/Geist) + optional display face for headers; a clear type scale (12/14/16/20/24/32/48). Consistent line-heights.
- **Spacing:** 4px base scale (4/8/12/16/24/32/48/64).
- **Radius:** consistent set (e.g., 8/12/16/24, full for pills).
- **Shadow:** soft layered elevation set; subtle in light, glow-aware in dark.
- **Motion:** duration + easing tokens (e.g., fast 150ms, base 250ms, slow 400ms; ease-spring for interactive, ease-out for enter).

## Component quality checklist (every component must pass)

- [ ] Uses design tokens only (no magic numbers/hex).
- [ ] Hover, focus-visible, active, disabled, loading, empty, and error states all designed.
- [ ] Smooth, purposeful motion; respects reduced-motion.
- [ ] Works in light + dark; AA contrast.
- [ ] Keyboard accessible; correct semantics/ARIA.
- [ ] Responsive across breakpoints.
- [ ] Matches the Design Brief for this feature.

## Signature moments (where to spend the "wow")

- Onboarding / Business Brain setup — friendly, animated, progress-driven.
- Content Studio Composer — live phone-mockup preview with smooth format switching; delightful "generate" moment.
- Command Center — crafted stat cards with subtle motion; a tasteful hero/data accent (consider a light 3D or animated gradient).
- Analytics loop — the "this post made 3 customers" visualization should feel special.
- Empty states — never blank; illustrated/animated with a clear next action.

## Reference process

Before building UI, `/design-research` gathers current best-in-class references (award-quality sites, top component libraries, animation galleries) and returns a brief. Build to the brief. Reuse the growing component library; extend the system rather than reinventing.
