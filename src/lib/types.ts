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
        Insert: OrgMember
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
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
