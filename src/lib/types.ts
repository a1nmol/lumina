// Hand-written TypeScript types mirroring supabase/migrations/0001_foundation.sql.
// Keep in sync with the SQL by hand (no codegen yet).

export type OrgRole = "owner" | "admin" | "member"

export type Org = {
  id: string
  name: string
  slug: string
  created_at: string
}

export type OrgMember = {
  org_id: string
  user_id: string
  role: OrgRole
  created_at: string
}

/** Shape of `plans.limits` jsonb. All fields optional so plans can evolve. */
export type PlanLimits = {
  content_generations?: number
  images?: number
  slideshows?: number
  ai_replies?: number
  /** Spend guard — hard ceiling on cost_usd per calendar month. */
  spend_cap_usd?: number
  [key: string]: number | undefined
}

export type Plan = {
  id: string
  name: string
  monthly_price_cents: number
  limits: PlanLimits
}

/** Feature flags gate access to whole features (independent of usage limits). */
export type FeatureFlags = {
  [flag: string]: boolean
}

export type Entitlements = {
  org_id: string
  plan_id: string
  feature_flags: FeatureFlags
  /** Per-org overrides merged on top of the plan's limits/flags. */
  overrides: Partial<PlanLimits> & { feature_flags?: FeatureFlags }
  updated_at: string
}

/** Metered usage/cost feature keys. Matches PlanLimits keys minus spend_cap_usd. */
export type UsageFeature =
  | "content_generations"
  | "images"
  | "slideshows"
  | "ai_replies"
  | (string & {})

export type UsageEvent = {
  id: number
  org_id: string
  feature: UsageFeature
  model: string | null
  units: number
  cost_usd: number
  metadata: Record<string, unknown>
  created_at: string
}

export type BusinessHours = {
  [day: string]: { open: string; close: string; closed?: boolean } | undefined
}

export type BusinessService = {
  name: string
  price?: string
  description?: string
  duration_minutes?: number
}

export type BusinessFaq = {
  question: string
  answer: string
}

export type BrandKit = {
  primary_color?: string
  logo_url?: string
  fonts?: string[]
  voice_keywords?: string[]
}

export type ConnectedChannels = {
  google_business?: boolean
  facebook?: boolean
  instagram?: boolean
  tiktok?: boolean
  sms?: boolean
  email?: boolean
  web_chat?: boolean
  [channel: string]: boolean | undefined
}

export type BusinessBrain = {
  org_id: string
  business_name: string | null
  category: string | null
  description: string | null
  hours: BusinessHours
  services: BusinessService[]
  prices: Record<string, string>
  faq: BusinessFaq[]
  tone: string | null
  brand_kit: BrandKit
  connected_channels: ConnectedChannels
  onboarding_step: number
  completed: boolean
  updated_at: string
  /** Org-wide default AI autonomy for NEW conversations (migration 0011). */
  frontdesk_auto_reply: boolean
  /** Honest-AI intro (migration 0013): one-time per-session disclosure before AI auto-replies. */
  ai_intro_enabled: boolean
  ai_intro_text: string | null
  /** Commander update (migration 0015): AI never self-escalates into silence; topic-level deferral only. */
  ai_always_on: boolean
}

// ---------------------------------------------------------------------------
// Content Studio (Phase 1) — mirrors supabase/migrations/0002_content.sql.
// ---------------------------------------------------------------------------

export type ContentFormat = "single" | "carousel" | "slideshow"

export type ContentStatus = "draft" | "queued" | "scheduled" | "posted"

export type ContentRating = -1 | 0 | 1

export type ContentItem = {
  id: string
  org_id: string
  prompt: string | null
  caption: string | null
  hashtags: string[]
  format: ContentFormat
  /** Platform ids (e.g. "instagram", "facebook") — kept as plain strings here to avoid a UI->lib type dependency. */
  platforms: string[]
  image_description: string | null
  /** Generated/attached media (images, slideshow frames, video) for this post. */
  media_urls: unknown[]
  model: string | null
  cost_usd: number
  rating: ContentRating
  status: ContentStatus
  scheduled_at: string | null
  created_at: string
  updated_at: string
}

export type Template = {
  id: string
  org_id: string
  name: string
  source_content_id: string | null
  prompt: string | null
  caption: string | null
  hashtags: string[]
  format: ContentFormat
  platforms: string[]
  created_at: string
}

export type MediaKind = "image" | "video" | "audio"

export type MediaAsset = {
  id: string
  org_id: string
  content_id: string | null
  kind: MediaKind
  url: string
  provider: string | null
  cost_usd: number
  metadata: Record<string, unknown>
  created_at: string
}

