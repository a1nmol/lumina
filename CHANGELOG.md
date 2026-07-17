# CHANGELOG — LocalOS

Fable adds one line here after each feature is fully built + reviewed. Newest on top.

## Unreleased
- Phase 0: App shell (sidebar with business switcher, sliding active-pill nav, ＋ Create), aurora login (magic-link-first, demo mode), Command Center with StatCards + sparklines, crafted empty states for all workspace pages; reviewed + a11y fixes (native-button semantics, reduced-motion safe).
- Phase 0: Security review fixes — entitlements writes locked to service role (spend-cap self-escalation closed), collision-proof signup bootstrap with `ensureOrgBootstrap` repair path, fail-closed usage metering, RLS hardening, Supabase session-refresh proxy.
- Phase 0: Supabase data foundation — orgs/members/plans/entitlements/usage_events/business_brain schema with per-org RLS, usage metering + spend guard, demo-safe clients, Sunrise Bakery demo data.
- Setup: Next.js 16 + Tailwind v4 + shadcn/ui (28 components) + Framer Motion + Supabase clients; LocalOS design tokens (brand indigo-violet, semantic + dataviz palettes, shadows, motion tokens, dark-mode-first).
- Project initialized: master plan, design system, and Fable-led agent team configured.
