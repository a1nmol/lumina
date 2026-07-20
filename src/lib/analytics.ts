import "server-only"

// Org-scoped Analytics loop + Reviews persistence + computation
// (supabase/migrations/0004_analytics.sql). MASTER_PLAN.md §4.E — "loop
// metrics (which post → which calls/leads/bookings)" and "AI insights in
// plain English", §4.F — "review generation" / "review management".
//
// Reads use the RLS-scoped server client (subject to the analytics_events/
// reviews RLS policies), matching src/lib/content.ts and src/lib/frontdesk.ts.
// recordAnalyticsEvent is the one exception — analytics_events has NO insert
// policy for `authenticated` (see the migration), so it must go through the
// service-role admin client, exactly like src/lib/usage.ts#recordUsage.
//
// Demo-safe, but UNLIKE content.ts/frontdesk.ts (which return null/[] and
// let the UI layer compose with src/lib/demo.ts), the functions here fall
// back to the DEMO_* constants directly. That's a deliberate deviation: every
// export in this module is a *computed/aggregated* shape (stats, loop pairs,
// insights), not a raw table row, so there's no sensible "empty" value for a
// demo org to render — the UI should always get a complete, coherent demo
// dataset here, the same way docs/design-briefs/phase-3-analytics-reviews.md
// specifies ("Insights: computed rule-based from demo data now").

import { createClient } from "@/lib/supabase/server"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import { createAdminClient, isSupabaseConfigured as isAdminConfigured } from "@/lib/supabase/admin"
import {
  DEMO_INSIGHTS,
  DEMO_LOOP_PAIRS,
  DEMO_OVERVIEW_STATS,
  DEMO_REVIEWS,
} from "@/lib/demo"
import type {
  AnalyticsEventKind,
  AnalyticsInsight,
  AnalyticsOverviewStats,
  ContentFormat,
  ConversationChannel,
  LoopOutcome,
  LoopOutcomeKind,
  LoopPair,
  PostMetrics,
  Review,
  ReviewPlatform,
  ReviewReplyStatus,
} from "@/lib/types"

// ---------------------------------------------------------------------------
// Recording events (service-role — see module header)
// ---------------------------------------------------------------------------

export interface RecordAnalyticsEventInput {
  kind: AnalyticsEventKind
  contentId?: string | null
  contactId?: string | null
  conversationId?: string | null
  /** Event count (default 1) or a metric value for 'post_metric' rows (see metadata.metric). */
  value?: number
  metadata?: Record<string, unknown>
  /** Defaults to now() — pass through the real event time for backfilled/webhook-sourced events. */
  occurredAt?: string
}

/**
 * Records one analytics event for an org via the service-role admin client
 * (analytics_events has no `authenticated` insert policy — see the
 * migration). No-ops safely when the admin client isn't configured (demo
 * mode / local dev without a service-role key) so system paths (publish
 * jobs, webhook handlers, FrontDesk lead/booking capture) can call this
 * unconditionally.
 */
export async function recordAnalyticsEvent(orgId: string, event: RecordAnalyticsEventInput): Promise<void> {
  if (!isAdminConfigured()) return

  const supabase = createAdminClient()
  const { error } = await supabase.from("analytics_events").insert({
    org_id: orgId,
    kind: event.kind,
    content_id: event.contentId ?? null,
    contact_id: event.contactId ?? null,
    conversation_id: event.conversationId ?? null,
    value: event.value ?? 1,
    metadata: event.metadata ?? {},
    occurred_at: event.occurredAt ?? new Date().toISOString(),
  })

  if (error) {
    throw new Error(`recordAnalyticsEvent: failed to record "${event.kind}" for org ${orgId}: ${error.message}`)
  }
}

// ---------------------------------------------------------------------------
// Overview stats
// ---------------------------------------------------------------------------

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

interface PeriodCounts {
  postsPublished: number
  reach: number
  leads: number
  bookings: number
  reviewsCount: number
}

