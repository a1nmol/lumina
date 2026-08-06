# Lumina — MASTER PLAN (Source of Truth)

> This is the single anchor document for the whole project. Every agent (led by **Fable**) must read this before doing anything and must not deviate from it without the owner's explicit approval. If a decision isn't covered here, propose it, get approval, then update this file.

Owner: Anmol · Building with Claude Code
Status: **Phases 0–3 complete** (foundation · Content Studio/Calendar · Inbox/FrontDesk-text/CRM/widget/booking · Analytics loop + Reviews — all reviewed, demo-mode-first with real backend seams; the full Content→FrontDesk→Analytics loop is demo-complete) · **Phase 4 next** (voice + growth add-ons + plans — most items gated on external keys/spend) · Ethos: **ship fast, iterate continuously — no fixed deadline. Move as fast as possible and keep going.**
Deferred by design: voice → Phase 4; live channel connections (Twilio SMS/IG/FB/email webhooks) + Ayrshare once keys arrive; migrations 0001–0003 applied to live Supabase once keys arrive; Supabase Storage 'media' bucket provisioning; external calendar sync; audio bed for slideshows (licensed music).

---

## 1. What we are building

**Lumina** — an all-in-one AI platform for local small businesses. One line:

> **Everything a local business needs to get customers (Content) and never miss one (FrontDesk) — in one dashboard, run by AI, measured as one loop.**

The loop (this is the whole thesis — no competitor joins both halves):

```
CONTENT ENGINE (outbound)                    FRONTDESK AGENT (inbound)
AI writes posts ── drives ──► calls / DMs / emails / form-fills
      ▲                              │
      │                              ▼
"make more like the        AI answers, qualifies, books,
 post that drove 3 calls"   captures every LEAD → one INBOX
      ▲                              │
      └──────── ANALYTICS ◄──────────┘
      (content reach + likes  +  calls/leads/bookings; AI says what to make next)
```

The join between halves = the **Contact** record. The loop closes via **Analytics**.

## 2. Positioning & differentiator

- Buffer only does the left half; AI receptionists only do the right half. We connect content to the leads it actually produces. That's the differentiator.
- Local-first: Google Business posts, review management, missed-call-to-text, booking, "just tell me what to post" — the underserved wedge that generalist tools ignore.

## 3. Constraints (must respect in all decisions)

- **Given free** to selected businesses during the test phase (invite-only). No billing turned on yet.
- **Cost obsession:** the platform must run cheap (~$0–30/month at test scale). Every feature must respect model routing, caching, free tiers, and per-account usage caps. Voice is the only real cost center → capped + paid-tier only.

## 4. Product scope — 7 modules

Tags: [MVP] now · [V2] soon · [V3] later · ★ differentiator.

**A. Content Studio** — caption/hashtag/CTA gen, tone & length, per-platform rewrites; formats: single image, carousel, ★TikTok/IG **photo slideshow** (our cheap "video"), [V2] short generative video; ★**save-as-template + regenerate-from-template**, 👍/👎 rate, ★**auto "generate my week"**, brand-voice training, auto-resize to all aspect ratios.

**B. Publishing** — calendar (drag-drop), queue, drafts, ★**reminder-to-post** (push → caption copied → deep-link → paste), [V2] true auto-publish via Ayrshare, best-time, recurring/evergreen, bulk, cross-post, link-in-bio.

**C. Unified Inbox** — comments+DMs+chat+SMS+email (+calls later) in one thread list; AI-drafted replies; saved replies; ★**review management** (Google/FB pull + AI replies + sentiment); sentiment tags.

**D. FrontDesk Agent** — text channels first [MVP]: web chat widget, form, SMS two-way, ★missed-call-to-text, email, IG/FB Messenger. Voice [V2, metered+capped]: 24/7 answering, spam filter, warm transfer, bilingual, voicemail+transcription. Booking: calendar sync, book/reschedule/cancel, ★reminders + no-show follow-up. Lead capture: name/number/reason + custom questions, instant owner alert, after-hours; ★call transcript+summary+sentiment (voice).

