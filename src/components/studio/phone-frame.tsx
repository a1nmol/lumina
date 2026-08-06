"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Heart,
  ImageIcon,
  MessageSquare,
  MoreHorizontal,
  Pause,
  Play,
  PlaySquare,
  Send,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { duration, easing, lamplightPulseS } from "@/lib/motion"
import { cn } from "@/lib/utils"
import type { PostFormat } from "@/app/(app)/studio/types"

import { GenerateSkeleton } from "./generate-skeleton"

/** Matches the Composer design brief's specified "generate moment" spring exactly. */
const GENERATE_POP_SPRING = { type: "spring", stiffness: 300, damping: 20 } as const

const CAROUSEL_PANE_COUNT = 3

export type PhoneFrameStatus = "idle" | "generating" | "ready"

type PhoneFrameProps = {
  format: PostFormat
  status: PhoneFrameStatus
  /** Increments on every completed generation — retriggers the pop/glow and resets the carousel. */
  resultKey: number
  businessName: string
  caption: string
  hashtags: string[]
  imageDescription: string
  /** Real fal.ai image URL, when the backend generated one. Falls back to the gradient placeholder when absent. */
  imageUrl?: string
  /** Rendered slideshow MP4 (src/lib/media/slideshow.ts via /api/slideshow/[id]). When present with format "slideshow", plays instead of the static image block. */
  videoUrl?: string
  microCopy: string
  className?: string
}

function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "LB"
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

function handleFor(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "")
  return `@${slug || "yourbusiness"}`
}