/** Aggregates the handful of counters getOverviewStats needs from analytics_events for one [start, end) window. */
async function fetchPeriodCounts(
  supabase: SupabaseServerClient,
  orgId: string,
  startIso: string,
  endIso: string
): Promise<PeriodCounts> {
  const { data, error } = await supabase
    .from("analytics_events")
    .select("kind, value, metadata")
    .eq("org_id", orgId)
    .gte("occurred_at", startIso)
    .lt("occurred_at", endIso)

  if (error) {
    throw new Error(`fetchPeriodCounts: failed to load analytics_events for org ${orgId}: ${error.message}`)
  }

  const counts: PeriodCounts = { postsPublished: 0, reach: 0, leads: 0, bookings: 0, reviewsCount: 0 }

  for (const row of data ?? []) {
    const value = Number(row.value ?? 1)
    switch (row.kind as AnalyticsEventKind) {
      case "post_published":
        counts.postsPublished += 1
        break
      case "post_metric": {
        const metric = (row.metadata as Record<string, unknown> | null)?.metric
        if (metric === "reach") counts.reach += value
        break
      }
      case "lead_captured":
        counts.leads += 1
        break
      case "booking_created":
        counts.bookings += 1
        break
      case "review_received":
        counts.reviewsCount += 1
        break
      default:
        break
    }
  }

  return counts
}

/** Percent change of `current` vs `previous` (e.g. 20 = +20%), rounded to the nearest whole percent. 0→0 reads as flat (0%), 0→N reads as +100%. */
function percentDelta(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100
  return Math.round(((current - previous) / previous) * 100)
}

function rangeWindowIso(rangeDays: number): { startIso: string; endIso: string; previousStartIso: string } {
  const end = new Date()
  const start = new Date(end.getTime() - rangeDays * 24 * 60 * 60 * 1000)
  const previousStart = new Date(start.getTime() - rangeDays * 24 * 60 * 60 * 1000)
  return { startIso: start.toISOString(), endIso: end.toISOString(), previousStartIso: previousStart.toISOString() }
}

/**
 * The Analytics dashboard's roll-up stat strip: posts published, reach,
 * leads, bookings, reviews received in the last `rangeDays`, each with a
 * percent-change delta vs. the immediately preceding period of the same
 * length. Falls back to DEMO_OVERVIEW_STATS in demo mode.
 */
export async function getOverviewStats(orgId: string, rangeDays: number): Promise<AnalyticsOverviewStats> {
  if (!isSupabaseConfigured()) return DEMO_OVERVIEW_STATS

  const supabase = await createClient()
  const { startIso, endIso, previousStartIso } = rangeWindowIso(rangeDays)

  const [current, previous] = await Promise.all([
    fetchPeriodCounts(supabase, orgId, startIso, endIso),
    fetchPeriodCounts(supabase, orgId, previousStartIso, startIso),
  ])

  return {
    rangeDays,
    postsPublished: current.postsPublished,
    reach: current.reach,
    leads: current.leads,
    bookings: current.bookings,
    reviewsCount: current.reviewsCount,
    deltas: {
      postsPublished: percentDelta(current.postsPublished, previous.postsPublished),
      reach: percentDelta(current.reach, previous.reach),
      leads: percentDelta(current.leads, previous.leads),
      bookings: percentDelta(current.bookings, previous.bookings),
      reviewsCount: percentDelta(current.reviewsCount, previous.reviewsCount),
    },
  }
}

// ---------------------------------------------------------------------------
// The Loop — post ↔ outcome attribution
// ---------------------------------------------------------------------------

/** 48h post → outcome attribution window. Heuristic MVP (see the module-level TODO below) — refine later with real click/UTM tracking once outcome volume justifies it. */
const LOOP_ATTRIBUTION_WINDOW_MS = 48 * 60 * 60 * 1000

/**
 * Maps a raw analytics_events kind to a LoopOutcomeKind, or null if this
 * event kind isn't a loop-worthy outcome. 'conversation_started' only counts
 * as a "call" outcome when the conversation's channel is 'missed_call' (the
 * missed-call-to-text flow) — a generic new conversation isn't itself
 * evidence a post drove it.
 */
function mapEventToOutcomeKind(
  kind: AnalyticsEventKind,
  conversationId: string | null,
  channelByConversationId: Map<string, ConversationChannel>
): LoopOutcomeKind | null {
  if (kind === "lead_captured") return "lead"
  if (kind === "booking_created") return "booking"
  if (kind === "conversation_started") {
    const channel = conversationId ? channelByConversationId.get(conversationId) : undefined
    return channel === "missed_call" ? "call" : null
  }
  return null
}

