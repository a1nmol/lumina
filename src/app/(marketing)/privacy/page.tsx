import type { Metadata } from "next"

export const metadata: Metadata = { title: "Privacy policy" }

/**
 * Privacy policy — required for the Meta app's Live mode (and simply the
 * right thing to publish). Plain, honest, pilot-stage language; revisit
 * with counsel before GA.
 */
export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-24">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Privacy policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: July 2026 · Lumina (pilot)</p>

      <div className="mt-8 flex flex-col gap-6 text-sm leading-relaxed text-foreground">
        <section>
          <h2 className="mb-1.5 text-base font-semibold">What Lumina is</h2>
          <p className="text-muted-foreground">
            Lumina helps local businesses create content and answer their customers. During the pilot,
            it is offered free to invited businesses.
          </p>
        </section>
        <section>
          <h2 className="mb-1.5 text-base font-semibold">What we collect</h2>
          <p className="text-muted-foreground">
            Account details you give us (name, email, business info), content you create in Lumina, and —
            when a business connects a channel such as Instagram, SMS, or web chat — the messages customers
            send to that business, so we can display them in the business&rsquo;s inbox and help draft replies.
          </p>
        </section>
        <section>
          <h2 className="mb-1.5 text-base font-semibold">How we use it</h2>
          <p className="text-muted-foreground">
            Only to run the product: showing conversations to the business they belong to, drafting replies,
            generating content, and measuring what worked. We do not sell personal data. Customer-facing
            messages are processed with commercial AI providers under agreements that prohibit training on
            that data.
          </p>
        </section>
        <section>
          <h2 className="mb-1.5 text-base font-semibold">Instagram and other connected platforms</h2>
          <p className="text-muted-foreground">
            When a business connects Instagram, we access only what Meta&rsquo;s permissions allow — the
            business account&rsquo;s messages, comments, and basic profile — to power that business&rsquo;s
            inbox. Disconnecting the channel in Settings stops this access; you can also revoke it from your
            Instagram account settings at any time.
          </p>
        </section>
        <section>
          <h2 className="mb-1.5 text-base font-semibold">Storage and deletion</h2>
          <p className="text-muted-foreground">
            Data is stored with our hosting providers (Vercel, Supabase) with per-business isolation. Email
            {" "}<a className="underline underline-offset-4" href="mailto:whoisanmolsubediii@gmail.com">whoisanmolsubediii@gmail.com</a>{" "}
            to request deletion of your data — we honor requests within 30 days.
          </p>
        </section>
      </div>
    </div>
  )
}
