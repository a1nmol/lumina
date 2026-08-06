"use client"

// Master-detail right-hand Sheet for the platform Admin panel (Outlast wave
// 4 design brief). Opened by clicking an Accounts table row (src/app/(app)/
// admin/accounts-table.tsx). Owns all Sheet-local state; every write goes
// through src/app/(app)/admin/actions.ts (service-role, isPlatformAdmin()-
// gated) and comes back with a freshly-recomputed OrgDetail so the Sheet
// never has to re-derive server truth by hand.

import { useEffect, useState } from "react"
import { Loader2, MoreHorizontal } from "lucide-react"
import { toast } from "sonner"

import { relativeTime } from "@/app/(app)/contacts/utils"
import { UsageBar } from "@/app/(app)/settings/usage-bar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import {
  clearCapOverride,
  clearFlagOverride,
  isCapOverridden,
  isFlagOverridden,
  mergeFlagOverride,
} from "@/lib/entitlement-overrides"
import {
  FEATURE_FLAG_GROUPS,
  FEATURE_FLAG_LABELS,
  PLAN_CATALOG,
  PLAN_LIMIT_KEYS,
  PLAN_LIMIT_LABELS,
  PLAN_ORDER,
  type PlanId,
  type PlanLimitKey,
} from "@/lib/plans"

import {
  clearOrgCapOverride,
  clearOrgFlagOverride,
  getOrgDetail,
  resetOrgToPlanDefaults,
  setOrgCapOverrides,
  setOrgFlagOverride,
  setOrgPlan,
  type OrgDetail,
} from "./actions"
import { CapRow } from "./cap-row"
import { ChangePlanDialog } from "./change-plan-dialog"
import { ChannelBadgeList } from "./channel-icons"
import { EntitlementRow } from "./entitlement-row"

