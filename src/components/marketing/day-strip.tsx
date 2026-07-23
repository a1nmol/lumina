"use client"

// Section 5-9 · THE DAY STRIP — landing-copy.md §5-9, brand-redesign-plan.md
// §5.6 (the centerpiece). Gate 3: a pinned-scroll story on desktop (lg+) —
// a sticky viewport-height stage whose ~400vh scroll driver scrubs a sky
// arc (dawn → noon → dusk → night → dawn) and crossfades five scene
// panels, each with a small scroll-scrubbed micro-motion (chalkboard
// "write-on", a sliding ticket, an amber pulse, a typed-in reply, a
// printing receipt). Below lg, and for anyone with prefers-reduced-motion,
// the section falls back to the original static stacked cards with
// whileInView entrances — no scroll-jacking, ever.
//
// Scroll mapping: `useScroll({ target: stageRef })` over the ~400vh driver
// produces `scrollYProgress` (0→1). That single motion value is the only
// scroll listener for the whole scene — everything else (`SkyLayer`,
// `ScenePanel`, `ChapterRail`) derives its own crossfade/local-progress via
// `useTransform`, so there's no imperative scroll handling and no layout
// thrash. Each of the 5 scenes owns an even 1/5 (20%) slice of progress.
//
// Clarity rework (owner feedback: scenes were crossfading into each other
// mid-scroll and reading as confusing). `computeSceneWindow` now carves
// each scene's slice into three named zones instead of one soft bleed —
// enter (fade 0→1, brief), plateau (~70% of the slice, held at full
// opacity — the "readable" window), exit (fade 1→0, brief) — with an
// explicit `GAP` between one scene's exit and the next scene's enter where
// NEITHER panel is visible (only the sky arc + stage paper show). That's
// the opposite of the old scheme, which let scene N's enter-fade run
// *while* scene N-1 was still fully opaque (each panel's fade window
// bled ~4% into its neighbor's slice), so both genuinely overlapped
// on-screen. `clampMonotonic` keeps every resulting input array strictly
// increasing and inside [0,1] — WAAPI keyframe offsets must be
// non-decreasing, and edge scenes would otherwise produce out-of-range or
// degenerate (zero-width) stops — the same epsilon-guard technique the
// original crossfade used, just applied to the new enter/plateau/exit
// windows instead of a bleed-into-neighbor one. Each panel additionally
// derives its own `localT` (0→1 clamped to its own slice) to drive that
// scene's specific micro-motion — unchanged by this rework, and its
// existing thresholds all land comfortably inside the new plateau.
//
// Navigation: the left rail is a real chapter list (`ChapterRail`) — one
// button per scene with its time stamp + short title, active/complete
// states, and a click handler that smooth-scrolls the window to that
// scene's plateau midpoint (computed from the stage driver's bounding
// box; instant jump under reduced motion). An `aria-live="polite"` region
// announces "Scene N of 5" on change. The mobile/stacked fallback gets a
// lightweight companion: a `position: sticky` mini header (time + title)
// that swaps via IntersectionObserver as you scroll past each card — no
// pinning, no scroll-jacking, just a plain reactive label.

import { useEffect, useRef, useState } from "react"
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion"
import { CalendarDays, Check, DoorOpen, MessageCircleWarning, Scissors, Sparkles, Star, ThumbsUp } from "lucide-react"

import { TimeStamp } from "@/components/brand/time-stamp"
import { useMounted } from "@/hooks/use-mounted"
import { useReducedMotionSafe } from "@/hooks/use-reduced-motion-safe"
import { cn } from "@/lib/utils"

import { ScrollReveal } from "./scroll-reveal"

/** Five equal scroll slices — one per scene, in on-page order. `chapter` is
 *  the short label the chapter rail / mobile sticky header use (the full
 *  `title` sentence stays reserved for the in-scene heading). */
const SCENES = [
  { key: "7am", stamp: "7:00 AM", title: "Your morning post, already written.", chapter: "Morning post" },
  { key: "12pm", stamp: "12:00 PM", title: "Your week, on the rail.", chapter: "Weekly queue" },
  { key: "6pm", stamp: "6:00 PM", title: "Ding — a customer at the digital door.", chapter: "Front door" },
  { key: "11pm", stamp: "11:00 PM", title: "While Main Street sleeps, yours is answering.", chapter: "After hours" },
  { key: "645am", stamp: "6:45 AM", title: "The morning receipt.", chapter: "Morning receipt" },
] as const

