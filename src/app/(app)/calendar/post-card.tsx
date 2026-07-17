"use client"

import { format, parseISO } from "date-fns"
import { CheckCircle2 } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import type { DemoPost } from "./demo-posts"
import { PLATFORM_META } from "./platform"

/** Brand-consistent gradient (same L/C family as the chart tokens, hue varies per post). */
export function thumbnailStyle(hue: number): React.CSSProperties {
  return {
    backgroundImage: `linear-gradient(135deg, oklch(0.74 0.13 ${hue}) 0%, oklch(0.52 0.19 ${
      (hue + 45) % 360
    }) 100%)`,
  }
}

function snippet(caption: string, max: number) {
  if (caption.length <= max) return caption
  return `${caption.slice(0, max).trimEnd()}…`
}

type PostCardVariant = "compact" | "full"

type PostCardProps = {
  post: DemoPost
  variant: PostCardVariant
  /** Visual-only "being dragged" state, applied by the sortable wrapper. */
  isDragging?: boolean
  /** Applies focus-visible ring styling when composed inside a custom drag handle. */
  className?: string
}

/** Calendar post card — compact (month grid) or full (week / queue). Plain img+badge, no phone-frame DOM. */
export function PostCard({ post, variant, isDragging, className }: PostCardProps) {
  const time = format(parseISO(post.date), "h:mm a")
  const fullDate = format(parseISO(post.date), "EEEE, MMMM d 'at' h:mm a")
  const primaryPlatform = post.platforms[0]
  const PrimaryIcon = primaryPlatform ? PLATFORM_META[primaryPlatform].icon : null
  const isDraft = post.status === "draft"
  const isPosted = post.status === "posted"

  if (variant === "compact") {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <div
              className={cn(
                "group/post relative flex w-full flex-col items-start gap-1 rounded-lg text-left outline-none",
                className
              )}
            />
          }
        >
          <div
            style={thumbnailStyle(post.thumbnailHue)}
            className={cn(
              "relative size-12 shrink-0 overflow-hidden rounded-lg ring-1 ring-foreground/10 transition-shadow duration-150",
              isDraft && "border-2 border-dashed border-muted-foreground/60 ring-0",
              isDragging && "shadow-raised"
            )}
          >
            {isPosted && (
              <span
                aria-hidden="true"
                className="absolute top-1 left-1 flex size-2.5 items-center justify-center rounded-full bg-success ring-2 ring-card"
              />
            )}
            {PrimaryIcon && (
              <span
                aria-hidden="true"
                className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full bg-card text-foreground/80 ring-1 ring-border"
              >
                <PrimaryIcon className="size-3" />
              </span>
            )}
          </div>
          <span className="text-[10px] leading-none font-medium tabular-nums text-muted-foreground">
            {time}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" align="start" className="max-w-64">
          <div className="flex flex-col gap-1">
            <span className="font-medium">{fullDate}</span>
            <span className="text-background/80">{snippet(post.caption, 120)}</span>
            <span className="text-background/60 capitalize">
              {post.status} · {post.format} ·{" "}
              {post.platforms.map((p) => PLATFORM_META[p].label).join(", ")}
            </span>
          </div>
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <div
      className={cn(
        "group/post flex w-full items-start gap-3 rounded-xl border border-border bg-card p-3 text-left shadow-soft transition-shadow duration-150 hover:shadow-raised",
        isDraft && "border-dashed",
        isDragging && "shadow-raised",
        className
      )}
    >
      <div
        style={thumbnailStyle(post.thumbnailHue)}
        className={cn(
          "relative size-14 shrink-0 overflow-hidden rounded-lg ring-1 ring-foreground/10",
          isDraft && "border-2 border-dashed border-muted-foreground/60 ring-0"
        )}
      >
        {isPosted && (
          <span
            aria-hidden="true"
            className="absolute top-1 left-1 flex size-2.5 items-center justify-center rounded-full bg-success ring-2 ring-card"
          />
        )}
        {PrimaryIcon && (
          <span
            aria-hidden="true"
            className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full bg-card text-foreground/80 ring-1 ring-border"
          >
            <PrimaryIcon className="size-3" />
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium tabular-nums text-muted-foreground">{time}</span>
          {isPosted && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
              <CheckCircle2 aria-hidden="true" className="size-3" />
              Posted
            </span>
          )}
          {isDraft && (
            <span className="text-xs font-medium text-muted-foreground">Draft</span>
          )}
        </div>
        <p className="line-clamp-2 text-sm text-foreground">{snippet(post.caption, 60)}</p>
        <div className="flex items-center gap-1 pt-0.5">
          {post.platforms.map((platform) => {
            const Icon = PLATFORM_META[platform].icon
            return (
              <span
                key={platform}
                title={PLATFORM_META[platform].label}
                className="flex size-5 items-center justify-center rounded-full bg-muted text-muted-foreground"
              >
                <Icon aria-hidden="true" className="size-3" />
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}
