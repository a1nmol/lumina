// Demo/seed data used so the UI has something rich to render before an org
// connects Supabase and completes onboarding. Never used for real accounts —
// gate all reads behind isSupabaseConfigured() checks upstream.

import type {
  AnalyticsInsight,
  AnalyticsOverviewStats,
  Appointment,
  BusinessBrain,
  Call,
  Contact,
  ConversationDetail,
  LoopPair,
  Message,
  Org,
  Review,
} from "@/lib/types"

export const DEMO_ORG: Org = {
  id: "demo-org",
  name: "Sunrise Bakery",
  slug: "sunrise-bakery",
  created_at: "2026-01-01T00:00:00.000Z",
}

export const DEMO_BUSINESS_BRAIN: BusinessBrain = {
  org_id: DEMO_ORG.id,
  business_name: "Sunrise Bakery",
  category: "Bakery & Cafe",
  description:
    "A neighborhood bakery serving fresh sourdough, pastries, and coffee since 2019. Known for our cinnamon rolls and made-to-order birthday cakes.",
  hours: {
    monday: { open: "07:00", close: "18:00" },
    tuesday: { open: "07:00", close: "18:00" },
    wednesday: { open: "07:00", close: "18:00" },
    thursday: { open: "07:00", close: "18:00" },
    friday: { open: "07:00", close: "19:00" },
    saturday: { open: "08:00", close: "19:00" },
    sunday: { open: "08:00", close: "15:00" },
  },
  services: [
    {
      name: "Custom Birthday Cake",
      price: "$45",
      description: "Made-to-order, 48 hours notice.",
      duration_minutes: 60,
    },
    {
      name: "Cinnamon Roll (single)",
      price: "$4.50",
      description: "Our best seller, baked fresh every morning.",
    },
    {
      name: "Sourdough Loaf",
      price: "$8",
      description: "24-hour fermented, baked daily.",
    },
    {
      name: "Coffee Subscription",
      price: "$25/mo",
      description: "Weekly bag of house-roasted coffee.",
    },
    {
      name: "Catering Tray (dozen pastries)",
      price: "$60",
      description: "Mixed dozen, 24 hours notice.",
      duration_minutes: 30,
    },
    {
      name: "Kids Baking Class",
      price: "$35/child",
      description: "Saturdays 10am, ages 6-12, max 8 kids.",
      duration_minutes: 90,
    },
  ],
  prices: {
    "Custom Birthday Cake": "$45",
    "Cinnamon Roll (single)": "$4.50",
    "Sourdough Loaf": "$8",
    "Coffee Subscription": "$25/mo",
    "Catering Tray (dozen pastries)": "$60",
    "Kids Baking Class": "$35/child",
  },
  faq: [
    {
      question: "Do you take custom cake orders?",
      answer:
        "Yes! We need at least 48 hours notice for custom birthday cakes. Call or message us with your flavor and design ideas.",
    },
    {
      question: "Are you open on holidays?",
      answer:
        "We're closed on major holidays (New Year's Day, Thanksgiving, Christmas). Otherwise we're open our regular hours year-round.",
    },
    {
      question: "Do you have gluten-free or vegan options?",
      answer:
        "We offer a rotating gluten-free muffin and a vegan chocolate loaf daily, but our kitchen isn't allergen-free — please ask staff if you have a severe allergy.",
    },
    {
      question: "Can I place a large catering order?",
      answer:
        "Yes, catering trays serve 12+ and we ask for 24 hours notice. For orders over 5 trays, please give us a full week.",
    },
    {
      question: "Do you deliver?",
      answer:
        "We offer local delivery within 5 miles for orders over $30. Just mention delivery when you place your order.",
    },
  ],
  tone: "warm, friendly, a little playful — like a neighbor who happens to run the best bakery in town",
  brand_kit: {
    primary_color: "#6D5EF3",
    fonts: ["Inter", "Fraunces"],
    voice_keywords: ["cozy", "fresh-baked", "neighborhood", "handmade"],
  },
  connected_channels: {
    google_business: true,
    facebook: true,
    instagram: true,
    tiktok: false,
    sms: true,
    email: true,
    web_chat: true,
  },
  frontdesk_auto_reply: true,
  // Honest-AI intro (migration 0013) — off by default in the showcase org so
  // the demo widget/inbox never shows an intro bubble unless someone opts in.
  ai_intro_enabled: false,
  ai_intro_text: null,
  // Commander update (migration 0015) — off by default; the showcase org's
  // demo threads already read as "always engaged" without it.
  ai_always_on: false,
  // Proactive follow-ups (migration 0022) — on by default, matching the
  // column's own default so the showcase org demonstrates the feature.
  follow_ups_enabled: true,
  onboarding_step: 5,
  completed: true,
  updated_at: "2026-07-01T00:00:00.000Z",
}

// ---------------------------------------------------------------------------
// Unified Inbox + FrontDesk + CRM (Phase 2) demo data — mirrors
// supabase/migrations/0003_frontdesk.sql / src/lib/types.ts exactly (ids are
// stable strings so demo links like /contacts/demo-contact-1 stay stable).
// ---------------------------------------------------------------------------

/**
 * Demo-only shape used for DEMO_CONVERSATIONS: everything ConversationDetail
 * already carries (conversation + contact + messages), plus an optional
 * `pendingAiDraft`. `pendingAiDraft` is NOT part of the DB schema — per the
 * design brief, an "AI drafted — needs review" thread's draft text lives
 * only in the composer until sent, it's never a persisted message row. The
 * UI reads this field to pre-fill the composer for the one ai_state ===
 * "ai_draft" demo thread instead of calling the live model in demo mode.
 */