const SEGMENT_SIZE = 1 / SCENES.length

/** The empty "only sky/stage shows" pause carved between every pair of
 *  adjacent scenes, in total-scroll-progress units (~3% of the full range,
 *  per the clarity rework). */
const SCENE_GAP = 0.03
/** How much of each scene's own slice stays a full-opacity "plateau". The
 *  remainder is split evenly between its enter-fade and exit-fade. */
const PLATEAU_RATIO = 0.7
/** Enter/exit fade width, derived so `plateau + 2*fade + gap === segment`. */
const SCENE_FADE = Math.max(0, ((1 - PLATEAU_RATIO) * SEGMENT_SIZE - SCENE_GAP) / 2)

/** Clamp every value to [0,1] and nudge non-increasing neighbors up by a
 *  hair. Result is guaranteed non-decreasing (WAAPI-legal); it is strictly
 *  increasing everywhere EXCEPT when values saturate at 1.0 (the last
 *  scene's exit stops both cap at 1 — legal duplicates, same output value,
 *  no visual or interpolation consequence). */
function clampMonotonic(values: readonly number[]): number[] {
  const eps = 0.0001
  const out = values.map((v) => Math.min(1, Math.max(0, v)))
  for (let i = 1; i < out.length; i++) {
    if (out[i] <= out[i - 1]) out[i] = Math.min(1, out[i - 1] + eps)
  }
  return out
}

/** Pure (non-hook) math for one scene's enter/plateau/exit window, shared by
 *  the opacity/y transform below AND the chapter rail's click-to-scroll
 *  target — kept as plain numbers so the rail can use it outside a
 *  MotionValue context. */
function computeSceneWindow(index: number, total: number) {
  const size = 1 / total
  const boundaryStart = index * size
  const boundaryEnd = boundaryStart + size
  const isFirst = index === 0
  const isLast = index === total - 1
  const halfGap = SCENE_GAP / 2

  // First scene needs no enter (visible from progress 0); last needs no
  // exit (stays visible through progress 1) — mirrors the old scheme's
  // edge handling.
  const enterStart = isFirst ? 0 : boundaryStart + halfGap
  const enterEnd = isFirst ? 0 : enterStart + SCENE_FADE
  const exitEnd = isLast ? 1 : boundaryEnd - halfGap
  const exitStart = isLast ? 1 : exitEnd - SCENE_FADE

  return {
    isFirst,
    isLast,
    enterStart,
    enterEnd,
    exitStart,
    exitEnd,
    /** Midpoint of the fully-visible plateau — the chapter rail's scroll target. */
    plateauMid: (enterEnd + exitStart) / 2,
  }
}

/** Opacity + y for one scene panel: 0 → 1 over `enter`, held at 1 across the
 *  plateau, 1 → 0 over `exit` — fully resolved (opacity 0) before the next
 *  scene's own enter window begins, because `SCENE_GAP` separates them. */
function useSceneOpacityY(progress: MotionValue<number>, index: number, total: number) {
  const w = computeSceneWindow(index, total)
  const input = clampMonotonic([w.enterStart, w.enterEnd, w.exitStart, w.exitEnd])
  const opacity = useTransform(progress, input, [w.isFirst ? 1 : 0, 1, 1, w.isLast ? 1 : 0])
  const y = useTransform(progress, input, [w.isFirst ? 0 : 16, 0, 0, w.isLast ? 0 : -16])
  return { opacity, y }
}

export function DayStrip() {
  return (
    <section id="day-strip" data-scene="day-strip" className="bg-background py-20 sm:py-28 lg:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="mb-16 text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            One day on Main Street.
          </h2>
        </ScrollReveal>
      </div>

      <DayStripBody />
    </section>
  )
}

