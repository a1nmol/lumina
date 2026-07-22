"use client"

import { useEffect, useRef, useState } from "react"

/**
 * DuskShader — the signature gradient (brand-redesign-plan.md §3/§6): a
 * single hand-rolled WebGL fragment shader sweeping deep indigo → violet →
 * amber with slow simplex-noise drift. This is our one always-on WebGL
 * surface, and it's geometry-free (one full-screen triangle).
 *
 * Not mounted anywhere yet — component only, ahead of the landing hero /
 * app loading & empty states / login aurora replacement it's built for
 * (see plan §7 "Dashboard translation" and §9 roadmap step 5). Future
 * usage: `<DuskShader intensity="hero" className="absolute inset-0" />`.
 *
 * Perf/graceful-degradation contract:
 * - The CSS gradient (`--dusk-shader-fallback`) paints immediately and
 *   unconditionally — it IS the background, not a loading placeholder — so
 *   this component can never delay LCP.
 * - The canvas is lazy-initialized only once it enters the viewport
 *   (IntersectionObserver), and only when WebGL is available, the user
 *   hasn't asked for reduced motion, and the device isn't CPU-constrained.
 *   Otherwise the CSS gradient simply stays put, forever — that's the
 *   real fallback, not a broken state.
 * - The canvas fades in via opacity once its first frame has rendered, on
 *   top of the (still-present) CSS gradient beneath it.
 */

type Intensity = "ambient" | "hero"

interface DuskShaderProps {
  className?: string
  intensity?: Intensity
}

// The three sky stops, authored in OKLCH to match the token system (deep
// indigo → violet → amber, the "long way" around the hue wheel through
// magenta/red rather than the short way through cyan/green — that's what
// reads as a dusk sky rather than a random rainbow). Converted to linear
// sRGB once, at module scope, for the shader uniforms.
const SKY_STOPS_OKLCH: [l: number, c: number, h: number][] = [
  [0.22, 0.09, 277], // deep indigo (zenith)
  [0.4, 0.19, 315], // violet
  [0.72, 0.15, 80], // amber (horizon)
]

function oklchToLinearSrgb(L: number, C: number, H: number): [number, number, number] {
  const hRad = (H * Math.PI) / 180
  const a = C * Math.cos(hRad)
  const b = C * Math.sin(hRad)

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b

  const l = l_ ** 3
  const m = m_ ** 3
  const s = s_ ** 3

  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  return [Math.max(0, r), Math.max(0, g), Math.max(0, bl)]
}

function oklchToCss([l, c, h]: [number, number, number]) {
  return `oklch(${l} ${c} ${h})`
}

const SKY_STOPS_RGB = SKY_STOPS_OKLCH.map(([l, c, h]) => oklchToLinearSrgb(l, c, h))
const CSS_FALLBACK_GRADIENT = `linear-gradient(160deg, ${SKY_STOPS_OKLCH.map(oklchToCss).join(", ")})`

const VERTEX_SRC = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

// 2D simplex noise — Ian McEwan / Ashima Arts (public domain / MIT,
// webgl-noise). Hand-written into this shader, no dependency.
const FRAGMENT_SRC = `
precision mediump float;
uniform vec2 u_resolution;
uniform float u_time;
uniform vec3 u_colorA;
uniform vec3 u_colorB;
uniform vec3 u_colorC;
uniform float u_amplitude;

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                      -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
    + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float drift = snoise(uv * 1.6 + vec2(0.0, u_time * 0.02)) * u_amplitude;
  float t = clamp(uv.y + drift, 0.0, 1.0);
  vec3 color = t < 0.5
    ? mix(u_colorA, u_colorB, smoothstep(0.0, 0.5, t))
    : mix(u_colorB, u_colorC, smoothstep(0.5, 1.0, t));
  gl_FragColor = vec4(color, 1.0);
}
`

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function initGl(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false })
  if (!gl) return null

  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SRC)
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC)
  if (!vertexShader || !fragmentShader) return null

  const program = gl.createProgram()
  if (!program) return null
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null
  gl.useProgram(program)

  // One full-screen triangle (covers the viewport, no overdraw seam).
  const buffer = gl.createBuffer()
  if (!buffer) return null
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW
  )
  const positionLoc = gl.getAttribLocation(program, "a_position")
  gl.enableVertexAttribArray(positionLoc)
  gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0)

  return {
    gl,
    uniforms: {
      resolution: gl.getUniformLocation(program, "u_resolution"),
      time: gl.getUniformLocation(program, "u_time"),
      colorA: gl.getUniformLocation(program, "u_colorA"),
      colorB: gl.getUniformLocation(program, "u_colorB"),
      colorC: gl.getUniformLocation(program, "u_colorC"),
      amplitude: gl.getUniformLocation(program, "u_amplitude"),
    },
  }
}

function supportsWebgl() {
  try {
    const canvas = document.createElement("canvas")
    return !!(canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
  } catch {
    return false
  }
}

export function DuskShader({ className, intensity = "ambient" }: DuskShaderProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const [canAnimate, setCanAnimate] = useState(false)
  const [ready, setReady] = useState(false)

  // Gate once on mount: reduced motion / low-power devices / no WebGL never
  // get the canvas at all — the CSS gradient below is the entire experience.
  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const lowPower = (navigator.hardwareConcurrency ?? 8) < 4
    if (prefersReducedMotion || lowPower || !supportsWebgl()) return

    const el = containerRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setCanAnimate(true)
          observer.disconnect()
        }
      },
      { rootMargin: "200px" }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!canAnimate) return
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const ctx = initGl(canvas)
    if (!ctx) return
    const { gl, uniforms } = ctx

    const amplitude = intensity === "hero" ? 0.18 : 0.08
    const speed = intensity === "hero" ? 1 : 0.55

    const resize = () => {
      const rect = container.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.max(1, Math.round(rect.width * dpr))
      canvas.height = Math.max(1, Math.round(rect.height * dpr))
      gl.viewport(0, 0, canvas.width, canvas.height)
    }
    resize()
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)

    const start = performance.now()
    let frame = 0
    const render = (now: number) => {
      const t = ((now - start) / 1000) * speed
      gl.uniform2f(uniforms.resolution, canvas.width, canvas.height)
      gl.uniform1f(uniforms.time, t)
      gl.uniform1f(uniforms.amplitude, amplitude)
      gl.uniform3f(uniforms.colorA, ...SKY_STOPS_RGB[0])
      gl.uniform3f(uniforms.colorB, ...SKY_STOPS_RGB[1])
      gl.uniform3f(uniforms.colorC, ...SKY_STOPS_RGB[2])
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      frame += 1
      if (frame === 2) setReady(true) // first real frame is on screen — safe to fade in
      rafRef.current = requestAnimationFrame(render)
    }
    rafRef.current = requestAnimationFrame(render)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      resizeObserver.disconnect()
    }
  }, [canAnimate, intensity])

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className ?? ""}`}
      style={{ backgroundImage: CSS_FALLBACK_GRADIENT }}
    >
      {canAnimate && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 size-full transition-opacity duration-700 ease-out"
          style={{ opacity: ready ? 1 : 0 }}
        />
      )}
    </div>
  )
}