export type DemoConversationDetail = ConversationDetail & {
  pendingAiDraft?: string
}

export const DEMO_CONTACTS: Contact[] = [
  {
    id: "demo-contact-1",
    org_id: DEMO_ORG.id,
    name: "Emma Rodriguez",
    phone: "+1 (555) 010-1001",
    email: "emma.rodriguez@example.com",
    source: "web_chat",
    status: "lead",
    tags: ["birthday-cake"],
    notes: null,
    custom: {},
    ai_memory: null,
    is_vip: true,
    created_at: "2026-07-14T15:02:00.000Z",
    updated_at: "2026-07-14T15:06:00.000Z",
  },
  {
    id: "demo-contact-2",
    org_id: DEMO_ORG.id,
    name: "Marcus Chen",
    phone: "+1 (555) 010-1002",
    email: null,
    source: "missed_call",
    status: "contacted",
    tags: ["follow-up", "subscription"],
    notes: "Missed our call on 7/13, followed up by text.",
    custom: {},
    ai_memory: null,
    is_vip: false,
    created_at: "2026-07-13T18:41:00.000Z",
    updated_at: "2026-07-13T18:52:00.000Z",
  },
  {
    id: "demo-contact-3",
    org_id: DEMO_ORG.id,
    name: "Priya Patel",
    phone: "+1 (555) 010-1003",
    email: "priya.patel@example.com",
    source: "instagram",
    status: "lead",
    tags: ["catering", "vip"],
    notes: null,
    custom: {},
    ai_memory: null,
    is_vip: false,
    created_at: "2026-07-15T20:10:00.000Z",
    updated_at: "2026-07-15T20:10:00.000Z",
  },
  {
    id: "demo-contact-4",
    org_id: DEMO_ORG.id,
    name: "Daniel Okafor",
    phone: null,
    email: "daniel.okafor@example.com",
    source: "email",
    status: "customer",
    tags: ["review", "regular"],
    notes: "Left a 5-star Google review 7/12.",
    custom: {},
    ai_memory: null,
    is_vip: false,
    created_at: "2026-07-12T13:15:00.000Z",
    updated_at: "2026-07-12T13:24:00.000Z",
  },
  {
    id: "demo-contact-5",
    org_id: DEMO_ORG.id,
    name: "Sofia Alvarez",
    phone: "+1 (555) 010-1005",
    email: null,
    source: "facebook",
    status: "contacted",
    tags: [],
    notes: null,
    custom: {},
    ai_memory: null,
    is_vip: false,
    created_at: "2026-07-11T09:30:00.000Z",
    updated_at: "2026-07-11T09:33:00.000Z",
  },
  {
    id: "demo-contact-6",
    org_id: DEMO_ORG.id,
    name: "James Whitfield",
    phone: "+1 (555) 010-1006",
    email: "james.whitfield@example.com",
    source: "google",
    status: "lead",
    tags: ["allergy"],
    notes: "Severe tree nut allergy for his daughter — confirm ingredients personally before replying.",
    custom: {},
    ai_memory: null,
    is_vip: false,
    created_at: "2026-07-16T11:05:00.000Z",
    updated_at: "2026-07-16T11:05:00.000Z",
  },
  {
    id: "demo-contact-7",
    org_id: DEMO_ORG.id,
    name: "Grace Kim",
    phone: "+1 (555) 010-1007",
    email: "grace.kim@example.com",
    source: "web_chat",
    status: "booked",
    tags: ["kids-class"],
    notes: null,
    custom: {},
    ai_memory: null,
    is_vip: false,
    created_at: "2026-07-10T16:20:00.000Z",
    updated_at: "2026-07-10T16:24:00.000Z",
  },
  {
    id: "demo-contact-8",
    org_id: DEMO_ORG.id,
    name: "Tyler Brooks",
    phone: "+1 (555) 010-1008",
    email: null,
    source: "sms",
    status: "booked",
    tags: ["reschedule"],
    notes: null,
    custom: {},
    ai_memory: null,
    is_vip: false,
    created_at: "2026-07-09T08:00:00.000Z",
    updated_at: "2026-07-09T08:10:00.000Z",
  },
  {
    id: "demo-contact-9",
    org_id: DEMO_ORG.id,
    name: "Aisha Bello",
    phone: "+1 (555) 010-1009",
    email: "aisha.bello@example.com",
    source: "manual",
    status: "customer",
    tags: ["regular", "coffee-subscription"],
    notes: "Added manually after an in-store conversation.",
    custom: {},
    ai_memory: null,
    is_vip: false,
    created_at: "2026-06-28T12:00:00.000Z",
    updated_at: "2026-06-28T12:00:00.000Z",
  },
  {
    id: "demo-contact-10",
    org_id: DEMO_ORG.id,
    name: "Noah Fitzgerald",
    phone: null,
    email: "noah.fitzgerald@example.com",
    source: "form",
    status: "lead",
    tags: ["catering"],
    notes: null,
    custom: {},
    ai_memory: null,
    is_vip: false,
    created_at: "2026-07-08T17:45:00.000Z",
    updated_at: "2026-07-08T17:45:00.000Z",
  },
  {
    // AI Phone Receptionist demo thread (wave V2) — see demo-conversation-9
    // below for the call metadata this contact's timeline/inbox thread show.
    id: "demo-contact-11",
    org_id: DEMO_ORG.id,
    name: "Marcus Webb",
    phone: "+1 (555) 010-1011",
    email: null,
    source: "voice",
    status: "contacted",
    tags: ["custom-order"],
    notes: null,
    custom: {},
    ai_memory: null,
    is_vip: false,
    created_at: "2026-07-08T09:12:00.000Z",
    updated_at: "2026-07-12T11:04:00.000Z",
  },
]

