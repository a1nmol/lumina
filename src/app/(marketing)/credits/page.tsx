import type { Metadata } from "next"

export const metadata: Metadata = { title: "Design assets & licenses" }

interface CreditEntry {
  name: string
  holder: string
  license: string
  licenseUrl: string
  note: string
}

const CREDITS: CreditEntry[] = [
  {
    name: "Noto Emoji",
    holder: "Google",
    license: "Apache License 2.0",
    licenseUrl: "https://github.com/googlefonts/noto-emoji/blob/main/LICENSE",
    note: "Themed decorative illustrations (festival/celebration stickers) used across seasonal poster templates.",
  },
  {
    name: "IconPark",
    holder: "ByteDance",
    license: "Apache License 2.0",
    licenseUrl: "https://github.com/bytedance/IconPark/blob/master/LICENSE",
    note: "A small set of decorative glyphs (e.g. sale/discount tags) used alongside the illustrations above.",
  },
  {
    name: "Inter",
    holder: "Rasmus Andersson (rsms)",
    license: "SIL Open Font License 1.1",
    licenseUrl: "https://github.com/rsms/inter/blob/main/LICENSE.txt",
    note: "The typeface used throughout every generated poster and the product's own interface.",
  },
]

/**
 * Static credits/licenses page — every third-party design asset vendored
 * into the code-rendered template engine (src/lib/templates/) is listed
 * here with its license, matching the marketing layout style of /privacy.
 */
export default function CreditsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-24">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Design assets & licenses</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Lumina&rsquo;s generated posters are built from real, code-rendered typography and a small set of
        vendored, license-approved decorative assets. Every one of those assets is listed below.
      </p>

      <div className="mt-8 flex flex-col gap-6">
        {CREDITS.map((credit) => (
          <section key={credit.name} className="rounded-lg border border-border bg-card p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 className="text-base font-semibold text-foreground">{credit.name}</h2>
              <span className="text-sm text-muted-foreground">{credit.holder}</span>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{credit.note}</p>
            <a
              className="mt-2 inline-flex items-center gap-1.5 text-sm text-foreground underline underline-offset-4 outline-none transition-colors hover:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 rounded-sm"
              href={credit.licenseUrl}
              target="_blank"
              rel="noreferrer"
            >
              {credit.license}
            </a>
          </section>
        ))}
      </div>

      <p className="mt-8 text-sm text-muted-foreground">
        Every other illustration, photo, and background image in Lumina — including AI-generated post
        backgrounds — is produced in-house per business, not sourced from a third-party asset library.
      </p>
    </div>
  )
}
