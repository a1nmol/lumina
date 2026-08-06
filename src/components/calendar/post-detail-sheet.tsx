"use client"

// Queue view's post-detail bottom sheet — the reminder-to-post flow's
// "phone-grade" moment: tap a queue card, get everything you need to
// actually go post it by hand (MASTER_PLAN.md §4.B "push → caption copied →
// deep-link → paste"). No social APIs — every action here is client-side or
// a status update the org already owns.
//
// Companion C3 — no "I wrote this one" AI attribution here on purpose:
// content_items.model (src/lib/types.ts) is set on every row this app ever
// creates (either a real routed model, or "template-render" for a saved
// template — see src/app/(app)/studio/actions.ts), and CalendarPost/DemoPost
// (this sheet's own display shape) doesn't carry the field at all. There's
// no clean "AI-authored vs not" flag to hang a claim on, so per the brief
// this attribution is skipped rather than added dishonestly to every post.

import { Check, ExternalLink, Loader2, Download } from "lucide-react"
import { toast } from "sonner"
import { useState } from "react"

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
import { cn } from "@/lib/utils"

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

type PostDetailSheetProps = {
  post: DemoPost | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after "Mark as posted" succeeds so the caller can update its local post list. */
  onMarkedPosted: (postId: string) => void
}

/** Bottom sheet (mobile-first): full caption, media preview, and the manual-post action set. */
export function PostDetailSheet({ post, open, onOpenChange, onMarkedPosted }: PostDetailSheetProps) {
  const [marking, setMarking] = useState(false)

  if (!post) return null

  const hashtagLine =
    post.hashtags && post.hashtags.length > 0
      ? post.hashtags.map((tag) => `#${tag}`).join(" ")
      : null
  const isPosted = post.status === "posted"
  // Honesty fix (redesign wave R5): the old "Save image" button always
  // downloaded a freshly-rendered CSS gradient PNG — a fake standing in for
  // real art, even for posts that never had any generated image at all.
  // Only real content_items carry a real fal.ai/rendered-template image URL
  // (see map-content-item.ts); the button now only exists when that's true,
  // and links straight to the real asset instead of faking one client-side.
  const hasRealImage = Boolean(post.imageUrl)

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
            {hasRealImage
              ? "Save the image, copy the caption, and post it yourself — or mark it posted once it’s live."
              : "Copy the caption and post it yourself — or mark it posted once it’s live."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4">
          <div className="aspect-square w-full overflow-hidden rounded-2xl ring-1 ring-border/40">
            {post.imageUrl ? (
              // Real fal.ai/rendered-template URLs are remote and arbitrary —
              // a plain <img> is the simplest safe choice, same call as
              // src/components/studio/phone-frame.tsx's ImageBlock.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={post.imageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div
                style={thumbnailStyle(post.thumbnailHue)}
                className="h-full w-full"
                title="This post doesn't have a saved image yet."
                aria-hidden="true"
              />
            )}
          </div>

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

          <div className={cn("grid gap-2", hasRealImage ? "grid-cols-2" : "grid-cols-1")}>
            {hasRealImage && (
              <Button
                type="button"
                variant="outline"
                className="gap-1.5"
                render={<a href={post.imageUrl} download={`lumina-post-${post.id}.png`} target="_blank" rel="noopener noreferrer" />}
              >
                <Download aria-hidden="true" className="size-3.5" />
                Save image
              </Button>
            )}
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