function demoMessage(input: {
  id: string
  conversationId: string
  direction: Message["direction"]
  kind?: Message["kind"]
  body: string
  aiHandled?: boolean
  model?: string | null
  costUsd?: number
  createdAt: string
}): Message {
  return {
    id: input.id,
    org_id: DEMO_ORG.id,
    conversation_id: input.conversationId,
    direction: input.direction,
    kind: input.kind ?? "message",
    body: input.body,
    ai_handled: input.aiHandled ?? false,
    model: input.model ?? null,
    cost_usd: input.costUsd ?? 0,
    metadata: {},
    created_at: input.createdAt,
  }
}

/** AI Phone Receptionist demo call row (wave V2) — mirrors supabase/migrations/0020_voice_receptionist.sql's `calls` table shape. */
function demoCall(input: {
  id: string
  conversationId: string
  fromNumber: string
  startedAt: string
  durationSecs: number
  outcome: string
  summary?: string | null
}): Call {
  const startedMs = new Date(input.startedAt).getTime()
  return {
    id: input.id,
    org_id: DEMO_ORG.id,
    conversation_id: input.conversationId,
    retell_call_id: `retell-${input.id}`,
    from_number: input.fromNumber,
    to_number: "+1 (555) 020-2000",
    started_at: input.startedAt,
    ended_at: new Date(startedMs + input.durationSecs * 1000).toISOString(),
    duration_secs: input.durationSecs,
    outcome: input.outcome,
    summary: input.summary ?? null,
    cost_usd: Number(((input.durationSecs / 60) * 0.0785).toFixed(4)),
    created_at: input.startedAt,
  }
}