**E. Analytics** — per-post metrics, follower growth, best content/format/time; ★**loop metrics** (which post → which calls/leads/bookings); FrontDesk metrics; ★**AI insights in plain English**; [V2] competitor benchmark, white-label reports.

**F. Local Growth add-ons** — ★review generation [MVP], [V2] Google Business posting, listings, email + SMS marketing, reactivation; [V3] loyalty/referral, landing pages; QR tools [MVP]; simple CRM [MVP]; [V2] lead pipeline + automated follow-ups.

**G. Platform & Admin** — accounts + team logins; ★**entitlements/feature-flags per account**; ★**usage limits + spend guard per account**; ★**invite-only test phase**; admin dashboard (per-account usage & cost); the **Business Brain** (hours, services, prices, FAQ, tone, brand kit, connected channels — powers content AND FrontDesk); [V2] subscription tiers (structure now, charge later).

## 5. Model routing (cheapest effective; route per job, never one model)

**Text (via OpenRouter as the router; pin high-volume routes direct later):**
- Classify/route/intent/sentiment/spam → free tier: **Cerebras (1M tok/day) or Groq Llama 3.1 8B**; fallback GPT-5 nano / Gemini Flash-Lite.
- Content generation → **Gemini 2.5 Flash** ($0.30/$2.50) or **DeepSeek-V4-Flash** ($0.14/$0.28).
- Customer-facing replies (chat/DM/SMS) → **Claude Haiku 4.5** ($1/$5) for reliability.
- Analytics/hard reasoning → **DeepSeek-V4-Pro** or **Claude Haiku 4.5**; escalate to Sonnet/GPT-5 only when needed.
- NEVER send customer PII to free tiers (they may train on it). Route PII to paid endpoints.

**Media (via fal.ai; FFmpeg for assembly):**
- Bulk images → **FLUX.1 schnell** (~$0.0005) or free Google Imagen/"Nano Banana" tier.
- Text-in-image (flyers/ads hero) → **Ideogram** or **GPT-Image** (~$0.03–0.05).
- ★Slideshows (default "video") → FLUX images + **FFmpeg** (free) or Shotstack ($0.20/min) + royalty-free music.
- Real video (sparingly, 3–6s) → **Luma Ray 2 / Hailuo 02 / Wan 2.5** (~$0.04–0.05/s).

**Voice (V2 only, ~$0.08/min DIY floor):** STT Deepgram Nova-3 (~$0.0077/min) · TTS Deepgram Aura-2 / Google Standard (~$0.013/min) · Twilio ($0.0085/min + $1.15/mo number). Prototype on Bland (~$0.09/min).

## 6. Design philosophy (non-negotiable — Fable owns this)

The interface must look like a **years-experienced product designer + futuristic creative thinker** built it. Every screen and component: intentional, professional, and delightful. Before building ANY UI component, Fable researches the best-in-class references online (award-site quality) and writes a short design brief. Target qualities:

- Clean, calm information architecture (Linear/Notion-level restraint) — never cluttered.
- Tasteful motion: smooth micro-interactions, hover states, spring physics, page/element transitions. Optional **3D / animated** accents where they elevate (hero, empty states, data viz) — never gratuitous, never janky.
- Crafted cards, elegant icons/SVGs, consistent spacing/typography, a real design system (tokens for color, type, spacing, radius, shadow, motion).
- **Accessible + dark-mode-first**, responsive, fast. Motion respects `prefers-reduced-motion`.
- One coherent system: every component reads like part of the same family.

Design stack: **Next.js + TypeScript + Tailwind + shadcn/ui** (base), **Framer Motion** (motion), **Lucide** (icons), optional **React Three Fiber / Spline** (3D accents), **Recharts** (charts, per the dataviz palette rules). Follow the dataviz color method for all charts.