/** True when `iso` falls in the half-open window [startIso, endIso) — mirrors fetchPeriodCounts' interval semantics, used to filter DEMO_* data by range in demo mode (see getLoopPairs/getPostMetrics). */
function isWithinWindow(iso: string, startIso: string, endIso: string): boolean {
  const time = new Date(iso).getTime()
  return time >= new Date(startIso).getTime() && time < new Date(endIso).getTime()
}

/**
 * Builds the Analytics "Loop" feed: one entry per published post (within
 * `rangeDays`) that had at least one lead/booking/call attributed to it.
 * Attribution heuristic (MVP, see docs/backend-notes.md): an outcome is
 * attributed to a post when it occurred within 48h after the post's publish
 * time. Falls back to DEMO_LOOP_PAIRS (filtered by `rangeDays`, so the range
 * control visibly works in demo mode too) when Supabase isn't configured.
 */
export async function getLoopPairs(orgId: string, rangeDays: number): Promise<LoopPair[]> {
  if (!isSupabaseConfigured()) {
    const { startIso, endIso } = rangeWindowIso(rangeDays)
    return DEMO_LOOP_PAIRS.filter((pair) => isWithinWindow(pair.post.publishedAt, startIso, endIso))
  }

  const supabase = await createClient()
  const { startIso, endIso } = rangeWindowIso(rangeDays)

  const { data: publishEvents, error: publishError } = await supabase
    .from("analytics_events")
    .select("content_id, occurred_at")
    .eq("org_id", orgId)
    .eq("kind", "post_published")
    .gte("occurred_at", startIso)
    .lt("occurred_at", endIso)
    .not("content_id", "is", null)
    .order("occurred_at", { ascending: false })

  if (publishError) {
    throw new Error(`getLoopPairs: failed to load post_published events for org ${orgId}: ${publishError.message}`)
  }
  if (!publishEvents || publishEvents.length === 0) return []

  const contentIds = Array.from(
    new Set(publishEvents.map((event) => event.content_id).filter((id): id is string => Boolean(id)))
  )

  // Outcomes can land up to LOOP_ATTRIBUTION_WINDOW_MS after the latest post
  // in range, so widen the outcome query end bound accordingly.
  const outcomeEndIso = new Date(new Date(endIso).getTime() + LOOP_ATTRIBUTION_WINDOW_MS).toISOString()

  const [contentResult, outcomeResult] = await Promise.all([
    supabase.from("content_items").select("id, caption, format, platforms").eq("org_id", orgId).in("id", contentIds),
    supabase
      .from("analytics_events")
      .select("kind, contact_id, conversation_id, occurred_at, metadata")
      .eq("org_id", orgId)
      .in("kind", ["lead_captured", "booking_created", "conversation_started"])
      .gte("occurred_at", startIso)
      .lt("occurred_at", outcomeEndIso),
  ])

  if (contentResult.error) {
    throw new Error(`getLoopPairs: failed to load content_items for org ${orgId}: ${contentResult.error.message}`)
  }
  if (outcomeResult.error) {
    throw new Error(`getLoopPairs: failed to load outcome events for org ${orgId}: ${outcomeResult.error.message}`)
  }

  const contentById = new Map((contentResult.data ?? []).map((item) => [item.id, item]))
  const outcomeEvents = outcomeResult.data ?? []

  const contactIds = Array.from(
    new Set(outcomeEvents.map((event) => event.contact_id).filter((id): id is string => Boolean(id)))
  )
  const conversationIds = Array.from(
    new Set(outcomeEvents.map((event) => event.conversation_id).filter((id): id is string => Boolean(id)))
  )

  const [contactsResult, conversationsResult] = await Promise.all([
    contactIds.length > 0
      ? supabase.from("contacts").select("id, name").eq("org_id", orgId).in("id", contactIds)
      : Promise.resolve({ data: [] as { id: string; name: string | null }[], error: null }),
    conversationIds.length > 0
      ? supabase.from("conversations").select("id, channel").eq("org_id", orgId).in("id", conversationIds)
      : Promise.resolve({ data: [] as { id: string; channel: ConversationChannel }[], error: null }),
  ])

  if (contactsResult.error) {
    throw new Error(`getLoopPairs: failed to load contacts for org ${orgId}: ${contactsResult.error.message}`)
  }
  if (conversationsResult.error) {
    throw new Error(`getLoopPairs: failed to load conversations for org ${orgId}: ${conversationsResult.error.message}`)
  }

  const contactNameById = new Map((contactsResult.data ?? []).map((contact) => [contact.id, contact.name]))
  const channelByConversationId = new Map(
    (conversationsResult.data ?? []).map((conversation) => [conversation.id, conversation.channel])
  )

  const pairs: LoopPair[] = []

  for (const publish of publishEvents) {
    if (!publish.content_id) continue
    const content = contentById.get(publish.content_id)
    if (!content) continue

    const publishedAt = publish.occurred_at
    const publishedMs = new Date(publishedAt).getTime()

    const outcomes: LoopOutcome[] = []
    for (const event of outcomeEvents) {
      const deltaMs = new Date(event.occurred_at).getTime() - publishedMs
      if (deltaMs < 0 || deltaMs > LOOP_ATTRIBUTION_WINDOW_MS) continue

      const outcomeKind = mapEventToOutcomeKind(
        event.kind as AnalyticsEventKind,
        event.conversation_id,
        channelByConversationId
      )
      if (!outcomeKind) continue

      const metadataChannel = (event.metadata as Record<string, unknown> | null)?.channel
      const channel: ConversationChannel =
        (event.conversation_id && channelByConversationId.get(event.conversation_id)) ||
        (typeof metadataChannel === "string" ? (metadataChannel as ConversationChannel) : "web_chat")

      outcomes.push({
        kind: outcomeKind,
        contactName: event.contact_id ? contactNameById.get(event.contact_id) ?? null : null,
        channel,
        occurredAt: event.occurred_at,
        deltaHours: Math.round(deltaMs / (60 * 60 * 1000)),
      })
    }

    if (outcomes.length === 0) continue

    outcomes.sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime())

    const kinds = new Set(outcomes.map((outcome) => outcome.kind))
    const matchMethod =
      kinds.size > 1
        ? `matched by ${[...kinds].join(" + ")} within 48h of post`
        : `matched by ${outcomes[0].kind} within 48h of post`

    pairs.push({
      post: {
        id: content.id,
        caption: content.caption,
        format: content.format as ContentFormat,
        platforms: content.platforms ?? [],
        publishedAt,
      },
      outcomes,
      matchMethod,
    })
  }

  return pairs
}