interface OrgDetailSheetProps {
  orgId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function planLabelFor(planId: string): string {
  return PLAN_CATALOG[planId as PlanId]?.name ?? planId
}

function buildCapDrafts(effectiveLimits: OrgDetail["effectiveLimits"]): Record<PlanLimitKey, string> {
  const drafts = {} as Record<PlanLimitKey, string>
  for (const key of PLAN_LIMIT_KEYS) {
    drafts[key] = String(effectiveLimits[key] ?? 0)
  }
  return drafts
}

function formatUsageValue(used: number, limit: number | null, isSpend: boolean) {
  const format = (value: number) => (isSpend ? `$${value.toFixed(2)}` : `${value}`)
  const valueText = limit !== null ? `${format(used)} / ${format(limit)}` : `${format(used)} used`
  const percent = limit ? Math.min(100, (used / limit) * 100) : 0
  const nearLimit = limit !== null && limit > 0 && used / limit >= 0.9
  return { valueText, percent, nearLimit }
}

const USAGE_FEATURE_ORDER: { key: PlanLimitKey; label: string }[] = [
  { key: "content_generations", label: PLAN_LIMIT_LABELS.content_generations },
  { key: "images", label: PLAN_LIMIT_LABELS.images },
  { key: "slideshows", label: PLAN_LIMIT_LABELS.slideshows },
  { key: "ai_replies", label: PLAN_LIMIT_LABELS.ai_replies },
]

export function OrgDetailSheet({ orgId, open, onOpenChange }: OrgDetailSheetProps) {
  const [detail, setDetail] = useState<OrgDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  // Set only inside the fetch's `.then()` (never synchronously at the top of
  // the effect below — react-hooks/set-state-in-effect), so `loading` can be
  // derived from real state during render without touching a ref
  // (react-hooks/refs forbids reading `ref.current` during render).
  const [settledOrgId, setSettledOrgId] = useState<string | null>(null)

  const [pendingFlag, setPendingFlag] = useState<string | null>(null)
  const [pendingCapKey, setPendingCapKey] = useState<PlanLimitKey | null>(null)

  const [capDrafts, setCapDrafts] = useState<Record<PlanLimitKey, string>>({} as Record<PlanLimitKey, string>)
  const [syncedRevision, setSyncedRevision] = useState<string | null>(null)
  const [savingCaps, setSavingCaps] = useState(false)
  const [capSaveError, setCapSaveError] = useState<string | null>(null)

  const [changePlanOpen, setChangePlanOpen] = useState(false)
  const [changePlanTarget, setChangePlanTarget] = useState<PlanId>("free_test")
  const [changePlanPending, setChangePlanPending] = useState(false)

  const [resetAllOpen, setResetAllOpen] = useState(false)
  const [resetAllPending, setResetAllPending] = useState(false)

  useEffect(() => {
    if (!open || !orgId) return
    let cancelled = false
    getOrgDetail(orgId).then((result) => {
      if (cancelled) return
      setSettledOrgId(orgId)
      if (result.ok) {
        setDetail(result.detail)
        setLoadError(null)
      } else {
        setDetail(null)
        setLoadError(result.error)
      }
    })
    return () => {
      cancelled = true
    }
  }, [open, orgId])

  const loading = Boolean(open && orgId && settledOrgId !== orgId)

  // Resync cap drafts whenever a freshly-persisted revision of this org's
  // entitlements arrives (initial load, or any successful mutation).
  // Deliberately not an effect — "adjust state during render" per React's
  // guidance, same pattern as src/app/(app)/contacts/contact-drawer.tsx.
  // Trade-off: this also clears any UNSAVED cap edits when a different
  // section's action (e.g. a flag toggle) completes and returns a new
  // `entitlementsUpdatedAt` — acceptable for a single-operator admin tool.
  const revisionKey = detail ? `${detail.id}:${detail.entitlementsUpdatedAt ?? "new"}` : null
  if (detail && revisionKey !== syncedRevision) {
    setSyncedRevision(revisionKey)
    setCapDrafts(buildCapDrafts(detail.effectiveLimits))
    setCapSaveError(null)
  }

  if (!open || !orgId) return null

  async function handleToggleFlag(flag: string, next: boolean) {
    if (!detail || !orgId) return
    const previous = detail
    setDetail({
      ...detail,
      effectiveFlags: { ...detail.effectiveFlags, [flag]: next },
      overrides: mergeFlagOverride(detail.overrides, flag, next),
    })
    setPendingFlag(flag)
    const result = await setOrgFlagOverride(orgId, flag, next)
    setPendingFlag(null)
    if (!result.ok) {
      setDetail(previous)
      toast.error("Couldn't update this flag", { description: "Reverted — please try again." })
      return
    }
    setDetail(result.detail)
  }

  async function handleResetFlag(flag: string) {
    if (!detail || !orgId) return
    const previous = detail
    const planFlags = PLAN_CATALOG[detail.planId as PlanId]?.featureFlags ?? PLAN_CATALOG.free_test.featureFlags
    setDetail({
      ...detail,
      effectiveFlags: { ...detail.effectiveFlags, [flag]: Boolean(planFlags[flag]) },
      overrides: clearFlagOverride(detail.overrides, flag),
    })
    setPendingFlag(flag)
    const result = await clearOrgFlagOverride(orgId, flag)
    setPendingFlag(null)
    if (!result.ok) {
      setDetail(previous)
      toast.error("Couldn't reset this flag", { description: "Reverted — please try again." })
      return
    }
    setDetail(result.detail)
  }

  async function handleResetCap(key: PlanLimitKey) {
    if (!detail || !orgId) return
    const previous = detail
    const planLimits = PLAN_CATALOG[detail.planId as PlanId]?.limits ?? PLAN_CATALOG.free_test.limits
    setDetail({
      ...detail,
      effectiveLimits: { ...detail.effectiveLimits, [key]: planLimits[key] },
      overrides: clearCapOverride(detail.overrides, key),
    })
    setPendingCapKey(key)
    const result = await clearOrgCapOverride(orgId, key)
    setPendingCapKey(null)
    if (!result.ok) {
      setDetail(previous)
      toast.error("Couldn't reset this limit", { description: "Reverted — please try again." })
      return
    }
    setDetail(result.detail)
  }

  async function handleSaveCaps() {
    if (!detail || !orgId) return
    const patch: Partial<Record<PlanLimitKey, number>> = {}
    for (const key of dirtyKeys) {
      const parsed = Number(capDrafts[key])
      if (Number.isNaN(parsed) || parsed < 0) continue
      patch[key] = parsed
    }
    if (Object.keys(patch).length === 0) return

    setSavingCaps(true)
    setCapSaveError(null)
    const result = await setOrgCapOverrides(orgId, patch)
    setSavingCaps(false)
    if (!result.ok) {
      setCapSaveError(result.error)
      return
    }
    setDetail(result.detail)
    toast.success("Usage limits saved")
  }

  function handleDiscardCaps() {
    if (!detail) return
    setCapDrafts(buildCapDrafts(detail.effectiveLimits))
    setCapSaveError(null)
  }

  function openChangePlan(target?: PlanId) {
    if (!detail) return
    setChangePlanTarget(target ?? (detail.planId as PlanId) ?? "free_test")
    setChangePlanOpen(true)
  }

  async function handleConfirmChangePlan() {
    if (!detail || !orgId) return
    setChangePlanPending(true)
    const result = await setOrgPlan(orgId, changePlanTarget)
    setChangePlanPending(false)
    if (!result.ok) {
      toast.error("Couldn't change the plan", { description: result.error })
      return
    }
    setDetail(result.detail)
    setChangePlanOpen(false)
    toast.success(`Moved to ${PLAN_CATALOG[changePlanTarget].name}`)
  }

  async function handleConfirmResetAll() {
    if (!detail || !orgId) return
    setResetAllPending(true)
    const result = await resetOrgToPlanDefaults(orgId)
    setResetAllPending(false)
    if (!result.ok) {
      toast.error("Couldn't reset this account", { description: result.error })
      return
    }
    setDetail(result.detail)
    setResetAllOpen(false)
    toast.success("Reset to plan defaults")
  }

  const dirtyKeys = detail
    ? PLAN_LIMIT_KEYS.filter((key) => capDrafts[key] !== String(detail.effectiveLimits[key] ?? 0))
    : []
  const invalidKeys = new Set(
    dirtyKeys.filter((key) => {
      const raw = capDrafts[key]
      const parsed = Number(raw)
      return raw?.trim() === "" || Number.isNaN(parsed) || parsed < 0
    })
  )
  const canSaveCaps = dirtyKeys.length > 0 && invalidKeys.size === 0 && !savingCaps

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg">
        {loading || !detail ? (
          <SheetDetailSkeleton error={!loading ? loadError : null} />
        ) : (
          <>
            <SheetHeader className="gap-2 border-b border-border">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col gap-1">
                  <SheetTitle className="truncate">{detail.name}</SheetTitle>
                  <SheetDescription className="flex flex-wrap items-center gap-1.5">
                    <span>{detail.slug}</span>
                    <span aria-hidden="true">·</span>
                    <span>Created {relativeTime(detail.createdAt)}</span>
                  </SheetDescription>
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <Badge variant="secondary">{planLabelFor(detail.planId)}</Badge>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button variant="ghost" size="icon-sm" aria-label={`More actions for ${detail.name}`} />}
                  >
                    <MoreHorizontal aria-hidden="true" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openChangePlan()}>Change plan…</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setResetAllOpen(true)}>
                      Reset all to plan defaults…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </SheetHeader>

