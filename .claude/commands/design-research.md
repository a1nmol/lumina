---
description: Deep best-in-class UI/UX reference research + a design brief, before building any component.
---

Before we build **$ARGUMENTS**, do design research and produce a Design Brief. Do NOT write app code yet.

1. Delegate to the **ui-researcher** subagent to gather best-in-class references for `$ARGUMENTS`: layout, card design, hover/focus micro-interactions, smooth transitions, tasteful 3D/animated accents, icons/SVGs, empty/loading/error states, dark mode. Award-quality, but usable, accessible, and performant.
2. Synthesize the report (as Fable) into a concise **Design Brief** for `$ARGUMENTS`:
   - Layout & information hierarchy (with a quick ASCII wireframe).
   - Components to use/build (map to shadcn/ui + our design system; note what to reuse).
   - Motion spec (what animates, durations/easing, reduced-motion behavior).
   - All states to implement (default/hover/focus/active/disabled/loading/empty/error).
   - Design tokens used (color/type/spacing/radius/shadow/motion).
   - Any "wow" moment and how to keep it fast + accessible.
3. Confirm the brief matches DESIGN_SYSTEM.md and MASTER_PLAN.md scope, then proceed to build to it (no approval wait). Only pause if the brief reveals a scope decision that isn't covered by the plan.
