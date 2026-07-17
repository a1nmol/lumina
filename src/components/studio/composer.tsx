"use client"

import { useEffect, useRef, useState, type MutableRefObject, type RefObject } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
  Bookmark,
  BookmarkCheck,
  Film,
  ListPlus,
  Loader2,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  ThumbsDown,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { duration, easing, microCopyCycleMs, wordRevealMs } from "@/lib/motion"
import { cn } from "@/lib/utils"

import {
  addToQueue,
  generateDraft,
  rateDraft,
  renderSlideshowAction,
  saveDraftAsTemplate,
} from "@/app/(app)/studio/actions"
import {
  PLATFORMS,
  type GeneratedDraft,
  type Platform,
  type PostFormat,
  type StudioTemplate,
} from "@/app/(app)/studio/types"

import { AiAssistRail } from "./ai-assist-rail"
import { FormatSegmented } from "./format-segmented"
import { PhoneFrame, type PhoneFrameStatus } from "./phone-frame"
import { PlatformChip } from "./platform-chip"
import { Shimmer } from "./shimmer"
import { TemplatesPanel } from "./templates-panel"

const MICRO_COPY = ["Sketching layout…", "Rendering image…", "Polishing caption…"]
const SLIDESHOW_MICRO_COPY = ["Rendering slides…", "Stitching video…", "Almost there…"]

type SlideshowRenderStatus = "idle" | "rendering" | "ready"

type RevealInterval = ReturnType<typeof setInterval>

/**
 * Progressively reveals `fullCaption` word-by-word into `setRevealed`. Skips
 * straight to the full text under reduced motion. Any interval already
 * tracked in `intervalRef` is cleared synchronously before starting a new
 * one, and the caller is responsible for clearing `intervalRef` on unmount
 * so a stray tick can never fire after teardown.
 */
function revealCaptionWords(
  fullCaption: string,
  reduceMotion: boolean,
  setRevealed: (value: string) => void,
  mountedRef: RefObject<boolean>,
  intervalRef: MutableRefObject<RevealInterval | null>
): Promise<void> {
  return new Promise((resolve) => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    if (reduceMotion) {
      setRevealed(fullCaption)
      resolve()
      return
    }

    const words = fullCaption.split(" ")
    let index = 0
    setRevealed("")

    const id: RevealInterval = setInterval(() => {
      if (!mountedRef.current) {
        clearInterval(id)
        intervalRef.current = null
        resolve()
        return
      }
      index += 1
      setRevealed(words.slice(0, index).join(" "))
      if (index >= words.length) {
        clearInterval(id)
        intervalRef.current = null
        resolve()
      }
    }, wordRevealMs)
    intervalRef.current = id
  })
}