export const DEMO_CONVERSATIONS: DemoConversationDetail[] = [
  {
    id: "demo-conversation-1",
    org_id: DEMO_ORG.id,
    contact_id: "demo-contact-1",
    channel: "web_chat",
    status: "resolved",
    ai_state: "ai_answered",
    ai_mode: "auto",
    // Sample rolling memory (Commander update) so the Inbox's "AI memory"
    // strip (src/components/inbox/ai-memory-strip.tsx) has something real to
    // show in demo mode — shape matches src/lib/ai/conversation-memory.ts's
    // ConversationMemory.
    ai_memory: {
      facts: ["wants a chocolate cake with a dinosaur theme", "pickup is Saturday morning"],
      open_threads: [],
      vibe: "excited, easygoing first-time customer",
      summary:
        "Emma asked about a custom birthday cake for her kid's 6th birthday this Saturday. We quoted $45 with 48h notice, she picked chocolate with a dinosaur theme, and we confirmed pickup for Saturday morning.",
      updated_at: "2026-07-14T15:06:00.000Z",
      message_count: 4,
    },
    last_follow_up_at: null,
    last_message_at: "2026-07-14T15:06:00.000Z",
    unread: false,
    created_at: "2026-07-14T15:02:00.000Z",
    updated_at: "2026-07-14T15:06:00.000Z",
    contact_name: "Emma Rodriguez",
    contact_phone: "+1 (555) 010-1001",
    contact_email: "emma.rodriguez@example.com",
    contact_is_vip: DEMO_CONTACTS[0].is_vip,
    contact: DEMO_CONTACTS[0],
    messages: [
      demoMessage({
        id: "demo-message-1-1",
        conversationId: "demo-conversation-1",
        direction: "inbound",
        body: "Hi! Do you do custom birthday cakes? I need something for a 6th birthday party this Saturday \u{1F382}",
        createdAt: "2026-07-14T15:02:00.000Z",
      }),
      demoMessage({
        id: "demo-message-1-2",
        conversationId: "demo-conversation-1",
        direction: "outbound",
        body: "Yes we do! Our custom birthday cakes are $45 and we just need 48 hours notice. What flavor and any design ideas did you have in mind for the 6th birthday?",
        aiHandled: true,
        model: "anthropic/claude-haiku-4.5",
        costUsd: 0.0016,
        createdAt: "2026-07-14T15:03:00.000Z",
      }),
      demoMessage({
        id: "demo-message-1-3",
        conversationId: "demo-conversation-1",
        direction: "inbound",
        body: "Amazing! Chocolate with a dinosaur theme if possible",
        createdAt: "2026-07-14T15:05:00.000Z",
      }),
      demoMessage({
        id: "demo-message-1-4",
        conversationId: "demo-conversation-1",
        direction: "outbound",
        body: "Dinosaur chocolate cake sounds fun! We can definitely do that. I've got you down for pickup Saturday morning — I'll text you a confirmation once it's on the schedule. Anything else I can help with?",
        aiHandled: true,
        model: "anthropic/claude-haiku-4.5",
        costUsd: 0.0019,
        createdAt: "2026-07-14T15:06:00.000Z",
      }),
    ],
  },
  {
    id: "demo-conversation-2",
    org_id: DEMO_ORG.id,
    contact_id: "demo-contact-2",
    channel: "sms",
    status: "pending",
    ai_state: "ai_answered",
    ai_mode: "auto",
    ai_memory: null,
    last_follow_up_at: null,
    last_message_at: "2026-07-13T18:52:00.000Z",
    unread: true,
    created_at: "2026-07-13T18:41:00.000Z",
    updated_at: "2026-07-13T18:52:00.000Z",
    contact_name: "Marcus Chen",
    contact_phone: "+1 (555) 010-1002",
    contact_email: null,
    contact_is_vip: DEMO_CONTACTS[1].is_vip,
    contact: DEMO_CONTACTS[1],
    messages: [
      demoMessage({
        id: "demo-message-2-1",
        conversationId: "demo-conversation-2",
        direction: "outbound",
        body: "Hi! Sorry we missed your call at Sunrise Bakery \u{1F950} — how can we help? Reply here anytime.",
        aiHandled: true,
        model: "anthropic/claude-haiku-4.5",
        costUsd: 0.0011,
        createdAt: "2026-07-13T18:41:00.000Z",
      }),
      demoMessage({
        id: "demo-message-2-2",
        conversationId: "demo-conversation-2",
        direction: "inbound",
        body: "Hey, just wanted to check if you still have the coffee subscription available",
        createdAt: "2026-07-13T18:47:00.000Z",
      }),
      demoMessage({
        id: "demo-message-2-3",
        conversationId: "demo-conversation-2",
        direction: "outbound",
        body: "Yes! Our coffee subscription is $25/month for a weekly bag of house-roasted coffee. Want me to get you set up?",
        aiHandled: true,
        model: "anthropic/claude-haiku-4.5",
        costUsd: 0.0014,
        createdAt: "2026-07-13T18:50:00.000Z",
      }),
      demoMessage({
        id: "demo-message-2-4",
        conversationId: "demo-conversation-2",
        direction: "inbound",
        body: "Yes please, sign me up",
        createdAt: "2026-07-13T18:52:00.000Z",
      }),
    ],
  },
  {
    id: "demo-conversation-3",
    org_id: DEMO_ORG.id,
    contact_id: "demo-contact-3",
    channel: "instagram",
    status: "open",
    ai_state: "ai_draft",
    ai_mode: "auto",
    ai_memory: null,
    last_follow_up_at: null,
    last_message_at: "2026-07-15T20:10:00.000Z",
    unread: true,
    created_at: "2026-07-15T20:10:00.000Z",
    updated_at: "2026-07-15T20:10:00.000Z",
    contact_name: "Priya Patel",
    contact_phone: "+1 (555) 010-1003",
    contact_email: "priya.patel@example.com",
    contact_is_vip: DEMO_CONTACTS[2].is_vip,
    contact: DEMO_CONTACTS[2],
    messages: [
      demoMessage({
        id: "demo-message-3-1",
        conversationId: "demo-conversation-3",
        direction: "inbound",
        body: "Hi! I'm planning a corporate event for 40 people next month, do you do catering trays? What's the cost breakdown look like for that many people?",
        createdAt: "2026-07-15T20:10:00.000Z",
      }),
    ],
    pendingAiDraft:
      "Hi Priya! Yes, we'd love to help with your event. Our catering trays are $60 per dozen pastries — for 40 people we'd recommend about 4 trays (48 pastries), so roughly $240 total. We ask for at least a week's notice for orders over 5 trays, but 4 trays just needs 24 hours. Want me to pencil in a date?",
  },
  {
    id: "demo-conversation-4",
    org_id: DEMO_ORG.id,
    contact_id: "demo-contact-4",
    channel: "email",
    status: "resolved",
    ai_state: "human",
    ai_mode: "auto",
    ai_memory: null,
    last_follow_up_at: null,
    last_message_at: "2026-07-12T13:24:00.000Z",
    unread: false,
    created_at: "2026-07-12T13:15:00.000Z",
    updated_at: "2026-07-12T13:24:00.000Z",
    contact_name: "Daniel Okafor",
    contact_phone: null,
    contact_email: "daniel.okafor@example.com",
    contact_is_vip: DEMO_CONTACTS[3].is_vip,
    contact: DEMO_CONTACTS[3],
    messages: [
      demoMessage({
        id: "demo-message-4-1",
        conversationId: "demo-conversation-4",
        direction: "inbound",
        body: "Left you 5 stars on Google! The cinnamon rolls are seriously the best in town. Quick question — are you open on Labor Day?",
        createdAt: "2026-07-12T13:15:00.000Z",
      }),
      demoMessage({
        id: "demo-message-4-2",
        conversationId: "demo-conversation-4",
        direction: "outbound",
        body: "Thank you so much for the kind words, Daniel! We really appreciate it \u{1F64F} We are open on Labor Day with normal hours, hope to see you again soon!",
        createdAt: "2026-07-12T13:24:00.000Z",
      }),
    ],
  },
  {
    id: "demo-conversation-5",
    org_id: DEMO_ORG.id,
    contact_id: "demo-contact-5",
    channel: "facebook",
    status: "resolved",
    ai_state: "ai_answered",
    ai_mode: "auto",
    ai_memory: null,
    last_follow_up_at: null,
    last_message_at: "2026-07-11T09:33:00.000Z",
    unread: false,
    created_at: "2026-07-11T09:30:00.000Z",
    updated_at: "2026-07-11T09:33:00.000Z",
    contact_name: "Sofia Alvarez",
    contact_phone: "+1 (555) 010-1005",
    contact_email: null,
    contact_is_vip: DEMO_CONTACTS[4].is_vip,
    contact: DEMO_CONTACTS[4],
    messages: [
      demoMessage({
        id: "demo-message-5-1",
        conversationId: "demo-conversation-5",
        direction: "inbound",
        body: "What time do you guys open on Sundays?",
        createdAt: "2026-07-11T09:30:00.000Z",
      }),
      demoMessage({
        id: "demo-message-5-2",
        conversationId: "demo-conversation-5",
        direction: "outbound",
        body: "We're open 8am-3pm on Sundays! Come say hi \u{1F44B}",
        aiHandled: true,
        model: "anthropic/claude-haiku-4.5",
        costUsd: 0.0009,
        createdAt: "2026-07-11T09:33:00.000Z",
      }),
    ],
  },
  {
    id: "demo-conversation-6",
    org_id: DEMO_ORG.id,
    contact_id: "demo-contact-6",
    channel: "google",
    status: "pending",
    ai_state: "escalated",
    ai_mode: "auto",
    ai_memory: null,
    last_follow_up_at: null,
    last_message_at: "2026-07-16T11:06:00.000Z",
    unread: true,
    created_at: "2026-07-16T11:05:00.000Z",
    updated_at: "2026-07-16T11:06:00.000Z",
    contact_name: "James Whitfield",
    contact_phone: "+1 (555) 010-1006",
    contact_email: "james.whitfield@example.com",
    contact_is_vip: DEMO_CONTACTS[5].is_vip,
    contact: DEMO_CONTACTS[5],
    messages: [
      demoMessage({
        id: "demo-message-6-1",
        conversationId: "demo-conversation-6",
        direction: "inbound",
        body: "My daughter has a severe tree nut allergy. Can you guarantee the sourdough loaf is nut-free? Need to know before I order.",
        createdAt: "2026-07-16T11:05:00.000Z",
      }),
      demoMessage({
        id: "demo-message-6-2",
        conversationId: "demo-conversation-6",
        kind: "note",
        direction: "outbound",
        body: "I couldn't answer this — flagging for you. Severe allergy safety question, needs your confirmation on kitchen cross-contamination before we reply.",
        createdAt: "2026-07-16T11:06:00.000Z",
      }),
    ],
  },
  {
    id: "demo-conversation-7",
    org_id: DEMO_ORG.id,
    contact_id: "demo-contact-7",
    channel: "web_chat",
    status: "resolved",
    ai_state: "ai_answered",
    ai_mode: "auto",
    ai_memory: null,
    last_follow_up_at: null,
    last_message_at: "2026-07-10T16:24:00.000Z",
    unread: false,
    created_at: "2026-07-10T16:20:00.000Z",
    updated_at: "2026-07-10T16:24:00.000Z",
    contact_name: "Grace Kim",
    contact_phone: "+1 (555) 010-1007",
    contact_email: "grace.kim@example.com",
    contact_is_vip: DEMO_CONTACTS[6].is_vip,
    contact: DEMO_CONTACTS[6],
    messages: [
      demoMessage({
        id: "demo-message-7-1",
        conversationId: "demo-conversation-7",
        direction: "inbound",
        body: "Can I sign my 8 year old up for the Saturday baking class?",
        createdAt: "2026-07-10T16:20:00.000Z",
      }),
      demoMessage({
        id: "demo-message-7-2",
        conversationId: "demo-conversation-7",
        direction: "outbound",
        body: "Of course! The Kids Baking Class is $35/child, Saturdays at 10am for ages 6-12 (max 8 kids). I'll add your 8 year old to this Saturday's class — see you then!",
        aiHandled: true,
        model: "anthropic/claude-haiku-4.5",
        costUsd: 0.0017,
        createdAt: "2026-07-10T16:24:00.000Z",
      }),
    ],
  },
  {
    id: "demo-conversation-8",
    org_id: DEMO_ORG.id,
    contact_id: "demo-contact-8",
    channel: "sms",
    status: "resolved",
    ai_state: "human",
    ai_mode: "auto",
    ai_memory: null,
    last_follow_up_at: null,
    last_message_at: "2026-07-09T08:10:00.000Z",
    unread: false,
    created_at: "2026-07-09T08:00:00.000Z",
    updated_at: "2026-07-09T08:10:00.000Z",
    contact_name: "Tyler Brooks",
    contact_phone: "+1 (555) 010-1008",
    contact_email: null,
    contact_is_vip: DEMO_CONTACTS[7].is_vip,
    contact: DEMO_CONTACTS[7],
    messages: [
      demoMessage({
        id: "demo-message-8-1",
        conversationId: "demo-conversation-8",
        direction: "inbound",
        body: "Hey it's Tyler, I have a catering pickup scheduled for Friday but need to push it to Monday, is that possible?",
        createdAt: "2026-07-09T08:00:00.000Z",
      }),
      demoMessage({
        id: "demo-message-8-2",
        conversationId: "demo-conversation-8",
        direction: "outbound",
        body: "Hi Tyler, no problem — I've moved your catering pickup to Monday at the same time. See you then!",
        createdAt: "2026-07-09T08:10:00.000Z",
      }),
    ],
  },
  {
    // AI Phone Receptionist demo thread (wave V2) — three calls from the
    // same caller so the Inbox's call-header strip (src/components/inbox/call-header.tsx)
    // has a real "N calls" case to render in demo mode, not just a single
    // call. Transcript below reflects the most recent (3rd) call.
    id: "demo-conversation-9",
    org_id: DEMO_ORG.id,
    contact_id: "demo-contact-11",
    channel: "voice",
    status: "resolved",
    ai_state: "ai_answered",
    ai_mode: "auto",
    ai_memory: {
      facts: ["wants a 3-tier custom cake for a 50-person office party", "needs it by the 20th"],
      open_threads: [],
      vibe: "practical, calling on a lunch break",
      summary:
        "Marcus called about a large custom cake for a 50-person office party on the 20th. First call he hung up before we caught details; second call went to voicemail after hours; third call we got his name, number, and event date and let him know our cake specialist would follow up with pricing.",
      updated_at: "2026-07-12T11:04:00.000Z",
      message_count: 4,
    },
    last_follow_up_at: null,
    last_message_at: "2026-07-12T11:04:00.000Z",
    unread: false,
    created_at: "2026-07-08T09:12:00.000Z",
    updated_at: "2026-07-12T11:04:00.000Z",
    contact_name: "Marcus Webb",
    contact_phone: "+1 (555) 010-1011",
    contact_email: null,
    contact_is_vip: DEMO_CONTACTS[10].is_vip,
    contact: DEMO_CONTACTS[10],
    messages: [
      demoMessage({
        id: "demo-message-9-1",
        conversationId: "demo-conversation-9",
        direction: "outbound",
        body: "Hi, this is Sunrise Bakery's AI assistant — this call may be recorded. How can I help you today?",
        aiHandled: true,
        createdAt: "2026-07-12T11:02:00.000Z",
      }),
      demoMessage({
        id: "demo-message-9-2",
        conversationId: "demo-conversation-9",
        direction: "inbound",
        body: "Hey, yeah — I need a custom cake for an office party, about 50 people, on the 20th. Do you guys do that?",
        createdAt: "2026-07-12T11:02:30.000Z",
      }),
      demoMessage({
        id: "demo-message-9-3",
        conversationId: "demo-conversation-9",
        direction: "outbound",
        body: "We do! A 3-tier custom cake would comfortably serve 50 — can I get your name and a callback number so our cake specialist can follow up with pricing and availability for the 20th?",
        aiHandled: true,
        createdAt: "2026-07-12T11:03:10.000Z",
      }),
      demoMessage({
        id: "demo-message-9-4",
        conversationId: "demo-conversation-9",
        direction: "inbound",
        body: "Sure, Marcus Webb, and this number is fine to call back.",
        createdAt: "2026-07-12T11:03:45.000Z",
      }),
      demoMessage({
        id: "demo-message-9-5",
        conversationId: "demo-conversation-9",
        kind: "note",
        direction: "outbound",
        body: "Call summary: Marcus Webb wants a 3-tier custom cake for a 50-person office party on the 20th. Took his name and callback number for the cake specialist to follow up with pricing.",
        aiHandled: true,
        createdAt: "2026-07-12T11:04:00.000Z",
      }),
    ],
    calls: [
      demoCall({
        id: "demo-call-9-1",
        conversationId: "demo-conversation-9",
        fromNumber: "+1 (555) 010-1011",
        startedAt: "2026-07-08T09:12:00.000Z",
        durationSecs: 14,
        outcome: "user_hangup",
      }),
      demoCall({
        id: "demo-call-9-2",
        conversationId: "demo-conversation-9",
        fromNumber: "+1 (555) 010-1011",
        startedAt: "2026-07-10T20:47:00.000Z",
        durationSecs: 38,
        outcome: "unsuccessful",
      }),
      demoCall({
        id: "demo-call-9-3",
        conversationId: "demo-conversation-9",
        fromNumber: "+1 (555) 010-1011",
        startedAt: "2026-07-12T11:02:00.000Z",
        durationSecs: 124,
        outcome: "successful",
        summary:
          "Marcus Webb wants a 3-tier custom cake for a 50-person office party on the 20th. Took his name and callback number for the cake specialist to follow up with pricing.",
      }),
    ],
  },
]