            <div className="flex flex-1 flex-col gap-6 p-4">
              {/* Plan */}
              <section className="flex flex-col gap-1.5">
                <h3 className="text-sm font-semibold text-foreground">Plan</h3>
                <Select
                  value={detail.planId}
                  onValueChange={(value) => {
                    if (value !== detail.planId) openChangePlan(value as PlanId)
                  }}
                >
                  <SelectTrigger className="w-full" aria-label="Current plan">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLAN_ORDER.map((planId) => (
                      <SelectItem key={planId} value={planId}>
                        {PLAN_CATALOG[planId].name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </section>

              {/* Entitlements */}
              <section className="flex flex-col gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Entitlements</h3>
                  {detail.entitlementsUpdatedAt && (
                    <p className="text-xs text-muted-foreground">Changed {relativeTime(detail.entitlementsUpdatedAt)}</p>
                  )}
                </div>
                <div className="flex flex-col divide-y divide-border">
                  {FEATURE_FLAG_GROUPS.map((group) => (
                    <div key={group.label} className="flex flex-col gap-0.5 py-2 first:pt-0">
                      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        {group.label}
                      </span>
                      <div className="flex flex-col divide-y divide-border/60">
                        {group.flags.map((flag) => {
                          const planValue = Boolean(
                            (PLAN_CATALOG[detail.planId as PlanId] ?? PLAN_CATALOG.free_test).featureFlags[flag]
                          )
                          const overridden = isFlagOverridden(detail.overrides, flag)
                          return (
                            <EntitlementRow
                              key={flag}
                              label={FEATURE_FLAG_LABELS[flag]}
                              planLabel={planLabelFor(detail.planId)}
                              planValue={planValue}
                              overridden={overridden}
                              effectiveValue={Boolean(detail.effectiveFlags[flag])}
                              disabled={pendingFlag === flag}
                              onToggle={(next) => handleToggleFlag(flag, next)}
                              onReset={() => handleResetFlag(flag)}
                            />
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Usage caps */}
              <section className="flex flex-col gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Usage caps</h3>
                  {detail.entitlementsUpdatedAt && (
                    <p className="text-xs text-muted-foreground">Changed {relativeTime(detail.entitlementsUpdatedAt)}</p>
                  )}
                </div>
                <div className="flex flex-col divide-y divide-border">
                  {PLAN_LIMIT_KEYS.map((key) => {
                    const planValue = (PLAN_CATALOG[detail.planId as PlanId] ?? PLAN_CATALOG.free_test).limits[key]
                    return (
                      <CapRow
                        key={key}
                        label={PLAN_LIMIT_LABELS[key]}
                        planLabel={planLabelFor(detail.planId)}
                        planValue={planValue}
                        overridden={isCapOverridden(detail.overrides, key)}
                        value={capDrafts[key] ?? ""}
                        invalid={invalidKeys.has(key)}
                        disabled={pendingCapKey === key || savingCaps}
                        onChange={(raw) => setCapDrafts((prev) => ({ ...prev, [key]: raw }))}
                        onReset={() => handleResetCap(key)}
                      />
                    )
                  })}
                </div>
                {capSaveError && <p className="text-sm text-destructive">{capSaveError}</p>}
                {dirtyKeys.length > 0 && (
                  <div className="flex items-center justify-between gap-2 rounded-xl bg-muted/50 p-2.5 ring-1 ring-border/40">
                    <span className="text-xs text-muted-foreground">
                      {dirtyKeys.length} change{dirtyKeys.length === 1 ? "" : "s"}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Button variant="ghost" size="sm" onClick={handleDiscardCaps} disabled={savingCaps}>
                        Discard
                      </Button>
                      <Button size="sm" onClick={handleSaveCaps} disabled={!canSaveCaps}>
                        {savingCaps ? (
                          <Loader2 aria-hidden="true" data-icon="inline-start" className="size-3.5 animate-spin" />
                        ) : null}
                        {savingCaps ? "Saving…" : `Save ${dirtyKeys.length} change${dirtyKeys.length === 1 ? "" : "s"}`}
                      </Button>
                    </div>
                  </div>
                )}
              </section>

              {/* Usage this month */}
              <section className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold text-foreground">Usage this month</h3>
                <div className="flex flex-col gap-3">
                  {USAGE_FEATURE_ORDER.map(({ key, label }) => {
                    const used = detail.usage.unitsByFeature[key] ?? 0
                    const limit = detail.effectiveLimits[key] ?? null
                    const { valueText, percent, nearLimit } = formatUsageValue(used, limit, false)
                    return <UsageBar key={key} label={label} percent={percent} valueText={valueText} nearLimit={nearLimit} />
                  })}
                  {detail.effectiveLimits.spend_cap_usd !== undefined && (
                    <UsageBar
                      label="AI spend cap"
                      {...formatUsageValue(detail.usage.totalCostUsd, detail.effectiveLimits.spend_cap_usd ?? null, true)}
                    />
                  )}
                </div>
              </section>

              {/* Channels */}
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-foreground">Channels</h3>
                <ChannelBadgeList connectedChannels={detail.connectedChannels} />
              </section>
            </div>
          </>
        )}
      </SheetContent>

      {detail && (
        <>
          <ChangePlanDialog
            open={changePlanOpen}
            onOpenChange={setChangePlanOpen}
            currentPlanId={detail.planId}
            overrides={detail.overrides}
            targetPlanId={changePlanTarget}
            onTargetPlanChange={setChangePlanTarget}
            pending={changePlanPending}
            onConfirm={handleConfirmChangePlan}
          />

          <Dialog open={resetAllOpen} onOpenChange={setResetAllOpen}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Reset all to plan defaults?</DialogTitle>
                <DialogDescription>
                  Removes every override for {detail.name} — usage caps and feature flags both go back to{" "}
                  {planLabelFor(detail.planId)}&apos;s defaults. This can&apos;t be undone from here (overrides
                  would need to be re-added one at a time).
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setResetAllOpen(false)} disabled={resetAllPending}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleConfirmResetAll} disabled={resetAllPending}>
                  {resetAllPending ? (
                    <Loader2 aria-hidden="true" data-icon="inline-start" className="size-3.5 animate-spin" />
                  ) : null}
                  {resetAllPending ? "Resetting…" : "Reset everything"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </Sheet>
  )
}

function SheetDetailSkeleton({ error }: { error: string | null }) {
  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-sm font-medium text-foreground">Couldn&apos;t load this account</p>
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col gap-6 p-4")} aria-busy="true" aria-label="Loading account details">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-5 w-20" />
      </div>
      {Array.from({ length: 4 }).map((_, sectionIndex) => (
        <div key={sectionIndex} className="flex flex-col gap-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  )
}
