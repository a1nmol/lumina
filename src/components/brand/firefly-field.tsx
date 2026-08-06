"use client"

/**
 * FireflyField — Command Center's one hero accent (DESIGN_SYSTEM.md
 * "signature moments" — spend the wow sparingly): a lightweight canvas-2D
 * particle field of slow-drifting amber fireflies, seated behind the
 * greeting + "while you were away" receipt + stat strip as an ambient dusk
 * wash. Purely decorative — `aria-hidden`, `pointer-events-none`.
 *
 * Design: 12-18 fireflies, each a soft two-layer amber glow (a wide dim
 * halo + a small bright core) drifting on a slow, organic Lissajous-style
 * wander, with an "occasional gentle pulse" — a periodic brightness hump
 * staggered per-firefly (via a random cycle length + phase) rather than a
 * synchronized breathing loop, so it reads as fireflies flashing now and
 * then, not one uniform pulse. Dusk-appropriate in both themes: light mode
 * renders very subtle, low-opacity warm motes; dark mode renders brighter
 * lamplight fireflies. Color is read live from the `--amber-glow` design
 * token (already theme-resolved by the cascade) — never a hardcoded hex/
 * oklch duplicate — and re-read only when the `.dark` class actually
 * changes (a MutationObserver on `documentElement`, not a per-frame style
 * read).
 *
 * Perf contract (own the <2ms/frame budget):
 *  - ONE requestAnimationFrame loop for the whole field (never per-firefly).
 *  - Paused via `visibilitychange` (tab hidden) AND an IntersectionObserver
 *    (field scrolled out of view) — both must be true to run.
 *  - devicePixelRatio-aware canvas backing store, clamped to 2x (matches
 *    dusk-shader.tsx's convention) so retina displays don't blow the budget.
 *  - `prefers-reduced-motion`: renders a single static frame of 6 faint glow
 *    dots and never starts the rAF loop at all.
 *
 * Mount only via `next/dynamic(..., { ssr: false })` from a client boundary
 * (see `src/components/dashboard/dashboard-hero-accent.tsx`) — Next's App
 * Router disallows `ssr: false` dynamic imports directly inside a Server
 * Component, and this keeps the canvas out of the initial HTML/hydration
 * path entirely so it can never affect LCP.
 */

import { useEffect, useRef } from "react"

import { cn } from "@/lib/utils"

const REDUCED_MOTION_COUNT = 6
const MIN_FIREFLIES = 12
const MAX_FIREFLIES = 18

/** Ambient opacity ceiling per theme — light mode stays a bare warm hint, dark mode reads as real lamplight. Multiplies each firefly's own base/pulse opacity. */
const LIGHT_OPACITY_CEILING = 0.16
const DARK_OPACITY_CEILING = 0.55

/** How much brighter a firefly gets at the peak of its occasional pulse. */
const PULSE_AMPLITUDE = 0.65
/** Fraction of each firefly's cycle spent actually pulsing (the rest is a steady dim glow). */
const PULSE_FRACTION = 0.22

const FALLBACK_AMBER = "oklch(0.78 0.14 80)"

type Firefly = {
  /** Normalized resting position, 0-1 of the container. */
  x: number
  y: number
  /** Core glow radius, css px (pre-DPR). */
  radius: number
  /** Resting (non-pulsed) opacity, 0-1. */
  baseOpacity: number
  /** Slow organic drift — independent x/y frequencies + a shared phase so paths don't look like perfect circles. */
  driftFreqX: number
  driftFreqY: number
  driftRadiusX: number
  driftRadiusY: number
  phase: number
  /** Occasional-pulse timing — a full cycle length (seconds) and a phase offset, staggered per firefly so pulses never sync up. */
  pulseCycle: number
  pulsePhase: number
}

function readAmberGlow(): string {
  if (typeof window === "undefined") return FALLBACK_AMBER
  const value = getComputedStyle(document.documentElement).getPropertyValue("--amber-glow").trim()
  return value || FALLBACK_AMBER
}

function readIsDark(): boolean {
  if (typeof document === "undefined") return false
  return document.documentElement.classList.contains("dark")
}

function createFireflies(count: number): Firefly[] {
  const fireflies: Firefly[] = []
  for (let i = 0; i < count; i += 1) {
    fireflies.push({
      x: 0.06 + Math.random() * 0.88,
      y: 0.08 + Math.random() * 0.84,
      radius: 2.4 + Math.random() * 2.2,
      baseOpacity: 0.35 + Math.random() * 0.35,
      driftFreqX: 0.05 + Math.random() * 0.09,
      driftFreqY: 0.04 + Math.random() * 0.08,
      driftRadiusX: 10 + Math.random() * 22,
      driftRadiusY: 8 + Math.random() * 18,
      phase: Math.random() * Math.PI * 2,
      pulseCycle: 5 + Math.random() * 7,
      pulsePhase: Math.random() * 10,
    })
  }
  return fireflies
}