export const DEMO_APPOINTMENTS: Appointment[] = [
  {
    id: "demo-appointment-1",
    org_id: DEMO_ORG.id,
    contact_id: "demo-contact-7",
    starts_at: "2026-07-18T17:00:00.000Z",
    ends_at: "2026-07-18T18:30:00.000Z",
    service: "Kids Baking Class",
    status: "scheduled",
    notes: "8 year old, first class.",
    created_at: "2026-07-10T16:24:00.000Z",
    updated_at: "2026-07-10T16:24:00.000Z",
  },
  {
    id: "demo-appointment-2",
    org_id: DEMO_ORG.id,
    contact_id: "demo-contact-1",
    starts_at: "2026-07-18T16:00:00.000Z",
    ends_at: "2026-07-18T16:15:00.000Z",
    service: "Custom Birthday Cake pickup",
    status: "scheduled",
    notes: "Chocolate, dinosaur theme.",
    created_at: "2026-07-14T15:06:00.000Z",
    updated_at: "2026-07-14T15:06:00.000Z",
  },
  {
    id: "demo-appointment-3",
    org_id: DEMO_ORG.id,
    contact_id: "demo-contact-8",
    starts_at: "2026-07-20T15:30:00.000Z",
    ends_at: "2026-07-20T15:45:00.000Z",
    service: "Catering Tray pickup",
    status: "scheduled",
    notes: "Rescheduled from Friday 7/17.",
    created_at: "2026-07-09T08:10:00.000Z",
    updated_at: "2026-07-09T08:10:00.000Z",
  },
]