// ---------------------------------------------------------------------------
// Unified Inbox + FrontDesk + CRM (Phase 2) — mirrors supabase/migrations/0003_frontdesk.sql.
// ---------------------------------------------------------------------------

/** Where a contact/conversation originated. 'manual' is CRM-only (no conversation carries it). */
export type ContactSource =
  | "web_chat"
  | "form"
  | "sms"
  | "email"
  | "instagram"
  | "facebook"
  | "google"
  | "missed_call"
  | "manual"

/** The channel a conversation is happening on — ContactSource minus 'manual'. */
export type ConversationChannel = Exclude<ContactSource, "manual">

export type ContactStatus = "lead" | "contacted" | "booked" | "customer"

export type Contact = {
  id: string
  org_id: string
  name: string | null
  phone: string | null
  email: string | null
  source: ContactSource
  status: ContactStatus
  tags: string[]
  notes: string | null
  custom: Record<string, unknown>
  created_at: string
  updated_at: string
  /** Person-level AI memory across conversations (migration 0016) — see src/lib/ai/conversation-memory.ts. */
  ai_memory: Record<string, unknown> | null
  /** VIP (migration 0016): AI drafts but never auto-sends; owner gets an instant alert. */
  is_vip: boolean
}

export type ConversationStatus = "open" | "pending" | "resolved"

/**
 * Named AI-transparency states (never a numeric confidence score) — see
 * docs/design-briefs/phase-2-inbox-frontdesk-crm.md "AI transparency rules".
 * ai_answered = AI auto-sent a reply; ai_draft = AI drafted, needs review;
 * escalated = AI couldn't help, flagged for a human; human = no AI involved.
 */
export type ConversationAiState = "ai_answered" | "ai_draft" | "escalated" | "human"

export type Conversation = {
  id: string
  org_id: string
  contact_id: string
  channel: ConversationChannel
  status: ConversationStatus
  ai_state: ConversationAiState
  /** Per-thread AI autonomy: 'auto' = AI may send replies itself; 'off' = drafts only, never sends. Migration 0011. */
  ai_mode: ConversationAiMode
  last_message_at: string | null
  unread: boolean
  created_at: string
  updated_at: string
  /** Rolling structured conversation memory (migration 0015) — see src/lib/ai/conversation-memory.ts. */
  ai_memory: Record<string, unknown> | null
}

export type ConversationAiMode = "auto" | "off"

export type MessageDirection = "inbound" | "outbound"

export type MessageKind = "message" | "note"

export type Message = {
  id: string
  org_id: string
  conversation_id: string
  direction: MessageDirection
  kind: MessageKind
  body: string | null
  ai_handled: boolean
  model: string | null
  cost_usd: number
  metadata: Record<string, unknown>
  created_at: string
}

export type AppointmentStatus = "scheduled" | "completed" | "cancelled" | "no_show"

export type Appointment = {
  id: string
  org_id: string
  contact_id: string
  starts_at: string
  ends_at: string | null
  service: string | null
  status: AppointmentStatus
  notes: string | null
  created_at: string
  updated_at: string
}

