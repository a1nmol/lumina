# START HERE — Let Claude Code build it while you watch

You want to just observe: open Claude Code, paste one prompt, and it does the whole setup and build itself — only asking you for API keys. This file is that. Three steps.

---

## Step 1 — Get the kit onto your computer

1. Unzip **localos-starter.zip** into a folder, e.g. `~/Projects/localos`.
2. That folder now has: `CLAUDE.md`, `MASTER_PLAN.md`, `DESIGN_SYSTEM.md`, `START_HERE.md`, `.env.example`, and a hidden `.claude/` folder (the agent team + settings). Nothing else is needed — Claude builds the rest.

You only need two things installed first (Claude can't install these for itself):
- **Node.js 20+** — https://nodejs.org
- **Claude Code v2.1.170+** — the app you already have, or `npm install -g @anthropic-ai/claude-code` (run `claude --version` to check; update if older, so the `fable` model works).

## Step 2 — Open the folder in Claude Code and turn on autonomous mode

1. Open Claude Code **in that folder** (in the app, open the `localos` folder as your project; or in a terminal: `cd ~/Projects/localos && claude`).
2. It auto-loads `CLAUDE.md` + the plan, so it starts fully briefed. Confirm the model shows **fable** (settings set this; if not, type `/model fable`).
3. **Turn on auto-accept** so it doesn't stop for permission on every action: press **Shift+Tab** to cycle the mode until it shows **auto-accept edits** (a.k.a. "auto" / "accept edits"). This is what lets it run and lets you just watch. (The `.claude/settings.json` already pre-approves the safe commands and blocks dangerous ones like `rm -rf` and `git push`.)

That's it for setup. Now the prompt.

## Step 3 — Paste this kickoff prompt

Copy everything between the lines into Claude Code and hit enter. Then sit back.

---
```
You are Fable, the lead on this project. Read CLAUDE.md, MASTER_PLAN.md, and DESIGN_SYSTEM.md fully first.

Then do EVERYTHING yourself, autonomously, without waiting for me to approve each step. I am only observing. Specifically:

1. Set up the whole project in this folder yourself: initialize the Next.js (App Router, TypeScript, Tailwind, src dir) app here, install and configure shadcn/ui, Framer Motion, Lucide, and the Supabase client libraries. Set up the design-system tokens from DESIGN_SYSTEM.md. Create .env.local from .env.example. Initialize git and make commits as you go.

2. Then build the product in strict phase order from MASTER_PLAN.md, starting with Phase 0, then Phase 1, and keep going. For every feature: do design research first (best-in-class, tasteful, animated, professional UI), write a short design brief, delegate the coding to your worker agents (builder for real code, quick-worker for mechanical tasks), review with the reviewer agent, verify it builds and works, log it in CHANGELOG.md, and move straight to the next feature. Don't stop to ask "should I continue" — just continue.

3. The ONLY reasons to pause and ask me:
   - You need an API key or account login I have to provide (Supabase, OpenRouter, fal.ai, etc.). When you hit these, batch them: tell me exactly which keys you need and where to get each, and keep building everything that doesn't need them in the meantime.
   - A genuinely destructive or real-money action (deleting data, dropping tables, git push, deploying, spending money).

4. If you can drive my Chrome to sign up for a service or grab a key, try that first before asking me. Fix your own errors; retry before surfacing problems.

Start now: confirm you've read the plan in 3-4 lines, then begin the full setup and keep building. Run the dev server when Phase 1 is viewable and tell me the localhost URL so I can watch it come alive.
```
---

## What happens next (what you'll see)

- Claude reads the plan, scaffolds the app, installs everything, and starts building screens — designing each one first, then coding via its cheaper worker agents to save tokens.
- At some point it will stop **once** and say something like: *"I need these keys to continue: Supabase URL + anon key (get them at supabase.com → your project → Settings → API), OpenRouter key (openrouter.ai/keys), fal.ai key (fal.ai/dashboard)."* Paste them into `.env.local` (or hand them to Claude) and say "continue."
- It resumes and keeps going through the phases. Run `npm run dev` (or it will) and open `http://localhost:3000` to watch it take shape.

## The few keys you'll likely be asked for (so you can pre-make them)

All have free tiers; making these now means Claude never has to stop:
- **Supabase** — supabase.com → new project → Settings ▸ API (URL, anon key, service_role key).
- **OpenRouter** — openrouter.ai → Keys (one key = all text models).
- **fal.ai** — fal.ai → dashboard (images/video).
- Later only: Google AI Studio, Groq, Cerebras (free LLM tiers), Anthropic (Claude Haiku), Ayrshare, Twilio, Resend.

## If it ever stalls or drifts

- Drifts off-plan → say: "Reread MASTER_PLAN.md and stay in phase order."
- Stops too often for permission → make sure auto-accept mode is on (Shift+Tab).
- A worker writes weak code → say: "Route that to the builder agent (sonnet), not quick-worker."
- `fable` not available → update Claude Code; temporarily `/model opus` for the lead.

You don't have to do the work — just keep it fed with keys and watch.
