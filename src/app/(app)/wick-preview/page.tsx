import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { isPlatformAdmin } from "@/lib/admin"

import { WickPreviewView } from "./wick-preview-view"

export const metadata: Metadata = { title: "Wick preview" }

/**
 * Dev tool, not a user-facing feature — gate it behind the same
 * isPlatformAdmin() check as /admin so it never ships to regular org users
 * (audit finding: this was previously reachable by any signed-in user who
 * guessed the URL).
 */
export default async function WickPreviewPage() {
  if (!(await isPlatformAdmin())) notFound()

  return <WickPreviewView />
}
