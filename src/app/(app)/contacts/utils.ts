// Shared helpers for the Contacts/CRM surface — avatar initials, relative
// time, and a source→(icon,label) map that extends the shared channel glyph
// set (src/components/inbox/channel-glyphs.tsx) with the CRM-only "manual"
// source (a contact added by hand has no conversation channel).

import { formatDistanceToNowStrict } from "date-fns"
import { UserPlus, type LucideIcon } from "lucide-react"
import type { ComponentType, SVGProps } from "react"

import { CHANNEL_GLYPHS } from "@/components/inbox/channel-glyphs"
import type { ContactSource } from "@/lib/types"

type GlyphProps = SVGProps<SVGSVGElement> & { className?: string }

export const SOURCE_META: Record<
  ContactSource,
  { icon: LucideIcon | ComponentType<GlyphProps>; label: string }
> = {
  ...CHANNEL_GLYPHS,
  manual: { icon: UserPlus, label: "Manual" },
}

/** "EM" from "Emma Rodriguez", "AB" from single-word "Aisha" → "AI". Falls back to "?" for no name. */
export function initials(name: string | null | undefined): string {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? []
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase()
}

/** "3 hours ago" / "in 2 days" — used for "Last activity" and appointment times. */
export function relativeTime(iso: string): string {
  return formatDistanceToNowStrict(new Date(iso), { addSuffix: true })
}

/** name → email → phone → "Unnamed contact", for display where a name is expected but may be missing. */
export function displayName(contact: { name: string | null; email: string | null; phone: string | null }): string {
  return contact.name?.trim() || contact.email || contact.phone || "Unnamed contact"
}
