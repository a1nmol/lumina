---
description: Run the full LocalOS build workflow for a feature — anchor, design-research, plan, delegate, review, verify, record.
---

Build the feature: **$ARGUMENTS**. Follow the standing workflow in CLAUDE.md exactly.

1. **Anchor** — reread the relevant MASTER_PLAN.md section. Confirm this feature is in scope and in the correct phase order. If not, stop and ask the owner.
2. **Design research** — run the `/design-research` flow for any UI in this feature and produce the Design Brief, then build to it (no approval wait).
3. **Plan** — break `$ARGUMENTS` into small tasks with acceptance criteria. Decide per task: **builder** (real code) or **quick-worker** (mechanical). Note files to touch and design tokens/components to use.
4. **Delegate** — spawn the workers with precise specs + the Design Brief. Keep specs tight; one concern per task.
5. **Review** — run the **reviewer** subagent on the result. Fix all correctness/security/accessibility/design findings.
6. **Verify** — build, typecheck, and lint pass; UI matches the brief; light + dark; responsive; keyboard accessible; motion respects reduced-motion; cost rules followed (model routing, caps).
7. **Record** — update MASTER_PLAN.md status and add a CHANGELOG.md line. Do not start the next feature until this one is fully done.

Respect all hard rules in CLAUDE.md (phase order, cost discipline, security/RLS, ask-before-irreversible).
