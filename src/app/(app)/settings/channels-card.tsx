// "Connected channels" card for the Settings hub — the Meta (Facebook/
// Instagram) CONNECT layer (src/lib/social/meta.ts). Connection layer
// only: lists this org's social_connections, lets the owner start the
// Facebook OAuth dialog or disconnect a Page. Publishing/insights against
// these connections are a later wave (MASTER_PLAN.md §4.B/§4.E).
//
// Server component — reads directly via the service-role admin client
// (social_connections has no `authenticated` SELECT-bypassing need here,
// but every write to it is service-role only, so reads go through the same
// trusted path for consistency; see supabase/migrations/0008_social_connections.sql).

import { CheckCircle2, Share2, TriangleAlert } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getCurrentOrgId } from "@/lib/org"
import { createAdminClient } from "@/lib/supabase/admin"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import type { SocialConnection } from "@/lib/types"
import { cn } from "@/lib/utils"

import { DisconnectChannelButton } from "./disconnect-channel-button"

const META_ERROR_MESSAGES: Record<string, string> = {
  not_configured: "Meta connect isn't set up yet.",
  no_org: "Couldn't find your business to connect.",
  denied: "You cancelled the Facebook sign-in.",
  invalid_request: "That connection request wasn't valid — please try again.",
  invalid_state: "That connection link expired — please try connecting again.",
  org_mismatch: "That connection link doesn't match your account — please try again.",
  no_pages: "No Facebook Pages were found on that account. Connect a Page you manage.",
  connection_failed: "Something went wrong connecting to Facebook. Please try again.",
}

type ChannelsCardProps = {
  /** From ?connected=meta on the settings URL (src/app/api/social/meta/callback/route.ts's success redirect). */
  connectedParam?: string
  /** From ?metaError=<reason> on the settings URL (every failure redirect in the start/callback routes). */
  errorParam?: string
}

async function loadConnections(orgId: string): Promise<SocialConnection[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("social_connections")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[settings/channels-card] failed to load social_connections", error.message)
    return []
  }

  return data ?? []
}

function formatConnectedDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

export async function ChannelsCard({ connectedParam, errorParam }: ChannelsCardProps) {
  const metaConfigured = Boolean(process.env.META_APP_ID)
  const orgId = isSupabaseConfigured() ? await getCurrentOrgId() : null
  const connections = orgId ? await loadConnections(orgId) : []

  const status =
    connectedParam === "meta"
      ? { tone: "success" as const, text: "Facebook & Instagram connected." }
      : errorParam
        ? {
            tone: "error" as const,
            text: META_ERROR_MESSAGES[errorParam] ?? "Something went wrong connecting to Facebook.",
          }
        : null

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
            >
              <Share2 className="size-4" />
            </span>
            <CardTitle>Connected channels</CardTitle>
          </div>
          {!metaConfigured && <Badge variant="outline">Not configured</Badge>}
        </div>
        <CardDescription>Publish and reply from Lumina once you connect a Page.</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {status && (
          <div
            role="status"
            className={cn(
              "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
              status.tone === "success"
                ? "border-success/30 bg-success/10 text-success"
                : "border-destructive/30 bg-destructive/10 text-destructive"
            )}
          >
            {status.tone === "success" ? (
              <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            ) : (
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            )}
            <span>{status.text}</span>
          </div>
        )}

        {connections.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Connect your Facebook Page and Instagram to publish and reply from Lumina.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-xl ring-1 ring-foreground/10">
            {connections.map((connection) => (
              <li key={connection.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium text-foreground">
                    {connection.page_name ?? connection.page_id}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {connection.ig_username ? `@${connection.ig_username} · ` : ""}
                    Connected {formatConnectedDate(connection.created_at)}
                  </span>
                </div>
                <DisconnectChannelButton
                  connectionId={connection.id}
                  label={connection.page_name ?? "this channel"}
                />
              </li>
            ))}
          </ul>
        )}

        {metaConfigured ? (
          <Button type="button" variant="flame" render={<a href="/api/social/meta/start" />} className="self-start gap-1.5">
            <Share2 aria-hidden="true" data-icon="inline-start" className="size-3.5" />
            Connect Facebook & Instagram
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            Ask an admin to add Meta app credentials (META_APP_ID / META_APP_SECRET) to enable this.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