// ---------------------------------------------------------------------------
// Per-post metrics
// ---------------------------------------------------------------------------

function hashSeed(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index++) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return hash
}

/** Deterministic, illustrative reach/engagement/click numbers for demo post cards — NOT real platform data (live mode reads real post_metric events instead). Takes the already-range-filtered loop pairs so the range control visibly works in demo mode too. */
function deriveDemoPostMetrics(pairs: LoopPair[]): PostMetrics[] {
  return pairs.map((pair) => {
    const seed = hashSeed(pair.post.id)
    const reach = 900 + (seed % 2600)
    const engagement = Math.round(reach * (0.04 + (seed % 12) / 200))
    const clicks = Math.round(engagement * 0.35)

    return {
      contentId: pair.post.id,
      caption: pair.post.caption,
      format: pair.post.format,
      platforms: pair.post.platforms,
      publishedAt: pair.post.publishedAt,
      reach,
      engagement,
      clicks,
      loopOutcomeCount: pair.outcomes.length,
    }
  })
}

/**
 * Per-post metric cards for the Analytics dashboard: reach/engagement/clicks
 * (from Ayrshare-sourced 'post_metric' events — TODO(docs/backend-notes.md),
 * currently only populated once a publish/metrics-sync job writes them) plus
 * the loop-outcome count for that post. Falls back to deterministic demo
 * numbers (see deriveDemoPostMetrics, filtered by `rangeDays`) in demo mode.
 *
 * `precomputedPairs`, when given, is used in place of a fresh getLoopPairs
 * call (both to derive loopOutcomeCount and, in demo mode, the range-filtered
 * post set) — callers that already fetched pairs for the same `rangeDays`
 * (e.g. the Analytics page) should pass them to avoid a duplicate fetch.
 * Falls back to fetching its own when omitted, so existing callers keep
 * working unchanged.
 */
