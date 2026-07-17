# SETUP — Get the Fable-led LocalOS build running (step by step)

This sets up Claude Code so **Fable is the lead** (research + design + orchestration) and cheaper models (**Sonnet/Haiku**) do the coding to save tokens — all anchored to your saved plan so nothing drifts.

You do these steps once on your Mac. Total time ~30–45 min.

---

## What you're setting up (mental model)

```
  YOU  ──talk to──►  FABLE (main Claude Code session = the lead)
                         │  reads CLAUDE.md + MASTER_PLAN.md + DESIGN_SYSTEM.md every session
                         │  researches best UI, writes design brief, plans
                         ├─► ui-researcher (sonnet)   — finds best-in-class UI references
                         ├─► builder (sonnet)         — writes the real feature code
                         ├─► quick-worker (haiku)     — cheap mechanical tasks
                         └─► reviewer (sonnet)        — checks the code before Fable accepts
```

Only Fable (the top session) can spawn workers — that's why the lead runs on Fable, not a worker.

---

## Step 1 — Install the tools

1. **Node.js 20+** — https://nodejs.org (or `brew install node`).
2. **Claude Code** (needs **v2.1.170+** for the `fable` model):
   ```bash
   npm install -g @anthropic-ai/claude-code
   claude --version   # confirm 2.1.170 or newer; if older: npm update -g @anthropic-ai/claude-code
   ```
3. **FFmpeg** (for slideshow generation): `brew install ffmpeg`
4. **Git**: `brew install git` (if not already installed).

## Step 2 — Create the project folder and drop in this kit

1. Make a folder, e.g. `~/Projects/localos`.
2. Unzip the delivered **localos-starter.zip** into it. You should see: `CLAUDE.md`, `MASTER_PLAN.md`, `DESIGN_SYSTEM.md`, `SETUP.md`, `CHANGELOG.md`, `.env.example`, and a `.claude/` folder (settings, agents, commands).
   - Tip: `.claude` and `.env.example` are hidden files — in Finder press **Cmd+Shift+.** to show them, or just use the terminal.

## Step 3 — Initialize the Next.js app *inside* the same folder

From inside `~/Projects/localos`:

```bash
npx create-next-app@latest . --typescript --tailwind --app --eslint --src-dir --use-npm
```
- Say **yes** to overwrite nothing important; keep the `.claude/` and the `*.md` files (create-next-app won't delete them).
- Then add the UI + motion libraries:
```bash
npx shadcn@latest init          # pick defaults; enables shadcn/ui components
npm install framer-motion lucide-react
npm install @supabase/supabase-js @supabase/ssr
```
(3D is optional and added later when a screen needs it: `npm install three @react-three/fiber @react-three/drei`.)

## Step 4 — Set up accounts and keys (free tiers first)

Create these (all have free tiers to start):
- **Supabase** (database/auth) — https://supabase.com → new project.
- **OpenRouter** (one key → all text models) — https://openrouter.ai
- **fal.ai** (images/video) — https://fal.ai
- Optional now, needed later: **Google AI Studio** (free Gemini), **Groq** (free), **Cerebras** (1M tok/day free), **Anthropic** (Claude Haiku), **Ayrshare**, **Twilio**, **Resend**.

Then:
```bash
cp .env.example .env.local
```
Open `.env.local` and paste your keys. **Never commit this file** (it's already ignored). Add the same keys to Vercel later for deploy.

## Step 5 — Point Claude Code at Fable + the team

From inside the project folder:
```bash
claude
```
Then in the session:
- Run `/model fable` (the `.claude/settings.json` already sets this as default, but confirm it says fable).
- Type `/agents` to confirm **ui-researcher, builder, quick-worker, reviewer** are listed.
- Type `/memory` (or just start) to confirm `CLAUDE.md` loaded. It auto-imports `MASTER_PLAN.md` and `DESIGN_SYSTEM.md`, so Fable starts fully briefed and won't drift.

If `fable` isn't accepted, update Claude Code (Step 1.2). As a fallback the lead can run on `opus`; keep workers on sonnet/haiku.

## Step 6 — Kick off the build

Just talk to Fable. Good first messages:

- `Read the plan and confirm you understand the project, the phases, and your role. Then propose the exact task list for Phase 0.`
- After it confirms: `/build-feature Phase 0 foundation — repo structure, Supabase auth, orgs, entitlements + usage metering tables, admin skeleton, and the design system tokens.`
- Then: `/design-research Business Brain setup screen` → review the brief → let it build.
- Then walk down MASTER_PLAN §9 phase by phase: `/build-feature Content Studio Composer`, etc.

Fable will design-research first, delegate coding to the cheap workers, review, verify, and log each feature — one at a time, in order.

## Step 7 — Run it as you go

```bash
npm run dev     # http://localhost:3000
```
Commit often (`git add -A && git commit -m "..."`). Deploy to **Vercel** when Phase 1 is demo-able (connect the repo, add the env keys).

---

## Token-saving habits (so this stays cheap)

- Let **Fable delegate** — don't have the expensive lead write boilerplate. Mechanical work → `quick-worker` (haiku); real features → `builder` (sonnet). Fable does thinking/design/review synthesis.
- Keep sessions focused (one feature at a time). Use `/clear` between unrelated features so context stays small.
- The workers have their own context windows, so their file-searching and logs don't bloat Fable's context.
- In-app, the product itself uses the model router (MASTER_PLAN §5) so *your users'* usage is cheap too.

## If you get stuck

- `fable` not available → update Claude Code; temporarily use `opus` as lead.
- A worker produces weak code → tell Fable to route that task to `builder` (sonnet), not `quick-worker`.
- Don't let Fable jump phases — if it does, say "reread MASTER_PLAN.md and stay in phase order."
- Anything irreversible (dropping tables, spending, pushing) — Fable is instructed to ask you first. Keep it that way.

You're set. Open the folder, run `claude`, and tell Fable to read the plan and start Phase 0.
