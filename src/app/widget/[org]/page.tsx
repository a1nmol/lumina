import type { Metadata } from "next"
import { MessageCircle } from "lucide-react"

import { resolveWidgetOrg } from "../resolve-org"
import { WidgetChat } from "./widget-chat"

interface WidgetPageProps {
  params: Promise<{ org: string }>
}

export async function generateMetadata({ params }: WidgetPageProps): Promise<Metadata> {
  const { org } = await params
  const resolved = await resolveWidgetOrg(org)
  return { title: resolved ? `Chat with ${resolved.businessName}` : "Chat" }
}

/** Short, brand-voiced opening line so the thread never starts blank. */
function buildGreeting(businessName: string, tone: string | null): string {
  const warm = !tone || /warm|friendly|playful|casual/i.test(tone)
  return warm
    ? `Hi! 👋 I'm the AI assistant for ${businessName}. Ask about hours, services, or booking — I'll help right away, or grab a teammate if I can't.`
    : `Hello, thanks for reaching out to ${businessName}. Ask about hours, services, or booking and I'll help right away, or bring in a teammate if needed.`
}

export default async function WidgetPage({ params }: WidgetPageProps) {
  const { org } = await params
  const resolved = await resolveWidgetOrg(org)

  if (!resolved) {
    return (
      <div className="flex h-dvh w-full flex-col items-center justify-center gap-3 px-6 text-center">
        <span
          aria-hidden="true"
          className="flex size-11 items-center justify-center rounded-full bg-[var(--lw-muted)] text-[var(--lw-muted-fg)]"
        >
          <MessageCircle className="size-5" />
        </span>
        <div className="space-y-1">
          <p className="text-sm font-medium text-[var(--lw-fg)]">This chat isn&apos;t available right now.</p>
          <p className="text-xs text-[var(--lw-muted-fg)]">Please contact the business directly.</p>
        </div>
      </div>
    )
  }

  return (
    <WidgetChat
      orgSlug={resolved.slug}
      businessName={resolved.businessName}
      greeting={buildGreeting(resolved.businessName, resolved.brain?.tone ?? null)}
    />
  )
}