export async function getPostMetrics(
  orgId: string,
  rangeDays: number,
  precomputedPairs?: LoopPair[]
): Promise<PostMetrics[]> {
  if (!isSupabaseConfigured()) {
    if (precomputedPairs) return deriveDemoPostMetrics(precomputedPairs)
    const { startIso, endIso } = rangeWindowIso(rangeDays)
    return deriveDemoPostMetrics(DEMO_LOOP_PAIRS.filter((pair) => isWithinWindow(pair.post.publishedAt, startIso, endIso)))
  }

  const supabase = await createClient()
  const { startIso, endIso } = rangeWindowIso(rangeDays)

  const { data: publishEvents, error: publishError } = await supabase
    .from("analytics_events")
    .select("content_id, occurred_at")
    .eq("org_id", orgId)
    .eq("kind", "post_published")
    .gte("occurred_at", startIso)
    .lte("occurred_at", endIso)
    .not("content_id", "is", null)
    .order("occurred_at", { ascending: false })

  if (publishError) {
    throw new Error(`getPostMetrics: failed to load post_published events for org ${orgId}: ${publishError.message}`)
  }
  if (!publishEvents || publishEvents.length === 0) return []

  const contentIds = Array.from(
    new Set(publishEvents.map((event) => event.content_id).filter((id): id is string => Boolean(id)))
  )

  const [contentResult, metricEventsResult, loopPairs] = await Promise.all([
    supabase.from("content_items").select("id, caption, format, platforms").eq("org_id", orgId).in("id", contentIds),
    supabase
      .from("analytics_events")
      .select("content_id, value, metadata")
      .eq("org_id", orgId)
      .eq("kind", "post_metric")
      .in("content_id", contentIds),
    precomputedPairs ? Promise.resolve(precomputedPairs) : getLoopPairs(orgId, rangeDays),
  ])

  if (contentResult.error) {
    throw new Error(`getPostMetrics: failed to load content_items for org ${orgId}: ${contentResult.error.message}`)
  }
  if (metricEventsResult.error) {
    throw new Error(
      `getPostMetrics: failed to load post_metric events for org ${orgId}: ${metricEventsResult.error.message}`
    )
  }

  const contentById = new Map((contentResult.data ?? []).map((item) => [item.id, item]))
  const loopOutcomeCountByContentId = new Map(loopPairs.map((pair) => [pair.post.id, pair.outcomes.length]))

  const metricsByContentId = new Map<string, { reach: number; engagement: number; clicks: number }>()
  for (const event of metricEventsResult.data ?? []) {
    if (!event.content_id) continue
    const entry = metricsByContentId.get(event.content_id) ?? { reach: 0, engagement: 0, clicks: 0 }
    const metric = (event.metadata as Record<string, unknown> | null)?.metric
    const value = Number(event.value ?? 0)
    if (metric === "reach") entry.reach += value
    else if (metric === "engagement") entry.engagement += value
    else if (metric === "clicks") entry.clicks += value
    metricsByContentId.set(event.content_id, entry)
  }

  return publishEvents
    .filter((event): event is { content_id: string; occurred_at: string } => Boolean(event.content_id))
    .map((publish) => {
      const content = contentById.get(publish.content_id)
      const metrics = metricsByContentId.get(publish.content_id) ?? { reach: 0, engagement: 0, clicks: 0 }

      return {
        contentId: publish.content_id,
        caption: content?.caption ?? null,
        format: (content?.format as ContentFormat) ?? "single",
        platforms: content?.platforms ?? [],
        publishedAt: publish.occurred_at,
        reach: metrics.reach,
        engagement: metrics.engagement,
        clicks: metrics.clicks,
        loopOutcomeCount: loopOutcomeCountByContentId.get(publish.content_id) ?? 0,
      }
    })
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

export interface ListReviewsFilter {
  platform?: ReviewPlatform
  rating?: Review["rating"]
}

/** Lists an org's reviews, most recently received first, with optional platform/rating filters. Falls back to DEMO_REVIEWS in demo mode. */
export async function listReviews(orgId: string, filter?: ListReviewsFilter): Promise<Review[]> {
  if (!isSupabaseConfigured()) {
    return DEMO_REVIEWS.filter(
      (review) =>
        (!filter?.platform || review.platform === filter.platform) &&
        (!filter?.rating || review.rating === filter.rating)
    )
  }

  const supabase = await createClient()
  let query = supabase.from("reviews").select().eq("org_id", orgId)

  if (filter?.platform) query = query.eq("platform", filter.platform)
  if (filter?.rating) query = query.eq("rating", filter.rating)

  const { data, error } = await query.order("received_at", { ascending: false })

  if (error) {
    throw new Error(`listReviews: failed to load reviews for org ${orgId}: ${error.message}`)
  }

  return data ?? []
}

export interface SaveReviewReplyInput {
  reply: string
  replyStatus: ReviewReplyStatus
}

/** Saves a (drafted or sent) reply on a review, updating its reply_status. Demo-safe no-op (`null`) when Supabase isn't configured. */
export async function saveReviewReply(
  orgId: string,
  reviewId: string,
  input: SaveReviewReplyInput
): Promise<Review | null> {
  if (!isSupabaseConfigured()) return null

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("reviews")
    .update({ reply: input.reply, reply_status: input.replyStatus })
    .eq("id", reviewId)
    .eq("org_id", orgId)
    .select()
    .maybeSingle()

  if (error) {
    throw new Error(`saveReviewReply: failed to update review ${reviewId}: ${error.message}`)
  }

  return data
}

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const

function capitalize(value: string): string {
  return value.length > 0 ? value[0].toUpperCase() + value.slice(1) : value
}

/**
 * Rule-based, plain-English insights computed from the org's own loop pairs
 * + reviews — honest by construction: every sentence is a direct count/
 * computation over real (or, in demo mode, DEMO_*) data, never a fabricated
 * claim. Returns at most 3 (design brief: "one at a time, queue the rest").
 * Falls back to DEMO_INSIGHTS in demo mode.
 *
 * Insights are always computed over a trailing 30-day window regardless of
 * the page's selected range. `pairs30d`, when given, is used instead of a
 * fresh getLoopPairs(orgId, 30) call — pass the caller's already-fetched
 * pairs ONLY when the caller's own range is 30d (otherwise they cover a
 * different window and computeInsights fetches its own).
 */
export async function computeInsights(orgId: string, pairs30d?: LoopPair[]): Promise<AnalyticsInsight[]> {
  if (!isSupabaseConfigured()) return DEMO_INSIGHTS

  const [loopPairs, reviews] = await Promise.all([
    pairs30d ? Promise.resolve(pairs30d) : getLoopPairs(orgId, 30),
    listReviews(orgId),
  ])
  const insights: AnalyticsInsight[] = []

  // Best weekday by outcome count. Uses the local (process-tz) weekday for
  // each outcome — day boundaries follow the server process tz for now (see
  // the TODO in src/components/analytics/derive-daily-series.ts); an
  // org-timezone setting is the proper future fix.
  const outcomeCountByWeekday = new Map<number, number>()
  for (const pair of loopPairs) {
    for (const outcome of pair.outcomes) {
      const weekday = new Date(outcome.occurredAt).getDay()
      outcomeCountByWeekday.set(weekday, (outcomeCountByWeekday.get(weekday) ?? 0) + 1)
    }
  }
  const bestWeekday = [...outcomeCountByWeekday.entries()].sort((a, b) => b[1] - a[1])[0]
  if (bestWeekday && bestWeekday[1] > 0) {
    const [weekdayIndex, count] = bestWeekday
    const weekdayName = WEEKDAY_NAMES[weekdayIndex]
    insights.push({
      id: "insight-best-weekday",
      text: `${weekdayName} posts have driven ${count} of your tracked outcomes this month — the most of any weekday.`,
      cta: { label: `Plan a ${weekdayName} post`, href: "/calendar" },
    })
  }

  // Best format by outcome count.
  const outcomeCountByFormat = new Map<string, number>()
  for (const pair of loopPairs) {
    outcomeCountByFormat.set(pair.post.format, (outcomeCountByFormat.get(pair.post.format) ?? 0) + pair.outcomes.length)
  }
  const bestFormat = [...outcomeCountByFormat.entries()].sort((a, b) => b[1] - a[1])[0]
  if (bestFormat && bestFormat[1] > 0) {
    const [format, count] = bestFormat
    insights.push({
      id: "insight-best-format",
      text: `${capitalize(format)} posts drove ${count} of your tracked outcomes this month.`,
      cta: { label: `Make another ${format} post`, href: "/studio" },
    })
  }

  // Reviews awaiting a reply (unsent — either no draft yet or an AI draft still pending approval).
  const pendingReviewCount = reviews.filter(
    (review) => review.reply_status === "none" || review.reply_status === "ai_draft"
  ).length
  if (pendingReviewCount > 0) {
    insights.push({
      id: "insight-pending-reviews",
      text: `You have ${pendingReviewCount} review${pendingReviewCount === 1 ? "" : "s"} waiting on a reply.`,
      cta: { label: "Reply to reviews", href: "/growth" },
    })
  }

  return insights.slice(0, 3)
}
