// Shared typed errors for the AI backend layer (src/lib/ai/*). Kept in their
// own module (rather than inside router.ts) so generate-image.ts and other
// callers can import AllowanceDeniedError without a circular dependency.

import type { UsageFeature } from "@/lib/types"

/**
 * Thrown when a metered AI job is denied by the spend guard / per-feature
 * allowance check (src/lib/usage.ts#checkAllowance). Callers should treat
 * this distinctly from "not configured" (which resolves to `null`, not an
 * error) — an allowance denial means the org is out of quota and the UI
 * should say so, not silently fall back to demo content.
 */
export class AllowanceDeniedError extends Error {
  readonly feature: UsageFeature

  constructor(feature: UsageFeature, reason?: string) {
    super(reason ?? `Allowance denied for feature "${feature}".`)
    this.name = "AllowanceDeniedError"
    this.feature = feature
  }
}