function DayStripBody() {
  // Structural switch (an entirely different subtree: the pinned scroll
  // stage vs. the static stacked cards — not just animation props), so this
  // uses the mount-gated useReducedMotionSafe rather than framer's
  // useReducedMotion. `mounted` starts false on both SSR and the client's
  // first paint, so the static stacked layout is what renders — and is all
  // that ever renders — until hydration has fully committed; only then,
  // once the real matchMedia value is known, does the pinned stage mount
  // (and only if motion is actually allowed). This intentionally trades a
  // one-effect-tick delay before the pinned stage appears on desktop for
  // zero risk of a reduced-motion visitor ever seeing it flash in first.
  const reduceMotion = useReducedMotionSafe()
  const mounted = useMounted()
  const showPinnedStage = mounted && !reduceMotion

  return (
    <>
      {/* Static stacked story — the mobile/tablet layout, the reduced-motion
          fallback at every breakpoint, AND the universal pre-mount/SSR
          render ("stacked static everywhere" until proven otherwise). */}
      <div className={cn("mx-auto max-w-3xl px-4 sm:px-6 lg:px-8", showPinnedStage && "lg:hidden")}>
        <DayStripStackedStory />
      </div>

      {/* Pinned scroll story — desktop only, motion allowed only, mounted only after hydration confirms both. */}
      {showPinnedStage && (
        <div className="hidden lg:block">
          <PinnedDayStripStage />
        </div>
      )}
    </>
  )
}

/** The stacked/mobile companion to the desktop chapter rail: a `position:
 *  sticky` mini header (current scene's time + short title) that swaps as
 *  the visitor scrolls past each card, via IntersectionObserver watching a
 *  thin band around the viewport's vertical center — no pinning, no scroll
 *  hijacking, no framer scroll-linked transforms (so nothing here needs
 *  reduced-motion gating beyond what `ScrollReveal` already does per-card). */
function DayStripStackedStory() {
  const sceneNodes = useRef<(HTMLDivElement | null)[]>([])
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    const nodes = sceneNodes.current.filter((node): node is HTMLDivElement => node !== null)
    if (nodes.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const intersecting = entries.filter((entry) => entry.isIntersecting)
        if (intersecting.length === 0) return
        // If more than one card straddles the center band, prefer the one
        // closest to the top of the viewport — it's the one "in focus".
        const topMost = intersecting.reduce((a, b) =>
          a.boundingClientRect.top < b.boundingClientRect.top ? a : b
        )
        const index = nodes.indexOf(topMost.target as HTMLDivElement)
        if (index !== -1) setActiveIndex(index)
      },
      // A thin horizontal band centered in the viewport — "current scene"
      // means "the card currently crossing the middle of the screen".
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
    )
    nodes.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [])

  const active = SCENES[activeIndex]

  return (
    <div className="flex flex-col gap-16">
      <div
        aria-hidden="true"
        className="sticky top-14 z-10 -mb-2 flex items-center gap-2.5 self-start rounded-full border border-border bg-card/95 px-4 py-2 shadow-soft backdrop-blur-sm"
      >
        <TimeStamp label={active.stamp} tone="flame" />
        <span className="h-3 w-px bg-border" />
        <span className="text-xs font-medium text-foreground">{active.chapter}</span>
        <span className="ml-1 font-mono text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
          {activeIndex + 1}/{SCENES.length}
        </span>
      </div>

      {STACKED_SCENES.map(({ key, Component }, index) => (
        <div key={key} ref={(node) => { sceneNodes.current[index] = node }}>
          <Component />
        </div>
      ))}
    </div>
  )
}

const STACKED_SCENES = [
  { key: "7am", Component: MorningChalkboard },
  { key: "12pm", Component: TicketRail },
  { key: "6pm", Component: ShopBell },
  { key: "11pm", Component: IndigoHours },
  { key: "645am", Component: MorningReceipt },
] as const

function SceneHeading({ stamp, title, animated = true }: { stamp: string; title: string; animated?: boolean }) {
  const content = (
    <>
      {/* flame, not the default amber — every SceneHeading renders on the
          light paper register (even the 11PM scene: this heading sits
          above, not inside, that scene's .dusk-section card), and
          amber-glow is tuned for dark/dusk backgrounds only. */}
      <TimeStamp label={stamp} tone="flame" />
      <h3 className="mt-1.5 text-xl font-semibold text-foreground sm:text-2xl">{title}</h3>
    </>
  )

  if (!animated) {
    return <div className="mb-4">{content}</div>
  }

  return <ScrollReveal className="mb-4">{content}</ScrollReveal>
}

/* ------------------------------------------------------------------ */
/* Pinned desktop stage                                                */
/* ------------------------------------------------------------------ */