function parseHashtags(raw: string): string[] {
  return raw
    .split(/[,\s]+/)
    .map((tag) => tag.replace(/^#/, "").trim())
    .filter(Boolean)
}

/** "today 9:00 AM" / "tomorrow 9:00 AM" / "Thu, Jul 17 at 9:00 AM" — for the Add to Queue success toast. */
function describeScheduledAt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "your queue"
  const now = new Date()
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  if (isSameDay(date, now)) return `today ${time}`
  if (isSameDay(date, tomorrow)) return `tomorrow ${time}`
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

type ComposerProps = {
  businessName: string
  /** Saved templates (★ save-as-template) — demo data or Supabase-backed, loaded server-side in page.tsx. */
  templates?: StudioTemplate[]
}

export function Composer({ businessName, templates = [] }: ComposerProps) {
  const reduceMotion = useReducedMotion()
  const isMountedRef = useRef(true)
  const revealIntervalRef = useRef<RevealInterval | null>(null)
  // Synchronous re-entrancy guard — `status` is React state and can lag a
  // frame behind a rapid double-invocation (e.g. double click / double
  // Enter), so a plain ref is the source of truth for "is a generate call
  // already in flight".
  const isGeneratingRef = useRef(false)
  // Bumped every time a new draft is successfully generated (including via
  // "Use template"). A slideshow render captures this value when it starts
  // and, if it no longer matches once the render resolves, the result
  // belongs to a draft that's no longer current — it's discarded without
  // touching state (item 5, Phase 1 security review: stale-render nonce).
  const draftVersionRef = useRef(0)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      if (revealIntervalRef.current) {
        clearInterval(revealIntervalRef.current)
        revealIntervalRef.current = null
      }
    }
  }, [])

  const [prompt, setPrompt] = useState("")
  const [format, setFormat] = useState<PostFormat>("single")
  const [platforms, setPlatforms] = useState<Platform[]>(["instagram"])

  const [status, setStatus] = useState<PhoneFrameStatus>("idle")
  const [draft, setDraft] = useState<GeneratedDraft | null>(null)
  const [caption, setCaption] = useState("")
  const [revealedCaption, setRevealedCaption] = useState("")
  const [hashtagsText, setHashtagsText] = useState("")
  // Present once the current draft is persisted to Supabase (real backend
  // only) — threaded into rate/save-template/queue so they update the same
  // row instead of creating a duplicate.
  const [contentId, setContentId] = useState<string | undefined>(undefined)
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined)
  const [resultKey, setResultKey] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [microCopyIndex, setMicroCopyIndex] = useState(0)
  const [announcement, setAnnouncement] = useState("")

  const [savedTemplate, setSavedTemplate] = useState(false)
  const [ratedDown, setRatedDown] = useState(false)
  const [railOpen, setRailOpen] = useState(false)

  const [slideshowStatus, setSlideshowStatus] = useState<SlideshowRenderStatus>("idle")
  const [slideshowVideoUrl, setSlideshowVideoUrl] = useState<string | undefined>(undefined)
  const [slideshowMicroCopyIndex, setSlideshowMicroCopyIndex] = useState(0)

  useEffect(() => {
    if (status !== "generating") return
    const id = setInterval(() => {
      setMicroCopyIndex((current) => (current + 1) % MICRO_COPY.length)
    }, microCopyCycleMs)
    return () => clearInterval(id)
  }, [status])

  useEffect(() => {
    if (slideshowStatus !== "rendering") return
    const id = setInterval(() => {
      setSlideshowMicroCopyIndex((current) => (current + 1) % SLIDESHOW_MICRO_COPY.length)
    }, microCopyCycleMs)
    return () => clearInterval(id)
  }, [slideshowStatus])

  // A rendered slideshow belongs to the draft it was rendered from —
  // switching away from the slideshow format invalidates it. (A new draft
  // invalidates it too, handled directly in handleGenerate's success path.)
  function handleFormatChange(next: PostFormat) {
    setFormat(next)
    if (next !== "slideshow") {
      setSlideshowStatus("idle")
      setSlideshowVideoUrl(undefined)
    }
  }

  function togglePlatform(platform: Platform) {
    setPlatforms((current) => {
      if (current.includes(platform)) {
        if (current.length === 1) return current // keep at least one selected
        return current.filter((item) => item !== platform)
      }
      return [...current, platform]
    })
  }

  /** ★ Regenerate-from-template: fills the prompt bar from a saved template, then generates immediately. */
  function handleUseTemplate(template: StudioTemplate) {
    if (isGeneratingRef.current) {
      toast.info("Please wait for the current generation to finish")
      return
    }
    const nextPlatforms = template.platforms.length > 0 ? template.platforms : platforms

    setPrompt(template.prompt)
    handleFormatChange(template.format)
    setPlatforms(nextPlatforms)
    void handleGenerate({ prompt: template.prompt, format: template.format, platforms: nextPlatforms })
  }

  /**
   * `overrides` lets handleUseTemplate (Templates panel "Use" → ★
   * regenerate-from-template) generate immediately with a template's
   * prompt/format/platforms without waiting a render for the corresponding
   * `setPrompt`/`setFormat`/`setPlatforms` calls to land in state.
   */
  async function handleGenerate(overrides?: {
    prompt?: string
    format?: PostFormat
    platforms?: Platform[]
  }) {
    if (isGeneratingRef.current) return
    const effectivePrompt = overrides?.prompt ?? prompt
    const effectiveFormat = overrides?.format ?? format
    const effectivePlatforms = overrides?.platforms ?? platforms

    if (effectivePrompt.trim().length === 0) {
      toast.info("Describe your post first", {
        description: "Tell the AI what you'd like to post about.",
      })
      return
    }
    if (effectivePlatforms.length === 0) return

    isGeneratingRef.current = true
    setStatus("generating")
    setMicroCopyIndex(0)
    setAnnouncement("Generating your post…")
    const nextAttempt = attempt + 1
    setAttempt(nextAttempt)

    try {
      const result = await generateDraft(
        { prompt: effectivePrompt.trim(), format: effectiveFormat, platforms: effectivePlatforms },
        nextAttempt
      )
      if (!isMountedRef.current) return

      if ("error" in result) {
        setStatus(draft ? "ready" : "idle")
        setAnnouncement("")
        toast.error("You've hit this month's generation limit", {
          description: result.message,
        })
        return
      }

      setDraft(result)
      await revealCaptionWords(
        result.caption,
        !!reduceMotion,
        setRevealedCaption,
        isMountedRef,
        revealIntervalRef
      )
      if (!isMountedRef.current) return

      setCaption(result.caption)
      setHashtagsText(result.hashtags.join(", "))
      setContentId(result.contentId)
      setImageUrl(result.imageUrl)
      setSavedTemplate(false)
      setRatedDown(false)
      setSlideshowStatus("idle")
      setSlideshowVideoUrl(undefined)
      setResultKey((key) => key + 1)
      draftVersionRef.current += 1
      setStatus("ready")
      setAnnouncement("Draft ready")
      toast.success("Draft ready", {
        description: "Review, edit, and add it to your queue.",
      })
    } catch {
      if (!isMountedRef.current) return
      setStatus(draft ? "ready" : "idle")
      setAnnouncement("")
      toast.error("Couldn't generate that post", { description: "Please try again." })
    } finally {
      isGeneratingRef.current = false
    }
  }

  async function handleSaveTemplate() {
    setSavedTemplate(true)
    try {
      const result = await saveDraftAsTemplate({
        contentId,
        prompt,
        format,
        platforms,
        draft: { caption, hashtags: hashtagsList, imageDescription: draft?.imageDescription ?? "" },
      })
      if (!isMountedRef.current) return
      if (result.ok) {
        toast.success("Saved as template", {
          description: `Saved as "${result.name}" — regenerate from it anytime from Templates.`,
        })
      } else {
        setSavedTemplate(false)
        toast.error("Couldn't save template", { description: "Please try again." })
      }
    } catch {
      if (!isMountedRef.current) return
      setSavedTemplate(false)
      toast.error("Couldn't save template", { description: "Please try again." })
    }
  }

  async function handleRateDown() {
    setRatedDown(true)
    try {
      const result = await rateDraft(contentId, -1)
      if (!isMountedRef.current) return
      if (result.ok) {
        toast("Thanks for the feedback", {
          description: "We'll use this to improve future drafts.",
        })
      } else {
        setRatedDown(false)
        toast.error("Couldn't save your feedback", { description: "Please try again." })
      }
    } catch {
      if (!isMountedRef.current) return
      setRatedDown(false)
      toast.error("Couldn't save your feedback", { description: "Please try again." })
    }
  }

  async function handleRenderSlideshow() {
    if (!draft || format !== "slideshow" || slideshowStatus === "rendering") return

    // Captured now — if a new draft is generated (or a template is used)
    // while this render is in flight, draftVersionRef.current will have
    // moved on by the time this resolves, and the result below is ignored.
    const renderNonce = draftVersionRef.current

    setSlideshowStatus("rendering")
    setSlideshowMicroCopyIndex(0)
    try {
      const result = await renderSlideshowAction(draft)
      if (!isMountedRef.current) return
      if (draftVersionRef.current !== renderNonce) return

      if ("error" in result) {
        setSlideshowStatus("idle")
        if (result.error === "allowance") {
          toast.error("You've hit this month's slideshow limit", { description: result.message })
        } else if (result.error === "ffmpeg-missing") {
          toast.error("Slideshow rendering unavailable", { description: result.message })
        } else if (result.error === "busy") {
          toast.error("A slideshow is already rendering — try again in a moment.")
        } else {
          toast.error("Couldn't render the slideshow", { description: result.message })
        }
        return
      }

      setSlideshowVideoUrl(result.videoUrl)
      setSlideshowStatus("ready")
      toast.success("Slideshow ready", { description: "Tap the preview to play it." })
    } catch {
      if (!isMountedRef.current) return
      if (draftVersionRef.current !== renderNonce) return
      setSlideshowStatus("idle")
      toast.error("Couldn't render the slideshow", { description: "Please try again." })
    }
  }

  async function handleAddToQueue() {
    try {
      const result = await addToQueue({
        contentId,
        prompt,
        format,
        platforms,
        draft: { caption, hashtags: hashtagsList, imageDescription: draft?.imageDescription ?? "", imageUrl },
      })
      if (!isMountedRef.current) return
      if (result.ok) {
        toast.success("Added to queue", {
          description: result.scheduledAt
            ? `Scheduled for ${describeScheduledAt(result.scheduledAt)}.`
            : "Find it in Calendar → Queue.",
        })
      } else {
        toast.error("Couldn't add to queue", { description: "Please try again." })
      }
    } catch {
      if (!isMountedRef.current) return
      toast.error("Couldn't add to queue", { description: "Please try again." })
    }
  }

  const canGenerate = prompt.trim().length > 0 && platforms.length > 0 && status !== "generating"
  const hashtagsList = parseHashtags(hashtagsText)
  const isSlideshowRendering = format === "slideshow" && slideshowStatus === "rendering"
  const phoneFrameStatus: PhoneFrameStatus = isSlideshowRendering ? "generating" : status
  const phoneFrameMicroCopy = isSlideshowRendering
    ? SLIDESHOW_MICRO_COPY[slideshowMicroCopyIndex]
    : MICRO_COPY[microCopyIndex]

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 pb-8">
      {/* Screen-reader status announcements for the async generate flow. */}
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {/* Saved templates — ★ save-as-template / regenerate-from-template */}
      <TemplatesPanel templates={templates} onUse={handleUseTemplate} disabled={status === "generating"} />

      {/* Zone 1 — prompt bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
        <label htmlFor="studio-prompt" className="sr-only">
          Describe the post
        </label>
        <Textarea
          id="studio-prompt"
          autoFocus
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Describe the post…"
          className="min-h-20 resize-none border-none px-0 text-base shadow-none focus-visible:ring-0"
        />
        <div className="flex flex-wrap items-center gap-2">
          <FormatSegmented value={format} onChange={handleFormatChange} disabled={status === "generating"} />
          <div aria-hidden="true" className="h-5 w-px bg-border" />
          <div className="flex flex-wrap gap-1.5">
            {PLATFORMS.map((platform) => (
              <PlatformChip
                key={platform}
                platform={platform}
                active={platforms.includes(platform)}
                showDot={status === "ready"}
                disabled={status === "generating"}
                onToggle={() => togglePlatform(platform)}
              />
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRailOpen(true)}
              className="gap-1.5"
            >
              <SlidersHorizontal aria-hidden="true" className="size-3.5" />
              AI Assist
            </Button>
            <Button type="button" onClick={() => handleGenerate()} disabled={!canGenerate} className="gap-1.5">
              {status === "generating" ? (
                <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
              ) : (
                <Sparkles aria-hidden="true" className="size-3.5" />
              )}
              {status === "generating" ? "Generating…" : "Generate"}
            </Button>
          </div>
        </div>
      </div>

      {/* Zone 2 — content */}
      <div className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,320px)_1fr]">
        <PhoneFrame
          format={format}
          status={phoneFrameStatus}
          resultKey={resultKey}
          businessName={businessName}
          caption={caption}
          hashtags={hashtagsList}
          imageDescription={draft?.imageDescription ?? ""}
          imageUrl={imageUrl}
          videoUrl={format === "slideshow" ? slideshowVideoUrl : undefined}
          microCopy={phoneFrameMicroCopy}
        />

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="studio-caption" className="text-sm font-medium text-foreground">
              Caption
            </label>
            {status === "generating" ? (
              <div className="min-h-16 rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm">
                <ShimmerOrPlaceholder text={revealedCaption} />
              </div>
            ) : (
              <Textarea
                id="studio-caption"
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
                disabled={status === "idle"}
                placeholder="Generate a post to edit its caption here."
              />
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="studio-hashtags" className="text-sm font-medium text-foreground">
              Hashtags
            </label>
            {status === "generating" ? (
              <div className="flex h-8 items-center rounded-lg border border-input bg-transparent px-2.5 text-sm">
                <ShimmerOrPlaceholder text="" placeholder="Generating hashtags…" />
              </div>
            ) : (
              <Input
                id="studio-hashtags"
                value={hashtagsText}
                onChange={(event) => setHashtagsText(event.target.value)}
                disabled={status === "idle"}
                placeholder="freshbaked, cinnamonrolls, sunrisebakery"
              />
            )}
          </div>

          {status === "ready" && draft?.imageDescription && (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Image concept: </span>
              {draft.imageDescription}
            </p>
          )}
        </div>
      </div>

      {/* Zone 3 — sticky action row, once content exists */}
      <AnimatePresence>
        {draft && (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: 8 }}
            transition={{ duration: duration.base, ease: easing.out }}
            className="sticky bottom-4 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/95 px-3 py-2.5 shadow-raised backdrop-blur-sm"
          >
            <Button
              type="button"
              variant={savedTemplate ? "secondary" : "outline"}
              size="sm"
              disabled={status !== "ready" || savedTemplate}
              aria-pressed={savedTemplate}
              onClick={handleSaveTemplate}
              className="gap-1.5"
            >
              {savedTemplate ? (
                <BookmarkCheck aria-hidden="true" className="size-3.5 text-primary" />
              ) : (
                <Bookmark aria-hidden="true" className="size-3.5" />
              )}
              {savedTemplate ? "Saved as template" : "Save as template"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={status !== "ready" || ratedDown}
              aria-pressed={ratedDown}
              onClick={handleRateDown}
              className="gap-1.5"
            >
              <ThumbsDown
                aria-hidden="true"
                className={cn("size-3.5", ratedDown && "fill-current text-muted-foreground")}
              />
              {ratedDown ? "Feedback recorded" : "Not quite right"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={status === "generating"}
              onClick={() => handleGenerate()}
              className="gap-1.5"
            >
              <RefreshCw
                aria-hidden="true"
                className={cn("size-3.5", status === "generating" && "animate-spin")}
              />
              Regenerate
            </Button>
            {format === "slideshow" && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={status !== "ready" || slideshowStatus === "rendering"}
                onClick={handleRenderSlideshow}
                className="gap-1.5"
              >
                {slideshowStatus === "rendering" ? (
                  <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                ) : (
                  <Film aria-hidden="true" className="size-3.5" />
                )}
                {slideshowStatus === "rendering"
                  ? "Rendering…"
                  : slideshowStatus === "ready"
                    ? "Re-render slideshow"
                    : "Render slideshow"}
              </Button>
            )}
            <Button
              type="button"
              disabled={status !== "ready"}
              onClick={handleAddToQueue}
              className="ml-auto gap-1.5"
            >
              <ListPlus aria-hidden="true" className="size-3.5" />
              Add to Queue
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <AiAssistRail
        open={railOpen}
        onOpenChange={setRailOpen}
        caption={caption}
        disabled={status !== "ready"}
        onApply={(next) => setCaption(next)}
      />
    </div>
  )
}

function ShimmerOrPlaceholder({ text, placeholder = "Generating caption…" }: { text: string; placeholder?: string }) {
  return <Shimmer>{text || placeholder}</Shimmer>
}