/** Halo + core two-layer glow — the "soft amber dot" look shared by both the animated and static-reduced-motion renders. */
function drawFirefly(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  opacity: number
) {
  if (opacity <= 0) return
  ctx.save()
  ctx.globalAlpha = Math.min(1, opacity)
  const halo = ctx.createRadialGradient(x, y, 0, x, y, radius * 3.2)
  halo.addColorStop(0, color)
  halo.addColorStop(1, "transparent")
  ctx.fillStyle = halo
  ctx.beginPath()
  ctx.arc(x, y, radius * 3.2, 0, Math.PI * 2)
  ctx.fill()

  ctx.globalAlpha = Math.min(1, opacity * 1.4)
  const core = ctx.createRadialGradient(x, y, 0, x, y, radius)
  core.addColorStop(0, color)
  core.addColorStop(1, "transparent")
  ctx.fillStyle = core
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

export function FireflyField({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    let width = 0
    let height = 0
    let dpr = 1
    let color = readAmberGlow()
    let isDark = readIsDark()

    function resize() {
      const rect = container!.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      canvas!.width = Math.round(width * dpr)
      canvas!.height = Math.round(height * dpr)
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    // Re-read the token + theme only when the `.dark` class actually
    // flips — never per-frame.
    const themeObserver = new MutationObserver(() => {
      color = readAmberGlow()
      isDark = readIsDark()
      if (prefersReducedMotion) drawStatic()
    })
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })

    const fireflies = createFireflies(REDUCED_MOTION_COUNT)

    function drawStatic() {
      resize()
      ctx!.clearRect(0, 0, width, height)
      const ceiling = isDark ? DARK_OPACITY_CEILING : LIGHT_OPACITY_CEILING
      for (const f of fireflies) {
        drawFirefly(ctx!, f.x * width, f.y * height, f.radius, color, f.baseOpacity * ceiling * 0.7)
      }
    }

    if (prefersReducedMotion) {
      drawStatic()
      const ro = new ResizeObserver(drawStatic)
      ro.observe(container)
      return () => {
        ro.disconnect()
        themeObserver.disconnect()
      }
    }

    const liveFireflies = createFireflies(MIN_FIREFLIES + Math.floor(Math.random() * (MAX_FIREFLIES - MIN_FIREFLIES + 1)))

    let rafId: number | null = null
    let running = true
    let tabVisible = !document.hidden
    let inViewport = false
    const start = performance.now()

    function frame(now: number) {
      rafId = null
      if (!running || !tabVisible || !inViewport) return
      const t = (now - start) / 1000
      ctx!.clearRect(0, 0, width, height)
      const ceiling = isDark ? DARK_OPACITY_CEILING : LIGHT_OPACITY_CEILING
      for (const f of liveFireflies) {
        const dx = Math.sin(t * f.driftFreqX + f.phase) * f.driftRadiusX
        const dy = Math.cos(t * f.driftFreqY + f.phase * 1.3) * f.driftRadiusY
        const cycleT = ((t + f.pulsePhase) % f.pulseCycle) / f.pulseCycle
        let pulseMul = 1
        if (cycleT > 1 - PULSE_FRACTION) {
          const p = (cycleT - (1 - PULSE_FRACTION)) / PULSE_FRACTION
          pulseMul = 1 + PULSE_AMPLITUDE * Math.sin(Math.PI * p)
        }
        drawFirefly(ctx!, f.x * width + dx, f.y * height + dy, f.radius, color, f.baseOpacity * ceiling * pulseMul)
      }
      schedule()
    }

    function schedule() {
      if (rafId === null && running && tabVisible && inViewport) rafId = requestAnimationFrame(frame)
    }

    function handleVisibility() {
      tabVisible = !document.hidden
      if (tabVisible && inViewport) schedule()
    }

    const io = new IntersectionObserver(
      (entries) => {
        inViewport = entries.some((entry) => entry.isIntersecting)
        if (inViewport && tabVisible) schedule()
      },
      { threshold: 0 }
    )
    io.observe(container)

    document.addEventListener("visibilitychange", handleVisibility)
    const ro = new ResizeObserver(resize)
    ro.observe(container)
    resize()

    return () => {
      running = false
      document.removeEventListener("visibilitychange", handleVisibility)
      io.disconnect()
      ro.disconnect()
      themeObserver.disconnect()
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
    >
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />
    </div>
  )
}
