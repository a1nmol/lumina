import type { ComponentType, SVGProps } from "react";
import {
  ClipboardList,
  Mail,
  MessageCircle,
  MessageSquareText,
  PhoneMissed,
  type LucideIcon,
} from "lucide-react";

/**
 * Channel identity is icon-only and monochrome (currentColor) — color stays
 * reserved for status/unread per the Phase 2 design brief. Lucide covers most
 * channels; Instagram/Facebook/Google get minimal custom outlines (deliberately
 * abstracted — no full-color brand marks inside our indigo system).
 */

type GlyphProps = SVGProps<SVGSVGElement> & { className?: string };

function glyphBase(props: GlyphProps) {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...props,
  };
}

export function InstagramGlyph(props: GlyphProps) {
  return (
    <svg {...glyphBase(props)}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function FacebookGlyph(props: GlyphProps) {
  return (
    <svg {...glyphBase(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M13.5 21v-7h2.2l.4-2.6h-2.6V9.7c0-.8.3-1.4 1.5-1.4h1.2V6c-.3 0-1 -.1-1.9-.1-2 0-3.3 1.2-3.3 3.4v2.1H9v2.6h2v7" />
    </svg>
  );
}

export function GoogleGlyph(props: GlyphProps) {
  return (
    <svg {...glyphBase(props)}>
      <path d="M20.5 12.2c0-.6-.1-1.2-.2-1.8H12v3.5h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.6-3.9 2.6-6.6Z" />
      <path d="M12 21a8.6 8.6 0 0 0 5.9-2.2l-2.9-2.2a5.4 5.4 0 0 1-8-2.8H4v2.3A9 9 0 0 0 12 21Z" />
      <path d="M7 13.8a5.4 5.4 0 0 1 0-3.5V8H4a9 9 0 0 0 0 8.1l3-2.3Z" />
      <path d="M12 6.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 4 8l3 2.3A5.4 5.4 0 0 1 12 6.6Z" />
    </svg>
  );
}

export type Channel =
  | "web_chat"
  | "form"
  | "sms"
  | "email"
  | "instagram"
  | "facebook"
  | "google"
  | "missed_call";

export const CHANNEL_GLYPHS: Record<
  Channel,
  { icon: LucideIcon | ComponentType<GlyphProps>; label: string }
> = {
  web_chat: { icon: MessageCircle, label: "Web chat" },
  form: { icon: ClipboardList, label: "Form" },
  sms: { icon: MessageSquareText, label: "SMS" },
  email: { icon: Mail, label: "Email" },
  instagram: { icon: InstagramGlyph, label: "Instagram" },
  facebook: { icon: FacebookGlyph, label: "Facebook" },
  google: { icon: GoogleGlyph, label: "Google" },
  missed_call: { icon: PhoneMissed, label: "Missed call" },
};

export function ChannelGlyph({
  channel,
  className,
}: {
  channel: Channel;
  className?: string;
}) {
  const meta = CHANNEL_GLYPHS[channel];
  const Icon = meta.icon;
  return <Icon className={className} aria-label={meta.label} />;
}