// ---------------------------------------------------------------------------
// Analytics loop + Reviews (Phase 3) demo data — mirrors
// supabase/migrations/0004_analytics.sql / src/lib/types.ts. Existing demo
// items above are untouched; loop pairs reference the same contacts/
// timestamps already established in DEMO_CONTACTS/DEMO_CONVERSATIONS/
// DEMO_APPOINTMENTS rather than inventing new ones.
// ---------------------------------------------------------------------------

export const DEMO_REVIEWS: Review[] = [
  {
    id: "demo-review-1",
    org_id: DEMO_ORG.id,
    platform: "google",
    reviewer_name: "Daniel Okafor",
    rating: 5,
    body: "The cinnamon rolls are seriously the best in town. Friendly staff, always fresh, never disappoints.",
    sentiment: "positive",
    reply:
      "Thank you so much for the kind words, Daniel! We really appreciate it \u{1F64F} hope to see you again soon!",
    reply_status: "replied",
    received_at: "2026-07-12T13:10:00.000Z",
    created_at: "2026-07-12T13:10:00.000Z",
    updated_at: "2026-07-12T13:24:00.000Z",
  },
  {
    id: "demo-review-2",
    org_id: DEMO_ORG.id,
    platform: "facebook",
    reviewer_name: "Bill Anderson",
    rating: 2,
    body: "Waited almost 20 minutes to be helped on a Saturday morning even though the line wasn't that long. Cake was good once I got it.",
    sentiment: "negative",
    reply: null,
    reply_status: "none",
    received_at: "2026-07-15T10:05:00.000Z",
    created_at: "2026-07-15T10:05:00.000Z",
    updated_at: "2026-07-15T10:05:00.000Z",
  },
  {
    id: "demo-review-3",
    org_id: DEMO_ORG.id,
    platform: "google",
    reviewer_name: "Rachel Nguyen",
    rating: 4,
    body: "Great sourdough, love that it's fermented 24 hours. Wish they had a few more seats to sit and eat in.",
    sentiment: "positive",
    reply: null,
    reply_status: "none",
    received_at: "2026-07-16T09:20:00.000Z",
    created_at: "2026-07-16T09:20:00.000Z",
    updated_at: "2026-07-16T09:20:00.000Z",
  },
  {
    id: "demo-review-4",
    org_id: DEMO_ORG.id,
    platform: "facebook",
    reviewer_name: "Owen Park",
    rating: 3,
    body: "Pastries are solid but the catering tray we ordered for our office was smaller than I expected for the price.",
    sentiment: "neutral",
    reply:
      "Hi Owen, thanks for the feedback and for trying our catering trays! Sorry the tray felt smaller than expected — we'd love to make it right on your next order, just mention this review when you call.",
    reply_status: "ai_draft",
    received_at: "2026-07-14T17:45:00.000Z",
    created_at: "2026-07-14T17:45:00.000Z",
    updated_at: "2026-07-14T17:45:00.000Z",
  },
  {
    id: "demo-review-5",
    org_id: DEMO_ORG.id,
    platform: "google",
    reviewer_name: "Latoya Freeman",
    rating: 5,
    body: "Ordered a custom birthday cake with 48 hours notice and it came out perfect, exactly what we asked for. Will be back!",
    sentiment: "positive",
    reply: null,
    reply_status: "none",
    received_at: "2026-07-17T14:30:00.000Z",
    created_at: "2026-07-17T14:30:00.000Z",
    updated_at: "2026-07-17T14:30:00.000Z",
  },
  {
    id: "demo-review-6",
    org_id: DEMO_ORG.id,
    platform: "google",
    reviewer_name: "Victor Ibarra",
    rating: 2,
    body: "Ordered ahead online and half the order wasn't ready at pickup time. Had to wait around while they finished it.",
    sentiment: "negative",
    reply:
      "Hi Victor, I'm really sorry your order wasn't ready when you arrived — that's on us. We'd like to make this right; please reach out so we can fix it for your next visit.",
    reply_status: "ai_draft",
    received_at: "2026-07-13T08:15:00.000Z",
    created_at: "2026-07-13T08:15:00.000Z",
    updated_at: "2026-07-13T08:15:00.000Z",
  },
  {
    id: "demo-review-7",
    org_id: DEMO_ORG.id,
    platform: "facebook",
    reviewer_name: "Hannah Voss",
    rating: 4,
    body: "The kids baking class was a hit with my son, he hasn't stopped talking about it. Would love to see more weekend sessions.",
    sentiment: "positive",
    reply: null,
    reply_status: "none",
    received_at: "2026-07-11T16:00:00.000Z",
    created_at: "2026-07-11T16:00:00.000Z",
    updated_at: "2026-07-11T16:00:00.000Z",
  },
  {
    id: "demo-review-8",
    org_id: DEMO_ORG.id,
    platform: "facebook",
    reviewer_name: "Carlos Mendez",
    rating: 3,
    body: "Coffee subscription is good value but a couple of the bags arrived later than the promised weekly schedule.",
    sentiment: "neutral",
    reply: null,
    reply_status: "none",
    received_at: "2026-07-10T12:40:00.000Z",
    created_at: "2026-07-10T12:40:00.000Z",
    updated_at: "2026-07-10T12:40:00.000Z",
  },
]

