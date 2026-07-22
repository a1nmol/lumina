// FOOTER — landing-copy.md "FOOTER". Dusk, street silhouette bottom edge,
// links with amber "lit window" dots, contact email.

import Link from "next/link"

import { Wordmark } from "./wordmark"
import { StreetSilhouette } from "./street-silhouette"

const LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#faq", label: "FAQ" },
  { href: "/privacy", label: "Privacy" },
  { href: "mailto:hello@localos.app", label: "hello@localos.app" },
]

export function MarketingFooter() {
  return (
    <footer id="footer" data-scene="footer" className="dusk-section bg-background">
      <div className="mx-auto max-w-6xl px-4 pt-12 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center gap-6 pb-10 text-center sm:flex-row sm:justify-between sm:text-left">
          <div>
            <Wordmark className="text-base text-foreground" />
            <p className="mt-1.5 text-sm text-muted-foreground">LocalOS — built for main street.</p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 rounded-sm"
              >
                <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-amber-glow shadow-[0_0_4px_var(--amber-glow)]" />
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
      <StreetSilhouette variant="scattered" className="h-16 sm:h-20" />
    </footer>
  )
}
