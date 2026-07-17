# Design Brief — Phase 1: Content Studio Composer + Calendar/Queue

Synthesized from ui-researcher report (Typefully, Buffer, Later, Postiz, Vercel AI Elements, Notion calendar). Tokens/motion from `globals.css` + `src/lib/motion.ts`. NOT a chatbot — a structured tool the AI acts on.

## Composer (`/studio`)

Three vertical zones in a fixed-width main column:

1. **Prompt bar (top, command-bar feel):** textarea-like input "Describe the post…" + inline **format segmented control** (Single · Carousel · Slideshow — restyled Tabs as pill segments) + **platform chips** (Instagram, Facebook, TikTok, Google Business — multi-select toggles; active chip shows a dot when that platform has a rewritten variant) + primary "Generate" button.
2. **Content zone:** left = **PhoneFrame** component (flat, tokenized: rounded-2xl bezel border, subtle notch pill, real DOM post chrome — avatar, handle, caption, action icons; aspect 4:5 feed / 9:16 slideshow; format switches crossfade + `layout`-animate the frame size). Right/below = **editable caption + hashtags** fields.
3. **Action row (sticky bottom once content exists, always visible):** 👍 Save as template (bookmark fills on save) · 👎 + Regenerate (refresh icon spins during call) · "Add to Queue" primary. Optimistic states, scale-tap feedback.

**AI Assist rail:** shadcn Sheet from the right (~360px), collapsed by default; conversational refinement acting on the current draft ("shorter", "add emoji", "make it about the weekend special"). First tab stop is ALWAYS the prompt bar.

## Generate moment

- Caption: shimmer text sweep (~1.8s loop) while streaming; stream tokens into the field.
- Image: structure-aware skeleton exactly shaped like the phone-frame content (zero layout shift), cycling one-line micro-copy ("Sketching layout → Rendering image → Polishing caption"). No fake progress bars.
- Ready: one-shot spring pop (0.98→1, spring 300/20) + soft brand glow pulse (~400ms, never loops). Reduced motion → plain fade.

## Calendar (`/calendar`)

- **Month grid default, Week + Queue-list toggles** (segmented control in PageHeader actions).
- Post cards: 48–64px thumbnail + platform icon badge (corner overlay) + time. Nothing else — density and calm.
- **Drag-drop via dnd-kit**: pick-up = scale-up + shadow-elevate spring; Notion-style slim insertion line live-updates during drag; drop settles with spring. Full keyboard reorder (dnd-kit a11y) required.
- Empty day: "+" appears on hover/focus only (opacity 150ms).
- **Queue list view**: linear, grouped by day — target for reminder-to-post deep links.

## New reusable components (extend the system)

`PhoneFrame` · `Shimmer` (text) · `GenerateSkeleton` · segmented control restyle of Tabs · `PlatformChip` · calendar `PostCard`. Full frame only in Composer; calendar uses plain img + badge (no per-card frame DOM).

## Data/cost rules (MASTER_PLAN §5)

Text gen via OpenRouter (Gemini 2.5 Flash / DeepSeek default), metered through `checkAllowance('content_generations')` + `recordUsage`. Image gen fal.ai FLUX schnell, metered. Demo mode: canned outputs with simulated streaming so the whole flow works without keys.

## Acceptance

DESIGN_SYSTEM checklist + shimmer/glow pause under reduced motion + keyboard reorder + AA both modes + no layout shift during generation.
