// Shared Growth-page link helpers. Kept here (rather than inlined in each
// component) so the review dialog and the QR codes card always build the
// exact same review link from the exact same logic. See MASTER_PLAN.md §4.F.

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "your-business"
  )
}

/**
 * Demo-scale placeholder — a real deployment would resolve a Google/Facebook
 * short review link once listings are connected (MASTER_PLAN.md §4.F, [V2]
 * Google Business posting/listings).
 */
export function buildReviewLink(businessName: string | null): string {
  return `https://loc.al/r/${slugify(businessName ?? "your-business")}`
}
