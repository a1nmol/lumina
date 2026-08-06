"use client"

import { format, parseISO } from "date-fns"
import { GalleryHorizontal, LayoutGrid, MonitorPlay, Target, type LucideIcon } from "lucide-react"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { PostMetrics } from "@/lib/types"

import { platformMeta, primaryPlatformMeta } from "./platform-meta"
import { thumbnailStyle } from "./seeded"

const FORMAT_META: Record<PostMetrics["format"], { label: string; icon: LucideIcon }> = {
  single: { label: "Single image", icon: LayoutGrid },
  carousel: { label: "Carousel", icon: GalleryHorizontal },
  slideshow: { label: "Slideshow", icon: MonitorPlay },
}

function snippet(caption: string | null, max: number): string {
  if (!caption) return "(no caption)"
  if (caption.length <= max) return caption
  return `${caption.slice(0, max).trimEnd()}…`
}

type PostMetricCardProps = {
  metrics: PostMetrics
  className?: string
}

/** Per-post metric card: max 3 numbers on the face (reach/engagement/clicks) + a loop-outcome chip. The rest lives in a Sheet. */
export function PostMetricCard({ metrics, className }: PostMetricCardProps) {
  const primaryPlatform = primaryPlatformMeta(metrics.platforms)
  const PrimaryIcon = primaryPlatform.icon
  const FormatIcon = FORMAT_META[metrics.format].icon
  const publishedDate = format(parseISO(metrics.publishedAt), "MMM d")

  return (
    <div
      className={cn(
        "group/post-card flex flex-col gap-3 rounded-2xl bg-card p-3 shadow-raised ring-1 ring-border/40 transition-shadow duration-200 hover:shadow-overlay",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div
          style={thumbnailStyle(metrics.contentId)}
          className="relative size-12 shrink-0 overflow-hidden rounded-lg ring-1 ring-foreground/10"
        >
          <span
            aria-hidden="true"
            className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full bg-card text-foreground/80 ring-1 ring-border"
          >
            <PrimaryIcon aria-hidden="true" className="size-3" />
          </span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="line-clamp-2 text-sm text-foreground">{snippet(metrics.caption, 72)}</p>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <FormatIcon aria-hidden="true" className="size-3" />
            {FORMAT_META[metrics.format].label} · {publishedDate}
          </span>
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-2 text-center">
        <div className="flex flex-col gap-0.5 rounded-lg bg-muted/50 py-1.5">
          <dt className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Reach</dt>
          <dd className="text-sm font-semibold tabular-nums text-foreground">
            {metrics.reach.toLocaleString()}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5 rounded-lg bg-muted/50 py-1.5">
          <dt className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Eng.</dt>
          <dd className="text-sm font-semibold tabular-nums text-foreground">
            {metrics.engagement.toLocaleString()}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5 rounded-lg bg-muted/50 py-1.5">
          <dt className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Clicks</dt>
          <dd className="text-sm font-semibold tabular-nums text-foreground">
            {metrics.clicks.toLocaleString()}
          </dd>
        </div>
      </dl>

      <div className="flex items-center justify-between gap-2">
        {metrics.loopOutcomeCount > 0 ? (
          <span className="inline-flex h-6 w-fit items-center gap-1.5 rounded-full bg-success/10 px-2.5 text-xs font-medium text-success">
            <Target aria-hidden="true" className="size-3.5" />
            {metrics.loopOutcomeCount} outcome{metrics.loopOutcomeCount === 1 ? "" : "s"}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">No tracked outcomes yet</span>
        )}

        <Sheet>
          <SheetTrigger render={<Button variant="ghost" size="sm" />}>Details</SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Post details</SheetTitle>
              <SheetDescription>{publishedDate} · {FORMAT_META[metrics.format].label}</SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-4 px-4 pb-4">
              <div
                style={thumbnailStyle(metrics.contentId)}
                className="h-32 w-full shrink-0 rounded-lg ring-1 ring-foreground/10"
              />
              <p className="text-sm text-foreground">{metrics.caption ?? "(no caption)"}</p>

              <div className="flex flex-wrap items-center gap-1.5">
                {metrics.platforms.length > 0 ? (
                  metrics.platforms.map((platform) => {
                    const meta = platformMeta(platform)
                    const Icon = meta.icon
                    return (
                      <span
                        key={platform}
                        className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
                      >
                        <Icon aria-hidden="true" className="size-3.5" />
                        {meta.label}
                      </span>
                    )
                  })
                ) : (
                  <span className="text-xs text-muted-foreground">No platforms recorded</span>
                )}
              </div>

              <dl className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-0.5 rounded-lg bg-muted/50 p-3">
                  <dt className="text-xs text-muted-foreground">Reach</dt>
                  <dd className="text-lg font-semibold tabular-nums text-foreground">
                    {metrics.reach.toLocaleString()}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5 rounded-lg bg-muted/50 p-3">
                  <dt className="text-xs text-muted-foreground">Engagement</dt>
                  <dd className="text-lg font-semibold tabular-nums text-foreground">
                    {metrics.engagement.toLocaleString()}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5 rounded-lg bg-muted/50 p-3">
                  <dt className="text-xs text-muted-foreground">Clicks</dt>
                  <dd className="text-lg font-semibold tabular-nums text-foreground">
                    {metrics.clicks.toLocaleString()}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5 rounded-lg bg-muted/50 p-3">
                  <dt className="text-xs text-muted-foreground">Loop outcomes</dt>
                  <dd className="text-lg font-semibold tabular-nums text-foreground">
                    {metrics.loopOutcomeCount}
                  </dd>
                </div>
              </dl>

              {metrics.loopOutcomeCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  See exactly who this post brought in on the Loop tab.
                </p>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  )
}