/**
 * 4 source-post + outcome pairs for the Analytics "Loop" view. Posts here
 * are demo-only summaries (not real content_items — this app has no
 * DEMO_CONTENT_ITEMS export yet); outcomes reference the real contacts/
 * timestamps already in DEMO_CONTACTS/DEMO_CONVERSATIONS/DEMO_APPOINTMENTS
 * above, with deltaHours computed from those exact timestamps (see
 * src/lib/analytics.ts for the live 48h-window attribution heuristic this
 * mirrors).
 */
export const DEMO_LOOP_PAIRS: LoopPair[] = [
  {
    post: {
      id: "demo-loop-post-1",
      caption:
        "Dinosaur-themed birthday cakes are our specialty right now \u{1F995} chocolate, vanilla, or a custom flavor — just tell us the theme!",
      format: "single",
      platforms: ["instagram", "facebook"],
      publishedAt: "2026-07-13T14:00:00.000Z",
    },
    outcomes: [
      {
        kind: "lead",
        contactName: "Emma Rodriguez",
        channel: "web_chat",
        occurredAt: "2026-07-14T15:02:00.000Z",
        deltaHours: 25,
      },
      {
        kind: "booking",
        contactName: "Emma Rodriguez",
        channel: "web_chat",
        occurredAt: "2026-07-14T15:06:00.000Z",
        deltaHours: 25,
      },
    ],
    matchMethod: "matched by lead + booking within 48h of post",
  },
  {
    post: {
      id: "demo-loop-post-2",
      caption:
        "Saturday Kids Baking Class has 3 spots left this week — ages 6-12, cupcake decorating included!",
      format: "single",
      platforms: ["facebook", "google_business"],
      publishedAt: "2026-07-09T11:00:00.000Z",
    },
    outcomes: [
      {
        kind: "lead",
        contactName: "Grace Kim",
        channel: "web_chat",
        occurredAt: "2026-07-10T16:20:00.000Z",
        deltaHours: 29,
      },
      {
        kind: "booking",
        contactName: "Grace Kim",
        channel: "web_chat",
        occurredAt: "2026-07-10T16:24:00.000Z",
        deltaHours: 29,
      },
    ],
    matchMethod: "matched by lead + booking within 48h of post",
  },
  {
    post: {
      id: "demo-loop-post-3",
      caption:
        "New this week: bright Ethiopian single-origin coffee subscription \u{2615} first pick goes to subscribers.",
      format: "carousel",
      platforms: ["instagram"],
      publishedAt: "2026-07-12T09:00:00.000Z",
    },
    outcomes: [
      {
        kind: "call",
        contactName: "Marcus Chen",
        channel: "sms",
        occurredAt: "2026-07-13T18:41:00.000Z",
        deltaHours: 34,
      },
    ],
    matchMethod: "matched by missed-call-to-text within 48h of post",
  },
  {
    post: {
      id: "demo-loop-post-4",
      caption:
        "Catering season is here — mixed pastry trays for your next office meeting, 24hr notice and we've got you covered.",
      format: "single",
      platforms: ["facebook"],
      publishedAt: "2026-07-14T12:00:00.000Z",
    },
    outcomes: [
      {
        kind: "lead",
        contactName: "Priya Patel",
        channel: "instagram",
        occurredAt: "2026-07-15T20:10:00.000Z",
        deltaHours: 32,
      },
    ],
    matchMethod: "matched by lead within 48h of post",
  },
]