function PinnedDayStripStage() {
  const stageRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: stageRef, offset: ["start start", "end end"] })

  return (
    // 400vh scroll driver — not a spacing-scale value (it's a scroll
    // length, not a surface/UI dimension), per the brief's "~400vh tall".
    <div ref={stageRef} className="relative" style={{ height: "400vh" }}>
      {/* Sticky stage sits just below the sticky nav (top-14 / h-14, same
          token nav.tsx already uses) so it never hides beneath it.
          `bg-background` gives the stage its own paper surface (light-first
          chrome) — the sky arc now floats as a soft banner near the top
          instead of washing the whole stage. */}
      <div className="sticky top-14 h-[calc(100vh-3.5rem)] overflow-hidden rounded-3xl border border-border bg-background shadow-overlay">
        <SkyBand progress={scrollYProgress} />
        <ChapterRail progress={scrollYProgress} stageRef={stageRef} />

        <div className="relative z-10 flex h-full items-center justify-center px-10 py-16 xl:px-20">
          <div className="relative h-96 w-full max-w-xl">
            {SCENES.map((scene, index) => (
              <ScenePanel key={scene.key} scene={scene} index={index} progress={scrollYProgress} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Shared crossfade curve for the sky arc's 1/5 slice of scroll progress —
 *  a continuous ambient background wash, deliberately NOT subject to the
 *  scene panels' enter/plateau/exit/gap treatment above (it's the "stage",
 *  not a "scene" — it should keep drifting smoothly through the day). */
function useSegmentOpacity(progress: MotionValue<number>, index: number, total: number) {
  const size = 1 / total
  const start = index * size
  const end = start + size
  const fade = size * 0.2
  // Framer v12 may compile scroll-linked transforms to WAAPI keyframes, whose
  // offsets must be non-decreasing AND within [0,1] — so the edge segments'
  // fade windows must be clamped (index 0 would otherwise start at -fade,
  // the last segment would end at 1+fade, and WAAPI throws). Epsilon keeps
  // the four stops strictly increasing so interpolation never degenerates.
  const eps = 0.0001
  const input = [
    Math.max(0, start - fade),
    Math.max(eps, start),
    Math.min(1 - eps, end),
    Math.min(1, end + fade),
  ]
  for (let i = 1; i < input.length; i++) {
    if (input[i] <= input[i - 1]) input[i] = input[i - 1] + eps
  }
  return useTransform(
    progress,
    input,
    [index === 0 ? 1 : 0, 1, 1, index === total - 1 ? 1 : 0]
  )
}

function ScenePanel({
  scene,
  index,
  progress,
}: {
  scene: (typeof SCENES)[number]
  index: number
  progress: MotionValue<number>
}) {
  const start = index * SEGMENT_SIZE
  const end = start + SEGMENT_SIZE

  const { opacity, y } = useSceneOpacityY(progress, index, SCENES.length)
  const localT = useTransform(progress, [start, end], [0, 1], { clamp: true })
  // Only the (near-)fully-visible scene should be able to catch pointer
  // interaction — the rest sit stacked underneath mid-crossfade.
  const pointerEvents = useTransform(opacity, (v) => (v > 0.5 ? "auto" : "none"))
  // Mirror the pointer gate for assistive tech: without this, a screen
  // reader walks all five stacked panels back-to-back while sighted users
  // see one scene at a time (aria-hidden can't take a MotionValue, so the
  // threshold crossing is bridged into React state).
  const [ariaHidden, setAriaHidden] = useState(index !== 0)
  useMotionValueEvent(opacity, "change", (v) => {
    const hidden = v <= 0.5
    setAriaHidden((prev) => (prev === hidden ? prev : hidden))
  })

  return (
    <motion.div
      aria-hidden={ariaHidden}
      style={{ opacity, y, pointerEvents }}
      className="absolute inset-0 flex flex-col justify-center"
    >
      <SceneHeading stamp={scene.stamp} title={scene.title} animated={false} />
      <div className="mt-2">
        <ScenePanelContent sceneKey={scene.key} localT={localT} />
      </div>
    </motion.div>
  )
}

function ScenePanelContent({ sceneKey, localT }: { sceneKey: (typeof SCENES)[number]["key"]; localT: MotionValue<number> }) {
  switch (sceneKey) {
    case "7am":
      return <ChalkboardCard localT={localT} />
    case "12pm":
      return <TicketRailCard localT={localT} />
    case "6pm":
      return <ShopBellCard localT={localT} />
    case "11pm":
      return <IndigoHoursCard localT={localT} />
    case "645am":
      return <MorningReceiptCard localT={localT} />
    default:
      return null
  }
}

/* ------------------------------------------------------------------ */
/* Sky band — the light-first stage's time-of-day storyteller. Rendered as   */
/* a soft, blurred arc/banner near the top of the stage rather than a        */
/* full-bleed wash behind the copy, so it never competes with scene-card     */
/* text contrast (the stage's own `bg-background` paper shows everywhere     */
/* else). The 11PM scene keeps its own `.dusk-section` night vignette         */
/* independently — this arc is purely ambient/decorative.                    */
/* ------------------------------------------------------------------ */

const SKY_LAYERS = [
  { token: "--sky-dawn" },
  { token: "--sky-noon" },
  { token: "--sky-dusk" },
  { token: "--sky-night" },
  { token: "--sky-dawn" },
] as const

function SkyBand({ progress }: { progress: MotionValue<number> }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-6 flex justify-center xl:top-10">
      <div className="relative h-36 w-[65%] max-w-xl xl:h-44">
        {SKY_LAYERS.map((layer, index) => (
          <SkyLayer key={`${layer.token}-${index}`} index={index} token={layer.token} progress={progress} />
        ))}
      </div>
    </div>
  )
}

function SkyLayer({ index, token, progress }: { index: number; token: string; progress: MotionValue<number> }) {
  const opacity = useSegmentOpacity(progress, index, SKY_LAYERS.length)
  return (
    <motion.div
      style={{ opacity, backgroundColor: `var(${token})` }}
      className="absolute inset-0 rounded-full blur-2xl"
    />
  )
}

/* ------------------------------------------------------------------ */
/* Chapter rail — the streetlamp-wire micro-signature (brand-redesign-  */
/* plan.md §5 micro-signatures), upgraded from plain dots into a real    */
/* navigator: time stamp + short title per scene, active/complete state, */
/* and click-to-scroll. The vertical wire keeps its own scroll-scrubbed  */
/* fill so the "signature" motion survives the upgrade.                  */
/* ------------------------------------------------------------------ */

function ChapterRail({
  progress,
  stageRef,
}: {
  progress: MotionValue<number>
  stageRef: React.RefObject<HTMLDivElement | null>
}) {
  const reduceMotion = useReducedMotionSafe()
  const [activeIndex, setActiveIndex] = useState(0)

  useMotionValueEvent(progress, "change", (value) => {
    const index = Math.min(SCENES.length - 1, Math.max(0, Math.floor(value * SCENES.length)))
    setActiveIndex((prev) => (prev === index ? prev : index))
  })

  const handleSelect = (index: number) => {
    const stage = stageRef.current
    if (!stage) return
    const { plateauMid } = computeSceneWindow(index, SCENES.length)
    const rect = stage.getBoundingClientRect()
    const absoluteTop = rect.top + window.scrollY
    const scrollRange = Math.max(0, stage.offsetHeight - window.innerHeight)
    const targetY = absoluteTop + plateauMid * scrollRange
    window.scrollTo({ top: targetY, behavior: reduceMotion ? "auto" : "smooth" })
  }

  return (
    <>
      <nav
        aria-label="Day strip chapters"
        className="absolute top-1/2 left-6 z-10 hidden -translate-y-1/2 xl:left-10 lg:block"
      >
        <div className="relative">
          <div aria-hidden="true" className="absolute top-2 bottom-2 left-5 w-px bg-border" />
          <motion.div
            aria-hidden="true"
            style={{ scaleY: progress }}
            className="absolute top-2 bottom-2 left-5 w-px origin-top bg-primary"
          />
          <ol className="relative flex w-36 flex-col gap-1">
            {SCENES.map((scene, index) => (
              <li key={scene.key}>
                <ChapterRailItem
                  scene={scene}
                  state={index === activeIndex ? "active" : index < activeIndex ? "done" : "upcoming"}
                  onSelect={() => handleSelect(index)}
                />
              </li>
            ))}
          </ol>
        </div>
      </nav>
      {/* Announced on every chapter change, for screen-reader users tracking
          the pinned story without relying on the visual crossfade. */}
      <div aria-live="polite" className="sr-only">
        Scene {activeIndex + 1} of {SCENES.length}: {SCENES[activeIndex].stamp} — {SCENES[activeIndex].title}
      </div>
    </>
  )
}

function ChapterRailItem({
  scene,
  state,
  onSelect,
}: {
  scene: (typeof SCENES)[number]
  state: "active" | "done" | "upcoming"
  onSelect: () => void
}) {
  const isActive = state === "active"
  const isDone = state === "done"
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={isActive ? "true" : undefined}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left outline-none transition-colors",
        "hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50",
        isActive && "bg-muted/70"
      )}
    >
      <span
        className={cn(
          "relative z-10 flex size-5 shrink-0 items-center justify-center rounded-full border bg-background transition-colors",
          isDone && "border-flame bg-flame text-flame-foreground",
          isActive && "border-flame",
          !isDone && !isActive && "border-border"
        )}
      >
        {isDone ? (
          <Check aria-hidden="true" className="size-3" />
        ) : (
          <span className={cn("size-1.5 rounded-full transition-colors", isActive ? "bg-flame" : "bg-border")} />
        )}
      </span>
      <span className="flex min-w-0 flex-col">
        <span
          className={cn(
            "font-mono text-[10px] tracking-[0.18em] uppercase transition-colors",
            isActive ? "text-flame" : "text-muted-foreground"
          )}
        >
          {scene.stamp}
        </span>
        <span
          className={cn(
            "truncate text-xs font-medium transition-colors",
            isActive ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {scene.chapter}
        </span>
      </span>
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Scene cards — shared between the pinned desktop panels (driven by     */
/* scroll-derived `localT`) and the static mobile/reduced-motion stack   */
/* (passed a constant `localT = 1`, i.e. "fully progressed"). Keeping     */
/* one implementation means the two layouts can never visually drift.    */
/* ------------------------------------------------------------------ */

function MorningChalkboard() {
  const localT = useMotionValue(1)
  return (
    <div data-scene="day-strip-7am">
      <SceneHeading stamp="7:00 AM" title="Your morning post, already written." />
      <ScrollReveal delay={0.05}>
        <ChalkboardCard localT={localT} />
      </ScrollReveal>
    </div>
  )
}

function ChalkboardCard({ localT }: { localT: MotionValue<number> }) {
  const reveal = useTransform(localT, [0, 0.55], [0, 100], { clamp: true })
  const clipPath = useTransform(reveal, (v) => `inset(0 ${100 - v}% 0 0)`)
  return (
    <div className="rounded-2xl border-[10px] border-chalkboard-border bg-chalkboard p-6 shadow-raised sm:p-8">
      <motion.p
        style={{ clipPath }}
        className="-rotate-1 font-serif text-lg leading-relaxed text-chalkboard-foreground italic [text-shadow:0_0_1px_var(--chalkboard-foreground)] sm:text-xl"
      >
        Fresh sourdough out at 7. The first loaf&rsquo;s crackle is for the early birds. 🥖
      </motion.p>
      <div className="mt-5 flex items-center gap-3 border-t border-dashed border-chalkboard-foreground/20 pt-4">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-chalkboard-foreground/10 px-3 py-1 text-xs font-medium text-chalkboard-foreground">
          <ThumbsUp aria-hidden="true" className="size-3.5" />
          Approved
        </span>
        <span className="font-mono text-xs tracking-wide text-chalkboard-foreground/70 uppercase">
          Queued for 8:00 AM
        </span>
      </div>
    </div>
  )
}

function TicketRail() {
  const localT = useMotionValue(1)
  return (
    <div data-scene="day-strip-12pm">
      <SceneHeading stamp="12:00 PM" title="Your week, on the rail." />
      <ScrollReveal delay={0.05}>
        <TicketRailCard localT={localT} />
      </ScrollReveal>
    </div>
  )
}

const TICKETS = [
  { label: "Mon", detail: "Weekly special post" },
  { label: "Wed", detail: "Cinnamon roll photo" },
  { label: "Fri", detail: "Weekend hours reminder" },
] as const

/** One ticket-slot's travel distance: card width (9.5rem = 152px) + gap-4 (16px). */
const TICKET_SLOT_PX = 168

function TicketRailCard({ localT }: { localT: MotionValue<number> }) {
  const slideX = useTransform(localT, [0.25, 0.6], [-TICKET_SLOT_PX, 0], { clamp: true })
  return (
    <div className="relative rounded-2xl border border-border bg-card p-6 shadow-raised sm:p-8">
      <div aria-hidden="true" className="absolute top-12 right-6 left-6 h-0.5 rounded-full bg-border" />
      <div className="relative flex flex-wrap justify-between gap-4 pt-2">
        {TICKETS.map((ticket, index) => (
          <motion.div
            key={ticket.label}
            style={index === 2 ? { x: slideX } : undefined}
            className={cn(
              "flex w-[9.5rem] flex-col gap-1 rounded-lg border border-border bg-background px-3 py-2.5 shadow-soft",
              index === 2 && "border-primary/40 ring-1 ring-primary/20"
            )}
          >
            <span className="text-[11px] font-semibold tracking-wide text-primary uppercase">{ticket.label}</span>
            <span className="text-xs text-muted-foreground">{ticket.detail}</span>
          </motion.div>
        ))}
      </div>
      <p className="mt-6 text-sm text-muted-foreground">Drag Thursday&rsquo;s special to Friday. Done.</p>
    </div>
  )
}

function ShopBell() {
  const localT = useMotionValue(1)
  return (
    <div data-scene="day-strip-6pm">
      <SceneHeading stamp="6:00 PM" title="Ding — a customer at the digital door." />
      <ScrollReveal delay={0.05}>
        <ShopBellCard localT={localT} />
      </ScrollReveal>
    </div>
  )
}

const BUBBLES = [
  { text: "Are you open Sunday?", state: "answered" as const },
  { text: "Do you take walk-ins?", state: "answered" as const },
  { text: "Needs you — allergy question", state: "flagged" as const },
]

function ShopBellCard({ localT }: { localT: MotionValue<number> }) {
  const pulseScale = useTransform(localT, [0.42, 0.5, 0.58], [1, 1.07, 1], { clamp: true })
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-raised sm:p-8">
      <div className="mb-4 flex items-center gap-2 border-b border-dashed border-border pb-4">
        <span className="flex size-8 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
          <DoorOpen aria-hidden="true" className="size-4" />
        </span>
        <span className="text-xs font-medium text-muted-foreground">Front door · digital</span>
      </div>
      <div className="flex flex-col gap-2.5">
        {BUBBLES.map((bubble) => (
          <motion.div
            key={bubble.text}
            style={bubble.state === "flagged" ? { scale: pulseScale } : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm",
              bubble.state === "flagged"
                ? "border-warning/40 bg-warning/10 text-warning-foreground"
                : "border-border bg-muted/60 text-foreground"
            )}
          >
            {bubble.state === "flagged" ? (
              <MessageCircleWarning aria-hidden="true" className="size-4 shrink-0 text-warning" />
            ) : (
              <Check aria-hidden="true" className="size-4 shrink-0 text-success" />
            )}
            <span className="flex-1">{bubble.text}</span>
            <span
              className={cn(
                "shrink-0 text-[11px] font-medium",
                bubble.state === "flagged" ? "text-warning" : "text-success"
              )}
            >
              {bubble.state === "flagged" ? "Needs you" : "Answered"}
            </span>
          </motion.div>
        ))}
      </div>
      <p className="mt-5 text-sm text-muted-foreground">It never guesses. It flags you.</p>
    </div>
  )
}

function IndigoHours() {
  const localT = useMotionValue(1)
  return (
    <div data-scene="day-strip-11pm">
      <SceneHeading stamp="11:00 PM" title="While Main Street sleeps, yours is answering." />
      <ScrollReveal delay={0.05}>
        <IndigoHoursCard localT={localT} />
      </ScrollReveal>
    </div>
  )
}

function IndigoHoursCard({ localT }: { localT: MotionValue<number> }) {
  const customerOpacity = useTransform(localT, [0, 0.25], [0, 1], { clamp: true })
  const customerY = useTransform(localT, [0, 0.25], [8, 0], { clamp: true })
  const replyReveal = useTransform(localT, [0.35, 0.75], [0, 100], { clamp: true })
  const replyClip = useTransform(replyReveal, (v) => `inset(0 ${100 - v}% 0 0)`)

  return (
    <div className="dusk-section overflow-hidden rounded-2xl border border-border bg-background shadow-overlay">
      <div className="flex items-center gap-2 border-b border-border bg-card px-4 py-3">
        <span className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Sparkles aria-hidden="true" className="size-3.5" />
        </span>
        <span className="text-sm font-medium text-foreground">9:04 PM · Instagram DM</span>
      </div>
      <div className="flex flex-col gap-2.5 p-4">
        <motion.div style={{ opacity: customerOpacity, y: customerY }} className="flex justify-start">
          <div className="max-w-[80%] rounded-2xl rounded-bl-md bg-muted px-3.5 py-2.5 text-sm text-foreground">
            Hi! Do you do birthday cakes for Saturday?
          </div>
        </motion.div>
        <motion.div style={{ clipPath: replyClip }} className="flex flex-col items-end gap-1">
          <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary/15 px-3.5 py-2.5 text-sm text-foreground">
            We do! Custom cakes are $45 with 48h notice — want me to book a Saturday pickup?
          </div>
          <span className="inline-flex items-center gap-1 pr-1 text-[11px] font-medium text-primary">
            <Sparkles aria-hidden="true" className="size-3" />
            AI answered
          </span>
        </motion.div>
      </div>
    </div>
  )
}

function MorningReceipt() {
  const localT = useMotionValue(1)
  return (
    <div data-scene="day-strip-645am">
      <SceneHeading stamp="6:45 AM" title="The morning receipt." />
      <ScrollReveal delay={0.05}>
        <MorningReceiptCard localT={localT} />
      </ScrollReveal>
    </div>
  )
}

function MorningReceiptCard({ localT }: { localT: MotionValue<number> }) {
  const printReveal = useTransform(localT, [0, 0.65], [0, 100], { clamp: true })
  const printClip = useTransform(printReveal, (v) => `inset(0 0 ${100 - v}% 0)`)
  const tearOpacity = useTransform(localT, [0.62, 0.8], [0, 1], { clamp: true })

  return (
    <div className="relative mx-auto max-w-xs">
      <motion.div
        style={{ clipPath: printClip }}
        className="rounded-t-sm border border-b-0 border-border bg-card px-5 pt-5 pb-5 font-mono text-xs shadow-raised"
      >
        <p className="text-center text-sm font-semibold text-foreground">GOOD MORNING ☀</p>
        <div
          aria-hidden="true"
          className="my-3 h-px w-full bg-[repeating-linear-gradient(90deg,var(--border)_0_4px,transparent_4px_8px)]"
        />
        <p className="text-center tracking-wide text-muted-foreground uppercase">While you slept</p>
        <ul className="mt-3 flex flex-col gap-1.5 text-foreground">
          <li className="flex items-center justify-between gap-2">
            <span>2 new leads</span>
            <Sparkles aria-hidden="true" className="size-3 text-amber-glow" />
          </li>
          <li className="flex items-center justify-between gap-2">
            <span>1 booking (Sat 10:00 AM)</span>
            <CalendarDays aria-hidden="true" className="size-3 text-primary" />
          </li>
          <li className="flex items-center justify-between gap-2">
            <span>1 five-star review</span>
            <Star aria-hidden="true" className="size-3 fill-amber-glow text-amber-glow" />
          </li>
        </ul>
        <div
          aria-hidden="true"
          className="my-3 h-px w-full bg-[repeating-linear-gradient(90deg,var(--border)_0_4px,transparent_4px_8px)]"
        />
        <p className="flex items-center justify-center gap-1.5 text-center text-muted-foreground">
          <Scissors aria-hidden="true" className="size-3" />
          Have a great bake.
        </p>
      </motion.div>
      {/* Tear-off bottom edge — classic two-gradient torn-paper trick: the
          card color fills a zigzag, the page background shows through the
          cut triangles beneath it. Fades in once "printing" finishes. */}
      <motion.div
        aria-hidden="true"
        style={{
          opacity: tearOpacity,
          backgroundImage:
            "linear-gradient(-45deg, transparent 8px, var(--card) 8px), linear-gradient(45deg, transparent 8px, var(--card) 8px)",
          backgroundSize: "16px 16px",
          backgroundPosition: "0 0",
          backgroundRepeat: "repeat-x",
        }}
        className="h-2.5 w-full"
      />
    </div>
  )
}
