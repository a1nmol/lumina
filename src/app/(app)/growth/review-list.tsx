"use client"

// Reviews list — the Growth page's main surface (docs/design-briefs/
// phase-3-analytics-reviews.md "Reviews"). Rows show star rating + platform
// glyph + reviewer + expandable snippet + sentiment tag + reply-status
// control; the reply flow reuses the inbox AI-draft pattern verbatim
// (src/components/inbox/reply-composer.tsx): prefilled draft, indigo left
// border + "AI draft" label, Send/Regenerate/Discard.

import { useEffect, useMemo, useRef, useState } from "react"
import { useReducedMotion, motion } from "framer-motion"
import { Check, Filter, Loader2, RefreshCw, Reply, Send, Sparkles, Star, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ChannelGlyph } from "@/components/inbox/channel-glyphs"
import { formatRelativeTime } from "@/components/inbox/relative-time"
import { StatusPill, type StatusPillTone } from "@/components/inbox/status-pill"
import { duration, easing } from "@/lib/motion"
import { cn } from "@/lib/utils"
import type { Review, ReviewPlatform } from "@/lib/types"

import { AutoReplySettingsCard } from "./auto-reply-settings-card"
import { draftReviewReplyAction, sendReviewReplyAction, type ReviewAutoReplySettings } from "./actions"

type PlatformFilterValue = "all" | ReviewPlatform
type RatingFilterValue = "all" | "5" | "4" | "le3"

const SENTIMENT_TONE: Record<NonNullable<Review["sentiment"]>, StatusPillTone> = {
  positive: "success",
  neutral: "neutral",
  negative: "danger",
}

function capitalize(value: string): string {
  return value.length > 0 ? value[0].toUpperCase() + value.slice(1) : value
}

type RecoveredDraft = { text: string; isDraftPending: boolean }

interface ReviewsSectionProps {
  initialReviews: Review[]
  isLive: boolean
  initialAutoReplySettings: ReviewAutoReplySettings
}

