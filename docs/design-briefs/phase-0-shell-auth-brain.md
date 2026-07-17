# Design Brief — Phase 0: App Shell, Auth, Business Brain, Admin

Synthesized from ui-researcher report (Linear, Attio, Vercel, shadcn blocks, Build UI). All values reference tokens in `globals.css` / `src/lib/motion.ts` — no magic numbers.

## App shell (`/(app)` layout)

- **Structure:** left sidebar (shadcn `sidebar` primitive) + main canvas. Sidebar bg = `--sidebar` (one step off canvas), 1px hairline right border (`--sidebar-border`).
- **Top:** business switcher row (org avatar + name + chevron → dropdown: switch business, business settings, sign out). Directly below: **"＋ Create" filled-primary pill** — the only saturated element in the sidebar.
- **Nav groups:** Command Center (standalone) · group label "WORKSPACE": Content Studio, Calendar, Inbox, Contacts, Analytics, Growth · pinned bottom: Settings/Brain row + user menu.
- **Dimmed chrome:** nav rows use `text-sidebar-foreground/70`; icon+label go full-contrast on hover/active. Active state = soft translucent pill (`bg-sidebar-accent`) rendered as a single `<motion.div layoutId="active-nav-pill">` behind the row, spring stiffness 380 / damping 30. No hard borders, no saturated fills.
- **Collapse:** icon-only rail; labels fade (opacity + width), tooltip shows label.
- **Header bar in canvas:** breadcrumb + page actions, hairline bottom border, sticky.

## Auth (`/login`)

- Centered card (max-w-sm) over a **CSS-only aurora**: 4 layered blurred radial gradients (brand indigo-violet, a deeper violet, hint of teal `--chart-2`), animating `background-position` on a ~12s ease-in-out loop; static under `prefers-reduced-motion`.
- **Magic-link-first:** single email input + primary button; password sign-in as a secondary link/tab. Wordmark above card, one quiet sentence of copy. Success state: spring-scale mail icon + "check your inbox".
- Demo mode (Supabase unconfigured): show a subtle "demo mode" badge and an "Explore the demo" button that enters the app with the demo org.

## Business Brain wizard (`/brain` first-run + Settings section)

- **Sectioned wizard, not per-field:** Basics → Hours & Services → Voice & Brand → Channels. Top: thin progress bar + step pills (completed = check, current = brand fill).
- Progressive disclosure inside sections ("add another service" reveals rows). "Skip for now" per section — never blocks reaching dashboard.
- Completion: spring-scale checkmark + short copy. No confetti.

## Command Center + Admin (stat surfaces)

- **StatCard** (reusable): 12px uppercase-tracked muted label → large `tabular-nums` value → delta chip (rounded-full, `--success`/`--destructive` at 10% bg) → optional axis-less sparkline (gradient fill). Entrance: stagger 50ms, fade + y-8.
- Empty states: monochrome line illustration (`aria-hidden`) + headline + one-line context + single primary CTA.

## Motion rules (all surfaces)

- Route content: fade + y-8, 200–250ms ease-out via `AnimatePresence mode="wait"`.
- Hover lift on interactive cards: `whileHover={{ y: -2 }}` spring(300/20) + Tailwind `transition-shadow` (never animate box-shadow in Framer).
- Gradient/glow accents ONLY on: auth aurora, onboarding, empty states, Command Center hero. Nowhere else.
- Everything checks `useReducedMotion` / the global CSS guard.

## Acceptance criteria (per DESIGN_SYSTEM checklist)

Tokens only · all interactive states designed · light+dark AA · keyboard accessible + ARIA · responsive (sidebar → sheet on mobile) · reduced-motion safe · reads as one family.
