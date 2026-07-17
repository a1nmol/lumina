"use client"

import { useEffect, useRef, useState, type MutableRefObject, type RefObject } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
  Bookmark,
  BookmarkCheck,
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

import { generateDraft } from "@/app/(app)/studio/actions"
import { PLATFORMS, type GeneratedDraft, type Platform, type PostFormat } from "@/app/(app)/studio/types"

import { AiAssistRail } from "./ai-assist-rail"
import { FormatSegmented } from "./format-segmented"
import { PhoneFrame, type PhoneFrameStatus } from "./phone-frame"
import { PlatformChip } from "./platform-chip"
import { Shimmer } from "./shimmer"

const MICRO_COPY = ["Sketching layout…", "Rendering image…", "Polishing caption…"]

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

type ComposerProps = {
  businessName: string
}

export function Composer({ businessName }: ComposerProps) {
  const reduceMotion = useReducedMotion()
  const isMountedRef = useRef(true)
  const revealIntervalRef = useRef<RevealInterval | null>(null)
  // Synchronous re-entrancy guard — `status` is React state and can lag a
  // frame behind a rapid double-invocation (e.g. double click / double
  // Enter), so a plain ref is the source of truth for "is a generate call
  // already in flight".
  const isGeneratingRef = useRef(false)

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
  const [resultKey, setResultKey] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [microCopyIndex, setMicroCopyIndex] = useState(0)
  const [announcement, setAnnouncement] = useState("")

  const [savedTemplate, setSavedTemplate] = useState(false)
  const [ratedDown, setRatedDown] = useState(false)
  const [railOpen, setRailOpen] = useState(false)

  useEffect(() => {
    if (status !== "generating") return
    const id = setInterval(() => {
      setMicroCopyIndex((current) => (current + 1) % MICRO_COPY.length)
    }, microCopyCycleMs)
    return () => clearInterval(id)
  }, [status])

  function togglePlatform(platform: Platform) {
    setPlatforms((current) => {
      if (current.includes(platform)) {
        if (current.length === 1) return current // keep at least one selected
        return current.filter((item) => item !== platform)
      }
      return [...current, platform]
    })
  }

  async function handleGenerate() {
    if (isGeneratingRef.current) return
    if (prompt.trim().length === 0) {
      toast.info("Describe your post first", {
        description: "Tell the AI what you'd like to post about.",
      })
      return
    }
    if (platforms.length === 0) return

    isGeneratingRef.current = true
    setStatus("generating")
    setMicroCopyIndex(0)
    setAnnouncement("Generating your post…")
    const nextAttempt = attempt + 1
    setAttempt(nextAttempt)

    try {
      const result = await generateDraft(
        { prompt: prompt.trim(), format, platforms },
        nextAttempt
      )
      if (!isMountedRef.current) return

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
      setSavedTemplate(false)
      setRatedDown(false)
      setResultKey((key) => key + 1)
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

  function handleSaveTemplate() {
    setSavedTemplate(true)
    toast.success("Saved as template", {
      description: "Regenerate from it anytime from Templates.",
    })
  }

  function handleRateDown() {
    setRatedDown(true)
    toast("Thanks for the feedback", {
      description: "We'll use this to improve future drafts.",
    })
  }

  function handleAddToQueue() {
    toast.success("Added to queue", {
      description: "Find it in Calendar → Queue.",
    })
  }

  const canGenerate = prompt.trim().length > 0 && platforms.length > 0 && status !== "generating"
  const hashtagsList = parseHashtags(hashtagsText)

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 pb-8">
      {/* Screen-reader status announcements for the async generate flow. */}
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

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
          <FormatSegmented value={format} onChange={setFormat} disabled={status === "generating"} />
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
            <Button type="button" onClick={handleGenerate} disabled={!canGenerate} className="gap-1.5">
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
          status={status}
          resultKey={resultKey}
          businessName={businessName}
          caption={caption}
          hashtags={hashtagsList}
          imageDescription={draft?.imageDescription ?? ""}
          microCopy={MICRO_COPY[microCopyIndex]}
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
              onClick={handleGenerate}
              className="gap-1.5"
            >
              <RefreshCw
                aria-hidden="true"
                className={cn("size-3.5", status === "generating" && "animate-spin")}
              />
              Regenerate
            </Button>
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
