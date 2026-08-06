"use client"

import type { ReactNode } from "react"
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
  /** Extra actions row (e.g. reminder-to-post) — "full" variant only. */
  actions?: ReactNode
  /**
   * "full" variant only — makes the card itself a click/keyboard target that
   * opens the post-detail sheet (see queue-view.tsx). The card becomes a
   * `role="button"` wrapper around everything except `actions`, which stops
   * propagation so its nested real buttons (Remind me / Copy caption) keep
   * working independently without also opening the sheet.
   */
  onOpenDetail?: () => void
}

/** Calendar post card — compact (month grid) or full (week / queue). Plain img+badge, no phone-frame DOM. */
export function PostCard({ post, variant, isDragging, className, actions, onOpenDetail }: PostCardProps) {
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
              "relative size-12 shrink-0 overflow-hidden rounded-lg ring-1 ring-border/40 transition-shadow duration-150",
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
      role={onOpenDetail ? "button" : undefined}
      tabIndex={onOpenDetail ? 0 : undefined}
      onClick={onOpenDetail}
      onKeyDown={
        onOpenDetail
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                onOpenDetail()
              }
            }
          : undefined
      }
      aria-label={onOpenDetail ? `Open post details: ${snippet(post.caption, 60)}` : undefined}
      className={cn(
        // Companion C3 — "queue cards adopt the floating-panel language":
        // faint edge ring + raised shadow instead of a flat hard border,
        // same treatment as the month grid's own panel above.
        "group/post flex w-full items-start gap-3 rounded-2xl bg-card p-3 text-left shadow-raised ring-1 ring-border/40 transition-shadow duration-150 hover:shadow-overlay",
        isDraft && "border border-dashed border-muted-foreground/40",
        isDragging && "shadow-overlay",
        onOpenDetail &&
          "cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className
      )}
    >
      <div
        style={thumbnailStyle(post.thumbnailHue)}
        className={cn(
          "relative size-14 shrink-0 overflow-hidden rounded-lg ring-1 ring-border/40",
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
        {actions && (
          <div
            className="flex items-center gap-1 pt-1"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}