/** Flat, tokenized phone mockup — the Composer's live preview surface. */
export function PhoneFrame({
  format,
  status,
  resultKey,
  businessName,
  caption,
  hashtags,
  imageDescription,
  imageUrl,
  videoUrl,
  microCopy,
  className,
}: PhoneFrameProps) {
  const reduceMotion = useReducedMotion()
  const aspectClassName = format === "slideshow" ? "aspect-[9/16]" : "aspect-[4/5]"
  const handle = handleFor(businessName)

  return (
    <div className={cn("mx-auto w-full max-w-[300px]", className)}>
      {/* Pedestal treatment (Companion C2's "workbench" — item 5): a soft
          cast shadow the phone appears to sit on, plus a gentle perspective
          tilt on hover only (never on load, never looping) — skipped
          entirely under reduced motion via `motion-reduce:`. */}
      <div className="relative transition-transform duration-[var(--duration-slow)] ease-out will-change-transform hover:[transform:perspective(900px)_rotateX(2deg)_rotateY(-4deg)] motion-reduce:transition-none motion-reduce:hover:transform-none">

        <motion.div
          layout
          transition={{ duration: duration.slow, ease: easing.out }}
          className="relative overflow-hidden rounded-[2.25rem] border-[6px] border-border bg-card shadow-raised"
        >
          {/* Notch */}
          <div
            aria-hidden="true"
            className="absolute top-2.5 left-1/2 z-20 h-4 w-20 -translate-x-1/2 rounded-full bg-background/90 ring-1 ring-border"
          />

          {/* Post chrome header */}
          <div className="flex items-center gap-2 px-3 pt-8 pb-2">
            <Avatar size="sm">
              <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">
                {initialsFor(businessName)}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col leading-none">
              <span className="text-xs font-semibold text-foreground">{handle}</span>
              <span className="text-[10px] text-muted-foreground">Just now</span>
            </div>
            <MoreHorizontal aria-hidden="true" className="ml-auto size-4 text-muted-foreground" />
          </div>

          <AnimatePresence mode="wait" initial={false}>
            {status === "generating" ? (
              <motion.div
                key="skeleton"
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={reduceMotion ? undefined : { opacity: 0 }}
                transition={{ duration: duration.base, ease: easing.out }}
              >
                <GenerateSkeleton aspectClassName={aspectClassName} microCopy={microCopy} />
              </motion.div>
            ) : status === "ready" ? (
              <motion.div
                key={`ready-${format}-${resultKey}`}
                initial={reduceMotion ? false : { opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduceMotion ? undefined : { opacity: 0, scale: 0.99 }}
                transition={
                  reduceMotion ? { duration: duration.base, ease: easing.out } : GENERATE_POP_SPRING
                }
              >
                <ReadyContent
                  format={format}
                  caption={caption}
                  hashtags={hashtags}
                  imageDescription={imageDescription}
                  imageUrl={imageUrl}
                  videoUrl={videoUrl}
                  handle={handle}
                  aspectClassName={aspectClassName}
                />
              </motion.div>
            ) : (
              <motion.div
                key="idle"
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={reduceMotion ? undefined : { opacity: 0 }}
                transition={{ duration: duration.base, ease: easing.out }}
              >
                <IdlePlaceholder aspectClassName={aspectClassName} />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Soft brand glow pulse — one shot, never loops. Skipped under reduced motion. */}
        {status === "ready" && !reduceMotion && (
          <motion.div
            key={`glow-${format}-${resultKey}`}
            aria-hidden="true"
            className="pointer-events-none absolute -inset-1 rounded-[2.25rem] shadow-glow"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            // Same duration as the lamplight layer below (review fix) — the
            // two flashes read as ONE generate moment, not staggered blinks.
            transition={{ duration: lamplightPulseS, ease: easing.out }}
          />
        )}

        {/* Lamplight pulse (Companion C2's "generate moment" — item 6): a
            second, brief amber flash layered over the brand glow above when
            a generation lands — "the shop's own light switching on."
            One-shot, never loops; skipped entirely under reduced motion. */}
        {status === "ready" && !reduceMotion && (
          <motion.div
            key={`lamplight-${format}-${resultKey}`}
            aria-hidden="true"
            className="pointer-events-none absolute -inset-1 rounded-[2.25rem] shadow-lamplight"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: lamplightPulseS, ease: easing.out }}
          />
        )}

        {/* Pedestal cast shadow — a soft, static ellipse the phone appears
            to rest on. Purely decorative. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-3 left-1/2 h-4 w-4/5 -translate-x-1/2 rounded-full bg-foreground/10 blur-md"
        />
      </div>
    </div>
  )
}

function IdlePlaceholder({ aspectClassName }: { aspectClassName: string }) {
  return (
    <div className="flex h-full w-full flex-col">
      <div
        className={cn(
          "flex w-full flex-col items-center justify-center gap-2 border-y border-dashed border-border bg-muted/40 px-4 text-center",
          aspectClassName
        )}
      >
        <ImageIcon aria-hidden="true" className="size-8 text-muted-foreground/50" />
        <p className="text-[11px] text-muted-foreground">Your generated post will appear here</p>
      </div>
      <div className="flex items-center gap-3 px-3 pt-2 text-muted-foreground/30">
        <Heart aria-hidden="true" className="size-4" />
        <MessageSquare aria-hidden="true" className="size-4" />
        <Send aria-hidden="true" className="size-4" />
        <Bookmark aria-hidden="true" className="ml-auto size-4" />
      </div>
      <div className="flex flex-col gap-1.5 px-3 pt-2 pb-4">
        <div className="h-2 w-3/5 rounded-full bg-muted/60" />
      </div>
    </div>
  )
}

function ReadyContent({
  format,
  caption,
  hashtags,
  imageDescription,
  imageUrl,
  videoUrl,
  handle,
  aspectClassName,
}: {
  format: PostFormat
  caption: string
  hashtags: string[]
  imageDescription: string
  imageUrl?: string
  videoUrl?: string
  handle: string
  aspectClassName: string
}) {
  return (
    <div className="flex h-full w-full flex-col">
      <div className={cn("relative w-full overflow-hidden", aspectClassName)}>
        {format === "carousel" ? (
          <CarouselImage imageDescription={imageDescription} imageUrl={imageUrl} />
        ) : format === "slideshow" ? (
          videoUrl ? (
            <SlideshowVideo videoUrl={videoUrl} altText={imageDescription || "Slideshow preview"} />
          ) : (
            <ImageBlock
              imageDescription={imageDescription}
              imageUrl={imageUrl}
              badge={
                <span className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full bg-background/80 px-2 py-1 text-[10px] font-medium ring-1 ring-border backdrop-blur-sm">
                  <PlaySquare aria-hidden="true" className="size-3" /> Slideshow
                </span>
              }
            />
          )
        ) : (
          <ImageBlock imageDescription={imageDescription} imageUrl={imageUrl} />
        )}
      </div>
      <div className="flex items-center gap-3 px-3 pt-2 text-foreground">
        <Heart aria-hidden="true" className="size-4" />
        <MessageSquare aria-hidden="true" className="size-4" />
        <Send aria-hidden="true" className="size-4" />
        <Bookmark aria-hidden="true" className="ml-auto size-4" />
      </div>
      <div className="flex flex-col gap-0.5 px-3 pt-1.5 pb-4">
        <p className="line-clamp-2 text-xs text-foreground">
          <span className="font-semibold">{handle}</span> {caption}
        </p>
        {hashtags.length > 0 && (
          <p className="line-clamp-1 text-[11px] text-info">
            {hashtags.map((tag) => `#${tag}`).join(" ")}
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * Plays the rendered slideshow MP4 (muted, looped, no native controls) with
 * a tap-to-toggle-play overlay. Respects `prefers-reduced-motion` by never
 * autoplaying — the user has to tap once to start it either way, but under
 * reduced motion the very first frame also stays fully static (not just
 * "paused after an autoplay flash").
 */
function SlideshowVideo({ videoUrl, altText }: { videoUrl: string; altText: string }) {
  const reduceMotion = useReducedMotion()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    if (reduceMotion) return
    const video = videoRef.current
    if (!video) return
    video.play().catch(() => {
      // Autoplay can be blocked by the browser — the tap overlay still works.
    })
  }, [reduceMotion, videoUrl])

  function toggle() {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      video.play().catch(() => {})
    } else {
      video.pause()
    }
  }

  return (
    <div className="relative h-full w-full bg-muted">
      <video
        ref={videoRef}
        src={videoUrl}
        muted
        loop
        playsInline
        controls={false}
        aria-label={altText}
        className="h-full w-full object-cover"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={isPlaying ? "Pause slideshow preview" : "Play slideshow preview"}
        className="group/video-btn absolute inset-0 flex items-center justify-center bg-transparent outline-none transition-colors duration-150 hover:bg-background/10 focus-visible:bg-background/10 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-full bg-background/80 text-foreground shadow-raised ring-1 ring-border backdrop-blur-sm transition-opacity duration-150",
            isPlaying ? "opacity-0 group-hover/video-btn:opacity-100 group-focus-visible/video-btn:opacity-100" : "opacity-100"
          )}
        >
          {isPlaying ? (
            <Pause aria-hidden="true" className="size-4" />
          ) : (
            <Play aria-hidden="true" className="size-4" />
          )}
        </span>
      </button>
      <span className="pointer-events-none absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full bg-background/80 px-2 py-1 text-[10px] font-medium ring-1 ring-border backdrop-blur-sm">
        <PlaySquare aria-hidden="true" className="size-3" /> Slideshow
      </span>
    </div>
  )
}