## 7. Tech stack

Frontend/app: Next.js (App Router) + TypeScript + Tailwind + shadcn/ui, deploy Vercel. Data/auth/storage: **Supabase** (Postgres + Auth + Storage + RLS). Router/LLM: **OpenRouter** → Gemini/DeepSeek/Groq/Claude Haiku. Media: **fal.ai** + FFmpeg + Google free image tier. Social posting/analytics/reviews: **Ayrshare**. Comms: **Twilio** (SMS/voice), **Resend/Brevo** (email + SMS marketing). Voice (V2): Deepgram + Twilio (+ Bland to start). Payments (later): Stripe. Push: Web Push / Expo (mobile later).

## 8. Data model (initial — expand as needed)

`orgs` (business) · `users` / `org_members` (roles) · `business_brain` (hours, services, prices, faq, tone, brand kit, connected channels) · `entitlements` (org → feature flags) · `usage_events` (org, feature, model, units, cost) · `plans` · `content_items` (prompt, model, cost, format, platform, rating, status) · `templates` · `media_assets` · `schedule_slots` · `contacts` (source, status pipeline, tags) · `conversations` · `messages` (channel, direction, ai_handled) · `appointments` · `analytics_events` · `reviews`. Enforce Row-Level Security per org.

## 9. Build phases (order is fixed)

- **Phase 0 — Foundation:** repo, auth, orgs, admin skeleton, **entitlements + usage metering first**, Business Brain setup, design system + tokens. (Cost control before features.)
- **Phase 1 — Content Studio + Calendar:** Composer (prompt bar + format picker + live phone-mockup preview + AI-assist panel), routed text gen, image gen (fal.ai/free), **slideshow via FFmpeg**, templates (save/regenerate), 👍/👎, calendar/queue, **reminder-to-post** push. ← first demo-able, near-free product.
- **Phase 2 — Inbox + FrontDesk (text) + CRM:** chat widget, form, email, SMS, IG/FB Messenger, unified inbox, AI replies from Brain, contacts/CRM, missed-call-to-text, booking, instant lead alerts.
- **Phase 3 — Analytics loop + Reviews:** metrics (Ayrshare) + FrontDesk outcomes, loop dashboard, AI insights, review generation + management.
- **Phase 4 — Voice + Growth + Plans:** voice agent (Bland → DIY), GBP, email/SMS marketing, loyalty, subscription billing (turn on later).

## 10. UI per screen (summary — full detail in the plan)

App shell (Companion direction, owner-selected 2026-08-05): conversational Home with Wick + a floating bottom dock (Wick orb · Studio · Calendar · Inbox · Contacts · Analytics · Growth · ⌘K · bell · overflow with Settings/Account/Admin/theme); sections open as full-screen rooms.
- **Content Studio:** hybrid — structured Composer main surface (prompt bar → format picker → live phone-mockup preview → editable caption/hashtags → 👍 Save-as-template / 👎 Regenerate → Add to Queue) with an **AI Assist side panel** for conversational refinement; plus a "Generate my week" wizard. NOT a raw chatbot.
- **Calendar/Queue, Unified Inbox (3-pane), Contacts/CRM, Analytics loop dashboard, Business Brain setup, Admin control panel** — per full plan.

## 11. Working agreement for the agent team

1. Read this file first, every session. Follow it. Don't invent scope.
2. Build strictly in phase order. One feature at a time, fully working + reviewed before the next.
3. **Fable leads:** researches best-in-class UI + writes a design brief before any component, plans the task, then delegates implementation to cheaper worker agents.
4. Respect cost rules (routing, caching, caps) in every feature touched.
5. Keep secrets in env vars; never commit keys. Enforce RLS.
6. After each feature: update this plan's status + a short CHANGELOG note.
7. If unsure or blocked, stop and ask the owner — don't guess on irreversible things.