/** Roll-up stat strip for the default 30-day Analytics view. Deltas are percent change vs. the previous 30 days. */
export const DEMO_OVERVIEW_STATS: AnalyticsOverviewStats = {
  rangeDays: 30,
  postsPublished: 12,
  reach: 18400,
  leads: 8,
  bookings: 3,
  reviewsCount: 8,
  deltas: {
    postsPublished: 20,
    reach: 14,
    leads: 33,
    bookings: 50,
    reviewsCount: 100,
  },
}

/** Fixed rows for the Command Center's "while you were away" receipt (src/components/brand/receipt-card.tsx, src/lib/digest.ts) — always shown in demo mode so the design is visible without a live org/visit history. */
export const DEMO_WHILE_YOU_WERE_AWAY_ROWS = [
  { label: "New leads", value: "2" },
  { label: "New bookings", value: "1" },
  { label: "Unread conversations", value: "3" },
]

/** 3 rule-based insights computed from the demo data above (DEMO_LOOP_PAIRS) — numeric, specific, no fabricated claims. */
export const DEMO_INSIGHTS: AnalyticsInsight[] = [
  {
    id: "demo-insight-1",
    text: "Your Kids Baking Class post (Jul 9) turned into a lead and a booking within 29 hours — the fastest turnaround of your last 4 tracked posts.",
    cta: { label: "Create a similar post", href: "/studio" },
  },
  {
    id: "demo-insight-2",
    text: "All 4 of your loop-linked posts this month converted into a lead, booking, or call within 34 hours of publishing.",
    cta: { label: "Plan next week's posts", href: "/calendar" },
  },
  {
    id: "demo-insight-3",
    text: "Single-image posts drove 5 of your 6 tracked outcomes this month, all within 34 hours of publishing.",
    cta: { label: "Make another single-image post", href: "/studio" },
  },
]