export function ReviewsSection({ initialReviews, isLive, initialAutoReplySettings }: ReviewsSectionProps) {
  const [reviews, setReviews] = useState<Review[]>(initialReviews)
  const [platformFilter, setPlatformFilter] = useState<PlatformFilterValue>("all")
  const [ratingFilter, setRatingFilter] = useState<RatingFilterValue>("all")
  const [expandedId, setExpandedId] = useState<string | null>(null)
  // Recovered drafts keyed by review id — repopulates the composer with the
  // user's text if a send fails and we revert the optimistic update, so a
  // failed send never silently discards what they wrote.
  const [recoveredDrafts, setRecoveredDrafts] = useState<Record<string, RecoveredDraft>>({})

  const filtered = useMemo(() => {
    return reviews.filter((review) => {
      if (platformFilter !== "all" && review.platform !== platformFilter) return false
      if (ratingFilter === "5" && review.rating !== 5) return false
      if (ratingFilter === "4" && review.rating !== 4) return false
      if (ratingFilter === "le3" && review.rating > 3) return false
      return true
    })
  }, [reviews, platformFilter, ratingFilter])

  function toggleExpand(reviewId: string) {
    setExpandedId((current) => (current === reviewId ? null : reviewId))
  }

  async function handleSend(review: Review, text: string, wasDraftPending: boolean) {
    const previous = reviews
    const optimistic = reviews.map((item) =>
      item.id === review.id
        ? { ...item, reply: text, reply_status: "replied" as const, updated_at: new Date().toISOString() }
        : item
    )
    setReviews(optimistic)
    setExpandedId(null)
    setRecoveredDrafts((prev) => {
      if (!(review.id in prev)) return prev
      const next = { ...prev }
      delete next[review.id]
      return next
    })

    try {
      const saved = await sendReviewReplyAction({ reviewId: review.id, reply: text })
      if (!saved) throw new Error("sendReviewReplyAction returned null")
      setReviews((prev) => prev.map((item) => (item.id === review.id ? saved : item)))
      toast.success("Reply sent")
    } catch {
      setReviews(previous)
      setRecoveredDrafts((prev) => ({ ...prev, [review.id]: { text, isDraftPending: wasDraftPending } }))
      setExpandedId(review.id)
      toast.error("Couldn't send reply", { description: "Please try again." })
    }
  }

  function clearFilters() {
    setPlatformFilter("all")
    setRatingFilter("all")
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={platformFilter} onValueChange={(value) => setPlatformFilter(value as PlatformFilterValue)}>
            <SelectTrigger size="sm" className="w-36" aria-label="Filter by platform">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All platforms</SelectItem>
              <SelectItem value="google">Google</SelectItem>
              <SelectItem value="facebook">Facebook</SelectItem>
            </SelectContent>
          </Select>
          <Select value={ratingFilter} onValueChange={(value) => setRatingFilter(value as RatingFilterValue)}>
            <SelectTrigger size="sm" className="w-36" aria-label="Filter by rating">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ratings</SelectItem>
              <SelectItem value="5">5 stars</SelectItem>
              <SelectItem value="4">4 stars</SelectItem>
              <SelectItem value="le3">3 stars &amp; under</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <AutoReplySettingsCard initialSettings={initialAutoReplySettings} className="w-full sm:w-72" />
      </div>

      {reviews.length === 0 ? (
        <EmptyReviewsState />
      ) : filtered.length === 0 ? (
        <NoFilterResults onClear={clearFilters} />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {filtered.map((review) => (
            <ReviewRow
              key={review.id}
              review={review}
              isExpanded={expandedId === review.id}
              onToggleExpand={() => toggleExpand(review.id)}
              onSend={(text, wasDraftPending) => handleSend(review, text, wasDraftPending)}
              recovered={recoveredDrafts[review.id]}
            />
          ))}
        </ul>
      )}

      {!isLive && (
        <p className="sr-only" aria-live="polite">
          Showing demo reviews — connect Supabase to sync your real reviews.
        </p>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function StarRating({ rating }: { rating: Review["rating"] }) {
  return (
    <span role="img" aria-label={`${rating} of 5 stars`} className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          aria-hidden="true"
          className={cn(
            "size-3.5",
            value <= rating ? "fill-warning text-warning" : "fill-transparent text-muted-foreground/40"
          )}
        />
      ))}
    </span>
  )
}

function SentimentTag({ sentiment }: { sentiment: Review["sentiment"] }) {
  if (!sentiment) return null
  return <StatusPill label={capitalize(sentiment)} tone={SENTIMENT_TONE[sentiment]} />
}

const SNIPPET_EXPAND_THRESHOLD = 140

function ReviewSnippet({ body, reviewId }: { body: string | null; reviewId: string }) {
  const [expanded, setExpanded] = useState(false)

  if (!body) {
    return <p className="text-sm text-muted-foreground italic">No written comment — rating only.</p>
  }

  const id = `review-snippet-${reviewId}`

  return (
    <div className="flex flex-col items-start gap-1">
      <p id={id} className={cn("text-sm text-foreground/90", !expanded && "line-clamp-2")}>
        {body}
      </p>
      {body.length > SNIPPET_EXPAND_THRESHOLD && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded((value) => !value)}
          className="text-xs font-medium text-primary outline-none hover:underline focus-visible:underline"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  )
}

function ReplyStatusControl({
  review,
  isExpanded,
  onToggle,
}: {
  review: Review
  isExpanded: boolean
  onToggle: () => void
}) {
  if (review.reply_status === "replied" || review.reply_status === "auto_replied") {
    return (
      <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-muted px-2.5 text-xs font-medium text-muted-foreground">
        <Check aria-hidden="true" className="size-3.5" />
        {review.reply_status === "auto_replied" ? "Auto-replied" : "Replied"}
      </span>
    )
  }

  if (review.reply_status === "ai_draft") {
    return (
      <button
        type="button"
        aria-expanded={isExpanded}
        onClick={onToggle}
        className="inline-flex h-7 items-center gap-1.5 rounded-full bg-primary/10 px-2.5 text-xs font-medium text-primary outline-none transition-colors hover:bg-primary/15 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
      >
        <Sparkles aria-hidden="true" className="size-3.5" />
        AI draft ready
      </button>
    )
  }

  return (
    <Button type="button" variant="outline" size="sm" aria-expanded={isExpanded} onClick={onToggle} className="gap-1.5">
      <Reply aria-hidden="true" className="size-3.5" />
      Reply
    </Button>
  )
}

function ReviewRow({
  review,
  isExpanded,
  onToggleExpand,
  onSend,
  recovered,
}: {
  review: Review
  isExpanded: boolean
  onToggleExpand: () => void
  onSend: (text: string, wasDraftPending: boolean) => void
  recovered?: RecoveredDraft
}) {
  return (
    <li className="rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-colors">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
          >
            <ChannelGlyph channel={review.platform} className="size-4" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">{review.reviewer_name ?? "Anonymous"}</span>
              <StarRating rating={review.rating} />
              <SentimentTag sentiment={review.sentiment} />
            </div>
            <ReviewSnippet body={review.body} reviewId={review.id} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end">
          <span className="text-xs text-muted-foreground">{formatRelativeTime(review.received_at)}</span>
          <ReplyStatusControl review={review} isExpanded={isExpanded} onToggle={onToggleExpand} />
        </div>
      </div>

      {isExpanded && (
        <ReviewReplyPanel review={review} recovered={recovered} onSend={onSend} onClose={onToggleExpand} />
      )}
    </li>
  )
}

// ---------------------------------------------------------------------------
// Reply composer — mirrors src/components/inbox/reply-composer.tsx's
// AI-draft pattern (prefilled draft, indigo left border, Send/Regenerate/
// Discard) for one review at a time.
// ---------------------------------------------------------------------------

function ReviewReplyPanel({
  review,
  recovered,
  onSend,
  onClose,
}: {
  review: Review
  recovered?: RecoveredDraft
  onSend: (text: string, wasDraftPending: boolean) => void
  onClose: () => void
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isMountedRef = useRef(true)

  const startedWithDraft = recovered ? recovered.isDraftPending : review.reply_status === "ai_draft"
  const initialText = recovered ? recovered.text : startedWithDraft ? (review.reply ?? "") : ""

  const [text, setText] = useState(initialText)
  const [isDraftPending, setIsDraftPending] = useState(startedWithDraft)
  const [isDrafting, setIsDrafting] = useState(false)
  const [isSending, setIsSending] = useState(false)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  async function handleDraft() {
    setIsDrafting(true)
    try {
      const result = await draftReviewReplyAction(review.id)
      if (!isMountedRef.current) return

      if ("error" in result) {
        if (result.error === "allowance") {
          toast.error("You're out of AI reply quota this month", { description: result.message })
        } else {
          toast.error("Couldn't draft a reply", { description: result.message })
        }
        return
      }

      setText(result.draft)
      setIsDraftPending(true)
    } catch {
      if (!isMountedRef.current) return
      toast.error("Couldn't draft a reply", { description: "Please try again." })
    } finally {
      if (isMountedRef.current) setIsDrafting(false)
    }
  }

  function handleDiscard() {
    setText("")
    setIsDraftPending(false)
    textareaRef.current?.focus()
  }

  async function handleSend() {
    const trimmed = text.trim()
    if (!trimmed || isSending) return
    setIsSending(true)
    try {
      await onSend(trimmed, isDraftPending)
    } finally {
      if (isMountedRef.current) setIsSending(false)
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2.5 rounded-xl border border-border bg-muted/30 p-3">
      <div className="relative">
        {isDraftPending && (
          <span className="absolute -top-2.5 left-3 z-10 rounded-full border border-primary/30 bg-card px-1.5 py-px text-[10px] font-medium text-primary">
            AI draft
          </span>
        )}
        <label htmlFor={`review-reply-${review.id}`} className="sr-only">
          Reply to {review.reviewer_name ?? "this review"}
        </label>
        <Textarea
          id={`review-reply-${review.id}`}
          ref={textareaRef}
          autoFocus
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Write a reply…"
          disabled={isSending}
          className={cn("min-h-20 resize-none bg-card", isDraftPending && "border-l-4 border-l-primary pl-3")}
        />
      </div>

      {isDraftPending ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={handleSend} disabled={isSending || !text.trim()} className="gap-1.5">
            {isSending ? (
              <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
            ) : (
              <Send aria-hidden="true" className="size-3.5" />
            )}
            Send
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleDraft}
            disabled={isDrafting || isSending}
            className="gap-1.5"
          >
            {isDrafting ? (
              <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw aria-hidden="true" className="size-3.5" />
            )}
            Regenerate
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={handleDiscard}
            disabled={isSending}
            className="gap-1.5 text-muted-foreground"
          >
            <X aria-hidden="true" className="size-3.5" />
            Discard
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSending} className="ml-auto text-muted-foreground">
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDraft}
            disabled={isDrafting}
            className="gap-1.5"
          >
            {isDrafting ? (
              <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
            ) : (
              <Sparkles aria-hidden="true" className="size-3.5" />
            )}
            {isDrafting ? "Drafting…" : "Draft with AI"}
          </Button>
          <Button type="button" onClick={handleSend} disabled={isSending || !text.trim()} className="ml-auto gap-1.5">
            {isSending ? (
              <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
            ) : (
              <Send aria-hidden="true" className="size-3.5" />
            )}
            Send
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={isSending} className="text-muted-foreground">
            Cancel
          </Button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty states
// ---------------------------------------------------------------------------

function EmptyReviewsState() {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.base, ease: easing.out }}
      className="flex flex-1 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border bg-card/40 px-6 py-16 text-center"
    >
      <span
        aria-hidden="true"
        className="flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-primary/15 via-primary/5 to-[var(--chart-2)]/10 text-primary ring-1 ring-primary/10"
      >
        <Star className="size-6" />
      </span>
      <div className="flex max-w-sm flex-col gap-1.5">
        <h3 className="text-base font-medium text-foreground">No reviews yet</h3>
        <p className="text-sm text-muted-foreground">
          Once customers leave reviews on Google or Facebook, they&apos;ll show up here to read and
          reply to — or ask for your first one with the button above.
        </p>
      </div>
    </motion.div>
  )
}

function NoFilterResults({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-6 py-14 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Filter aria-hidden="true" className="size-4" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">No reviews match</p>
        <p className="text-sm text-muted-foreground">Try a different filter combination.</p>
      </div>
      <Button variant="ghost" size="sm" onClick={onClear}>
        <X aria-hidden="true" data-icon="inline-start" />
        Clear filters
      </Button>
    </div>
  )
}
