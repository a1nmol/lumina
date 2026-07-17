# LocalOS

All-in-one AI platform for local small businesses: **Content Engine** (create + schedule + reminder-to-post) + **FrontDesk Agent** (calls, SMS, email, DMs, leads, booking), joined by one **Analytics loop**. Built with a Fable-led Claude Code agent team.

## Start here
1. Read **SETUP.md** — installs everything and starts the Fable-led build.
2. **MASTER_PLAN.md** — the source of truth (scope, features, models, phases). Do not deviate without updating it.
3. **DESIGN_SYSTEM.md** — the design bible (quality bar, tokens, checklist).
4. **CLAUDE.md** — auto-loaded project memory; defines the team + workflow.

## The team (Claude Code)
- **Fable** (main session) — lead: research, design direction, orchestration.
- **ui-researcher** (sonnet) — best-in-class UI references.
- **builder** (sonnet) — feature/component implementation.
- **quick-worker** (haiku) — cheap mechanical tasks.
- **reviewer** (sonnet) — correctness/security/a11y/design review.

## Commands
- `/design-research <thing>` — references + design brief before building UI.
- `/build-feature <feature>` — full anchor→research→plan→delegate→review→verify→record workflow.

## Stack
Next.js + TypeScript + Tailwind + shadcn/ui + Framer Motion + Lucide · Supabase · OpenRouter (LLM routing) · fal.ai + FFmpeg · Ayrshare · Twilio · Resend · Stripe (later).

## Status
Pre-build. Ethos: ship fast, iterate continuously, no fixed deadline. See CHANGELOG.md.
