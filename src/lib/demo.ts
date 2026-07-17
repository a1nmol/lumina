// Demo/seed data used so the UI has something rich to render before an org
// connects Supabase and completes onboarding. Never used for real accounts —
// gate all reads behind isSupabaseConfigured() checks upstream.

import type { BusinessBrain, Org } from "@/lib/types"

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
  onboarding_step: 5,
  completed: true,
  updated_at: "2026-07-01T00:00:00.000Z",
}
