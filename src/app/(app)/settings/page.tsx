import { redirect } from "next/navigation"

/**
 * Redesign R2 — /settings is no longer a page of its own; it redirects to
 * the first category, Business profile. See ./layout.tsx for the shared
 * sub-nav shell and the other four category routes (business, ai, channels,
 * plan) for the actual content that used to all live on this one page.
 */
export default function SettingsPage() {
  redirect("/settings/business")
}
