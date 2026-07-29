import type { Metadata } from "next"

export const metadata: Metadata = { title: "Terms of service" }

/** Terms of service — pilot-stage plain language; revisit before GA. */
export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-24">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Terms of service</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: July 2026 · Lumina (pilot)</p>

      <div className="mt-8 flex flex-col gap-6 text-sm leading-relaxed text-muted-foreground">
        <p>
          Lumina is currently an invite-only pilot, provided free and as-is while we build. By using it you
          agree to: use it only for your own business, keep your account credentials safe, and not misuse
          connected platforms (including Instagram) in ways that violate their terms.
        </p>
        <p>
          AI-generated content and replies are drafts and suggestions — the business is responsible for what
          it publishes and sends. We may change or pause features during the pilot. We may terminate accounts
          that abuse the service.
        </p>
        <p>
          Questions:{" "}
          <a className="underline underline-offset-4 text-foreground" href="mailto:whoisanmolsubediii@gmail.com">
            whoisanmolsubediii@gmail.com
          </a>
        </p>
      </div>
    </div>
  )
}
