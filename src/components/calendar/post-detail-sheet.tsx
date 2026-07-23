"use client"

// Queue view's post-detail bottom sheet — the reminder-to-post flow's
// "phone-grade" moment: tap a queue card, get everything you need to
// actually go post it by hand (MASTER_PLAN.md §4.B "push → caption copied →
// deep-link → paste"). No social APIs — every action here is client-side or
// a status update the org already owns.

import { useState } from "react"
import { Check, Download, ExternalLink, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { markPostAsPosted } from "@/app/(app)/calendar/actions"
import type { DemoPost, PostPlatform } from "@/app/(app)/calendar/demo-posts"
import { PLATFORM_META } from "@/app/(app)/calendar/platform"
import { thumbnailStyle } from "@/app/(app)/calendar/post-card"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

/**
 * Per-platform "open the app" targets. Custom URI schemes where the OS can
 * resolve an installed app; https fallback where there's no reliable native
 * scheme (Google Business has no consumer deep link). Anchor `href` (not
 * `window.location`) so mobile OSes get the normal chance to intercept it.
 */
const PLATFORM_DEEP_LINKS: Record<PostPlatform, string> = {
  instagram: "instagram://app",
  facebook: "fb://feed",
  tiktok: "tiktok://",
  google_business: "https://business.google.com/",
}

const DOWNLOAD_PX = 1080

/**
 * Demo posts don't carry a real generated image yet — downloads the same
 * brand gradient shown as the card thumbnail, standing in for the actual
 * asset (real media generation already exists in Content Studio; wiring its
 * output through to here is a follow-up, not new scope for this feature).
 */
async function downloadGradientPng(hue: number, filename: string): Promise<void> {
  const canvas = document.createElement("canvas")
  canvas.width = DOWNLOAD_PX
  canvas.height = DOWNLOAD_PX
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas 2D context unavailable")

  const gradient = ctx.createLinearGradient(0, 0, DOWNLOAD_PX, DOWNLOAD_PX)
  gradient.addColorStop(0, `oklch(0.74 0.13 ${hue})`)
  gradient.addColorStop(1, `oklch(0.52 0.19 ${(hue + 45) % 360})`)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, DOWNLOAD_PX, DOWNLOAD_PX)

  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"))
  if (!blob) throw new Error("Failed to encode PNG")

  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

type PostDetailSheetProps = {
  post: DemoPost | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after "Mark as posted" succeeds so the caller can update its local post list. */
  onMarkedPosted: (postId: string) => void
}

/** Bottom sheet (mobile-first): full caption, media preview, and the manual-post action set. */
export function PostDetailSheet({ post, open, onOpenChange, onMarkedPosted }: PostDetailSheetProps) {
  const [savingImage, setSavingImage] = useState(false)
  const [marking, setMarking] = useState(false)

  if (!post) return null

  const hashtagLine =
    post.hashtags && post.hashtags.length > 0
      ? post.hashtags.map((tag) => `#${tag}`).join(" ")
      : null
  const isPosted = post.status === "posted"

  async function handleSaveImage() {
    if (!post) return
    setSavingImage(true)
    try {
      await downloadGradientPng(post.thumbnailHue, `lumina-post-${post.id}.png`)
      toast.success("Image saved")
    } catch {
      toast.error("Couldn't save the image", { description: "Please try again." })
    } finally {
      setSavingImage(false)
    }
  }

  async function handleCopyCaption() {
    if (!post) return
    try {
      const full = hashtagLine ? `${post.caption}\n\n${hashtagLine}` : post.caption
      await navigator.clipboard.writeText(full)
      toast.success("Caption copied", { description: "Paste it into the platform's app to post." })
    } catch {
      toast.error("Couldn't copy caption", { description: "Please try again." })
    }
  }

  async function handleMarkPosted() {
    if (!post || isPosted) return
    setMarking(true)
    try {
      const result = await markPostAsPosted(post.id)
      if (!result.ok) {
        toast.error("Couldn't update this post", { description: "Please try again." })
        return
      }
      onMarkedPosted(post.id)
      toast.success("Marked as posted")
      onOpenChange(false)
    } catch {
      toast.error("Couldn't update this post", { description: "Please try again." })
    } finally {
      setMarking(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-h-[85vh] overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Post details</SheetTitle>
          <SheetDescription>
            Save the image, copy the caption, and post it yourself — or mark it posted once it&rsquo;s live.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4">
          <div
            style={thumbnailStyle(post.thumbnailHue)}
            className="aspect-square w-full overflow-hidden rounded-2xl ring-1 ring-foreground/10"
            aria-hidden="true"
          />

          <div className="flex flex-col gap-1.5">
            <p className="text-sm whitespace-pre-wrap text-foreground">{post.caption}</p>
            {hashtagLine && <p className="text-sm text-primary">{hashtagLine}</p>}
          </div>

          <div className="flex items-center gap-1.5">
            {post.platforms.map((platform) => {
              const Icon = PLATFORM_META[platform].icon
              return (
                <span
                  key={platform}
                  title={PLATFORM_META[platform].label}
                  className="flex size-6 items-center justify-center rounded-full bg-muted text-muted-foreground"
                >
                  <Icon aria-hidden="true" className="size-3.5" />
                </span>
              )
            })}
            {isPosted && (
              <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-success">
                <Check aria-hidden="true" className="size-3.5" />
                Posted
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={handleSaveImage} disabled={savingImage} className="gap-1.5">
              {savingImage ? (
                <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
              ) : (
                <Download aria-hidden="true" className="size-3.5" />
              )}
              Save image
            </Button>
            <Button type="button" variant="outline" onClick={handleCopyCaption} className="gap-1.5">
              Copy caption
            </Button>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Open app to post</span>
            <div className="flex flex-wrap gap-1.5">
              {post.platforms.map((platform) => {
                const Icon = PLATFORM_META[platform].icon
                return (
                  <Button key={platform} variant="ghost" size="sm" className="gap-1.5" render={<a href={PLATFORM_DEEP_LINKS[platform]} rel="noopener noreferrer" />}>
                    <Icon aria-hidden="true" className="size-3.5" />
                    {PLATFORM_META[platform].label}
                    <ExternalLink aria-hidden="true" className="size-3" />
                  </Button>
                )
              })}
            </div>
          </div>
        </div>

        <SheetFooter>
          <Button type="button" onClick={handleMarkPosted} disabled={marking || isPosted} className="gap-1.5">
            {marking ? (
              <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
            ) : (
              <Check aria-hidden="true" className="size-3.5" />
            )}
            {isPosted ? "Already posted" : "Mark as posted"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
