# Lumina

[![CI](https://github.com/a1nmol/lumina/actions/workflows/ci.yml/badge.svg)](https://github.com/a1nmol/lumina/actions/workflows/ci.yml)

Everything a local business needs to get customers and never miss one — in one dashboard, run by AI, measured as one loop.

Lumina joins the two halves that every other tool sells separately:

- **Content Engine** (outbound) — AI writes and schedules posts, slideshows, and campaigns that bring customers in.
- **FrontDesk Agent** (inbound) — AI answers the calls, DMs, texts, and form-fills those posts generate; qualifies, books, and captures every lead into one inbox.
- **The loop** — analytics tie each post to the calls, leads, and bookings it produced, then tell you what to make next, in plain English.

Built local-first: review management, missed-call-to-text, booking, QR tools, and "just tell me what to post" — for bakers, barbers, and the people who fix sinks.

## Modules

| Module | What it does |
| --- | --- |
| Content Studio | Caption/hashtag/CTA generation, per-platform rewrites, photo slideshows, templates, "generate my week" |
| Publishing | Drag-drop calendar, queue, reminder-to-post flow |
| Unified Inbox | Comments, DMs, chat, SMS, and email in one thread list with AI-drafted replies |
| FrontDesk | Web chat widget, forms, SMS, missed-call-to-text, booking with reminders, instant lead alerts |
| Analytics | Per-post metrics, FrontDesk outcomes, loop metrics, AI insights |
| Growth | Review generation and management, QR tools, simple CRM |
| Platform | Multi-org accounts, per-account entitlements, usage limits and spend guard, admin dashboard |

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS · shadcn/ui · Framer Motion · Recharts · Supabase (Postgres, Auth, Storage, RLS) · OpenRouter model routing · fal.ai + FFmpeg for media · web-push.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in your keys (Supabase required; the rest are optional)
npm run dev
```

The app is demo-mode-first: it runs and builds with no keys at all, using seeded demo data, and lights up live features as keys are added.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server on :3000 |
| `npm run build` | Production build |
| `npm test` | Unit tests (Vitest) |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript strict check |

## Contributing / workflow

All changes land through pull requests. CI must be green before merge: lint, types, tests, a keyless production build, a full-history secret scan, env-file hygiene, and a dependency audit. See `.github/workflows/ci.yml`.

Project direction lives in [MASTER_PLAN.md](MASTER_PLAN.md); design standards in [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md); feature history in [CHANGELOG.md](CHANGELOG.md).

## License

Copyright © Anmol Subedi. All rights reserved. Source is visible for reference; no license is granted for reuse, redistribution, or commercial use.