function ImageBlock({
  imageDescription,
  imageUrl,
  variant = 0,
  badge,
}: {
  imageDescription: string
  /** Real fal.ai image URL. When present, renders instead of the gradient placeholder. */
  imageUrl?: string
  variant?: number
  badge?: ReactNode
}) {
  if (imageUrl) {
    return (
      <div className="relative h-full w-full overflow-hidden bg-muted">
        {/* fal.ai URLs are remote and arbitrary — a plain <img> is the simplest safe choice (no next.config remotePatterns to maintain). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt={imageDescription} className="h-full w-full object-cover" />
        {badge}
      </div>
    )
  }

  const gradients = [
    "from-primary/30 via-[var(--chart-2)]/20 to-[var(--chart-4)]/20",
    "from-[var(--chart-2)]/25 via-primary/20 to-[var(--chart-3)]/20",
    "from-[var(--chart-4)]/25 via-[var(--chart-3)]/20 to-primary/20",
  ]
  return (
    <div
      className={cn(
        "relative flex h-full w-full items-end justify-center overflow-hidden bg-gradient-to-br p-4 text-center",
        gradients[variant % gradients.length]
      )}
    >
      <ImageIcon
        aria-hidden="true"
        className="absolute top-1/2 left-1/2 size-16 -translate-x-1/2 -translate-y-1/2 text-foreground/10"
      />
      <p className="relative rounded-lg bg-background/70 px-2.5 py-1.5 text-[11px] leading-snug text-foreground/80 backdrop-blur-sm">
        {imageDescription}
      </p>
      {badge}
    </div>
  )
}

function CarouselImage({ imageDescription, imageUrl }: { imageDescription: string; imageUrl?: string }) {
  const [index, setIndex] = useState(0)

  const go = (direction: 1 | -1) => {
    setIndex((current) => (current + direction + CAROUSEL_PANE_COUNT) % CAROUSEL_PANE_COUNT)
  }

  return (
    <div className="group/carousel relative h-full w-full">
      <ImageBlock
        imageDescription={imageDescription}
        imageUrl={index === 0 ? imageUrl : undefined}
        variant={index}
        badge={
          <span className="absolute top-3 right-3 rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-medium ring-1 ring-border backdrop-blur-sm">
            {index + 1}/{CAROUSEL_PANE_COUNT}
          </span>
        }
      />
      <button
        type="button"
        onClick={() => go(-1)}
        aria-label="Previous photo"
        className="absolute top-1/2 left-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground opacity-0 outline-none ring-1 ring-border backdrop-blur-sm transition-opacity duration-150 group-hover/carousel:opacity-100 group-focus-within/carousel:opacity-100 hover:bg-background focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ChevronLeft aria-hidden="true" className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={() => go(1)}
        aria-label="Next photo"
        className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground opacity-0 outline-none ring-1 ring-border backdrop-blur-sm transition-opacity duration-150 group-hover/carousel:opacity-100 group-focus-within/carousel:opacity-100 hover:bg-background focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ChevronRight aria-hidden="true" className="size-3.5" />
      </button>
      <div className="absolute inset-x-0 bottom-2 flex items-center justify-center gap-1">
        {Array.from({ length: CAROUSEL_PANE_COUNT }).map((_, paneIndex) => (
          <button
            key={paneIndex}
            type="button"
            aria-label={`Go to photo ${paneIndex + 1}`}
            aria-current={paneIndex === index}
            onClick={() => setIndex(paneIndex)}
            className={cn(
              "size-1.5 rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
              paneIndex === index ? "bg-background" : "bg-background/40"
            )}
          />
        ))}
      </div>
    </div>
  )
}