/** supabase/migrations/0009_org_phone_numbers.sql — maps a Twilio number (E.164) to the org it's provisioned for. Provisioned by the platform admin/CLI, not end users. */
export type OrgPhoneNumber = {
  id: string
  org_id: string
  phone_number: string
  twilio_sid: string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Analytics loop + Reviews (Phase 3) — mirrors supabase/migrations/0004_analytics.sql.
// ---------------------------------------------------------------------------

/**
 * What an analytics_events row represents. 'post_published'/'post_metric'
 * are the outbound (Content) half of the loop; the rest are the inbound
 * (FrontDesk) half — see MASTER_PLAN.md §1's loop diagram.
 */
export type AnalyticsEventKind =
  | "post_published"
  | "post_metric"
  | "widget_open"
  | "conversation_started"
  | "lead_captured"
  | "booking_created"
  | "review_received"

export type AnalyticsEvent = {
  id: number
  org_id: string
  kind: AnalyticsEventKind
  content_id: string | null
  contact_id: string | null
  conversation_id: string | null
  value: number
  metadata: Record<string, unknown>
  occurred_at: string
}

export type ReviewPlatform = "google" | "facebook"

export type ReviewSentiment = "positive" | "neutral" | "negative"

export type ReviewReplyStatus = "none" | "ai_draft" | "replied" | "auto_replied"

export type Review = {
  id: string
  org_id: string
  platform: ReviewPlatform
  reviewer_name: string | null
  rating: 1 | 2 | 3 | 4 | 5
  body: string | null
  sentiment: ReviewSentiment | null
  reply: string | null
  reply_status: ReviewReplyStatus
  received_at: string
  created_at: string
  updated_at: string
}

/** The Push API's PushSubscriptionJSON["keys"] shape — always exactly these two, base64url-encoded. */
export type PushSubscriptionKeys = {
  p256dh: string
  auth: string
}

/** supabase/migrations/0006_push_subscriptions.sql — one row per browser/device Web Push subscription. */
export type PushSubscriptionRow = {
  id: string
  org_id: string
  user_id: string
  endpoint: string
  keys: PushSubscriptionKeys
  created_at: string
}

/** supabase/migrations/0007_early_access_leads.sql — one row per landing-page "pilot menu" form submission. */
export type EarlyAccessLead = {
  id: string
  business_name: string
  email: string
  created_at: string
}

/**
 * 'meta' = Facebook Page (+ its linked Instagram Business account, when
 * present) via the Facebook Login dialog (src/lib/social/meta.ts). 'instagram'
 * = an Instagram professional account connected directly via Instagram
 * Business Login (src/lib/social/instagram.ts) — no Facebook Page required.
 * See supabase/migrations/0010_social_connections_instagram.sql for the
 * column-reuse convention on 'instagram' rows.
 */
export type SocialProvider = "meta" | "instagram"

/** supabase/migrations/0008_social_connections.sql — one row per connected Facebook Page (+ its linked Instagram Business account, when present). Connection layer only — publishing/insights are a later wave (MASTER_PLAN.md §4.B/§4.E). */
export type SocialConnection = {
  id: string
  org_id: string
  provider: SocialProvider
  page_id: string
  page_name: string | null
  ig_user_id: string | null
  ig_username: string | null
  /** Long-lived Page access token — never sent to the client, only read server-side via the service-role admin client. */
  access_token: string
  token_expires_at: string | null
  connected_by: string | null
  created_at: string
  updated_at: string
}

/**
 * Composed (non-table) analytics shapes returned by src/lib/analytics.ts and
 * mirrored by the DEMO_* fallbacks in src/lib/demo.ts — kept here (rather
 * than as local interfaces in analytics.ts) so demo.ts can type its exports
 * without importing the server-only analytics.ts module.
 */

export type AnalyticsOverviewStats = {
  rangeDays: number
  postsPublished: number
  reach: number
  leads: number
  bookings: number
  reviewsCount: number
  /** Percent change vs. the immediately preceding period of the same length (e.g. 20 = +20%, -15 = -15%). */
  deltas: {
    postsPublished: number
    reach: number
    leads: number
    bookings: number
    reviewsCount: number
  }
}

export type LoopOutcomeKind = "lead" | "booking" | "call"

/** One inbound outcome (call/lead/booking) attributed to a post. */
export type LoopOutcome = {
  kind: LoopOutcomeKind
  contactName: string | null
  channel: ConversationChannel
  occurredAt: string
  /** Hours between the post's publishedAt and this outcome's occurredAt — always shown, never a bare count (design brief "credibility maker"). */
  deltaHours: number
}

/** The minimal post summary shown on the source side of a loop pair. */
export type LoopPostSummary = {
  id: string
  caption: string | null
  format: ContentFormat
  platforms: string[]
  publishedAt: string
}

/** One source-post + outcome-chips pair for the Analytics "Loop" view. */
export type LoopPair = {
  post: LoopPostSummary
  outcomes: LoopOutcome[]
  /** Human-readable attribution transparency caption, e.g. "matched by lead within 48h of post". */
  matchMethod: string
}

/** Per-post metric card data (max 3 numbers on the face + loop-outcome count, per the design brief). */
export type PostMetrics = {
  contentId: string
  caption: string | null
  format: ContentFormat
  platforms: string[]
  publishedAt: string
  reach: number
  engagement: number
  clicks: number
  loopOutcomeCount: number
}

/** One rule-based, plain-English AI insight with a single specific CTA. */
export type AnalyticsInsight = {
  id: string
  text: string
  cta: { label: string; href: string }
}

/** A conversation joined with a few contact fields, for thread-list rendering. */
export type ConversationWithContact = Conversation & {
  contact_name: string | null
  contact_phone: string | null
  contact_email: string | null
  /** Mirrors contacts.is_vip (migration 0016) — lets the thread list badge a VIP contact's threads without loading the full contact. */
  contact_is_vip: boolean
}

/** A conversation with its full message history + contact, for the detail pane. */
export type ConversationDetail = ConversationWithContact & {
  messages: Message[]
  contact: Contact | null
}

/** One entry in a contact's merged chronological activity timeline. */
export type ContactTimelineEvent =
  | { type: "message"; at: string; message: Message; conversationId: string; channel: ConversationChannel }
  | { type: "appointment"; at: string; appointment: Appointment }
  | { type: "status_change"; at: string; status: ContactStatus }

export type ContactWithTimeline = {
  contact: Contact
  timeline: ContactTimelineEvent[]
}

/**
 * Minimal `Database`-lite shape for use with the Supabase JS client generics.
 * Includes the empty `Relationships`/`Views`/`Functions` members the
 * supabase-js/postgrest-js generics require, even though we don't declare any
 * (we don't use PostgREST embedded-resource selects in this codebase).
 */
export interface Database {
  public: {
    Tables: {
      orgs: {
        Row: Org
        Insert: Partial<Org> & Pick<Org, "name" | "slug">
        Update: Partial<Org>
        Relationships: []
      }
      org_members: {
        Row: OrgMember
        Insert: Partial<OrgMember> & Pick<OrgMember, "org_id" | "user_id" | "role">
        Update: Partial<OrgMember>
        Relationships: []
      }
      plans: {
        Row: Plan
        Insert: Plan
        Update: Partial<Plan>
        Relationships: []
      }
      entitlements: {
        Row: Entitlements
        Insert: Partial<Entitlements> & Pick<Entitlements, "org_id">
        Update: Partial<Entitlements>
        Relationships: []
      }
      usage_events: {
        Row: UsageEvent
        Insert: Partial<UsageEvent> & Pick<UsageEvent, "org_id" | "feature">
        Update: Partial<UsageEvent>
        Relationships: []
      }
      business_brain: {
        Row: BusinessBrain
        Insert: Partial<BusinessBrain> & Pick<BusinessBrain, "org_id">
        Update: Partial<BusinessBrain>
        Relationships: []
      }
      content_items: {
        Row: ContentItem
        Insert: Partial<ContentItem> & Pick<ContentItem, "org_id" | "format">
        Update: Partial<ContentItem>
        Relationships: []
      }
      templates: {
        Row: Template
        Insert: Partial<Template> & Pick<Template, "org_id" | "name" | "format">
        Update: Partial<Template>
        Relationships: []
      }
      media_assets: {
        Row: MediaAsset
        Insert: Partial<MediaAsset> & Pick<MediaAsset, "org_id" | "kind" | "url">
        Update: Partial<MediaAsset>
        Relationships: []
      }
      contacts: {
        Row: Contact
        Insert: Partial<Contact> & Pick<Contact, "org_id" | "source">
        Update: Partial<Contact>
        Relationships: []
      }
      conversations: {
        Row: Conversation
        Insert: Partial<Conversation> & Pick<Conversation, "org_id" | "contact_id" | "channel">
        Update: Partial<Conversation>
        Relationships: []
      }
      messages: {
        Row: Message
        Insert: Partial<Message> & Pick<Message, "org_id" | "conversation_id" | "direction">
        Update: Partial<Message>
        Relationships: []
      }
      appointments: {
        Row: Appointment
        Insert: Partial<Appointment> & Pick<Appointment, "org_id" | "contact_id" | "starts_at">
        Update: Partial<Appointment>
        Relationships: []
      }
      analytics_events: {
        Row: AnalyticsEvent
        Insert: Partial<AnalyticsEvent> & Pick<AnalyticsEvent, "org_id" | "kind">
        Update: Partial<AnalyticsEvent>
        Relationships: []
      }
      reviews: {
        Row: Review
        Insert: Partial<Review> & Pick<Review, "org_id" | "platform" | "rating">
        Update: Partial<Review>
        Relationships: []
      }
      push_subscriptions: {
        Row: PushSubscriptionRow
        Insert: Partial<PushSubscriptionRow> & Pick<PushSubscriptionRow, "org_id" | "user_id" | "endpoint" | "keys">
        Update: Partial<PushSubscriptionRow>
        Relationships: []
      }
      early_access_leads: {
        Row: EarlyAccessLead
        Insert: Partial<EarlyAccessLead> & Pick<EarlyAccessLead, "business_name" | "email">
        Update: Partial<EarlyAccessLead>
        Relationships: []
      }
      webhook_receipts: {
        Row: { id: string; source: string; payload: unknown; created_at: string }
        Insert: { id?: string; source: string; payload: unknown; created_at?: string }
        Update: { source?: string; payload?: unknown }
        Relationships: []
      }
      social_connections: {
        Row: SocialConnection
        Insert: Partial<SocialConnection> & Pick<SocialConnection, "org_id" | "provider" | "page_id" | "access_token">
        Update: Partial<SocialConnection>
        Relationships: []
      }
      org_phone_numbers: {
        Row: OrgPhoneNumber
        Insert: Partial<OrgPhoneNumber> & Pick<OrgPhoneNumber, "org_id" | "phone_number">
        Update: Partial<OrgPhoneNumber>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
