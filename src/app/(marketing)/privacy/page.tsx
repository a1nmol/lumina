import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = { title: "Privacy" }

/**
 * Minimal stub so the footer's "Privacy" link (landing-copy.md "FOOTER")
 * never 404s. A full privacy policy is out of scope for Gate 2 — this page
 * exists purely to keep the footer link honest until legal copy lands.
 */
export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-24 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Privacy</h1>
      <p className="mt-4 text-muted-foreground">
        We&rsquo;re still writing this one. In the meantime, reach us any time at{" "}
        <a href="mailto:hello@localos.app" className="text-primary underline-offset-4 hover:underline">
          hello@localos.app
        </a>
        .
      </p>
      <Link
        href="/"
        className="mt-8 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        ← Back home
      </Link>
    </div>
  )
}
