"use client"

// Confirm dialog for moving an org to a different plan (design brief:
// "changing opens a Dialog confirm showing a small before/after diff of
// non-overridden fields"). Fully controlled by the parent Sheet so both
// entry points — the header's Actions dropdown ("Change plan…") and the
// Plan section's own Select — can drive the same dialog instance.

import { ArrowRight, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { computePlanDiff, type EntitlementOverrides } from "@/lib/entitlement-overrides"
import { FEATURE_FLAG_LABELS, PLAN_CATALOG, PLAN_LIMIT_LABELS, PLAN_ORDER, type PlanId } from "@/lib/plans"

const DIFF_LABELS = { limits: PLAN_LIMIT_LABELS, flags: FEATURE_FLAG_LABELS }

interface ChangePlanDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentPlanId: string
  overrides: EntitlementOverrides
  targetPlanId: PlanId
  onTargetPlanChange: (planId: PlanId) => void
  pending: boolean
  onConfirm: () => void
}

export function ChangePlanDialog({
  open,
  onOpenChange,
  currentPlanId,
  overrides,
  targetPlanId,
  onTargetPlanChange,
  pending,
  onConfirm,
}: ChangePlanDialogProps) {
  const diff = computePlanDiff(currentPlanId, overrides, targetPlanId, DIFF_LABELS)
  const noChange = targetPlanId === currentPlanId
  const hasDiff = diff.capDiffs.length > 0 || diff.flagDiffs.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change plan</DialogTitle>
          <DialogDescription>
            Resets un-overridden limits and flags to the new plan&apos;s defaults. Existing overrides are kept.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Select value={targetPlanId} onValueChange={(value) => onTargetPlanChange(value as PlanId)}>
            <SelectTrigger className="w-full" aria-label="Move to plan">
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
        </div>

        {noChange ? (
          <p className="text-sm text-muted-foreground">Already on this plan — pick a different one to compare.</p>
        ) : !hasDiff ? (
          <p className="text-sm text-muted-foreground">
            No non-overridden limits or flags would change — this org&apos;s overrides cover everything that differs.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5 rounded-lg bg-muted/50 p-3">
            {diff.capDiffs.map((entry) => (
              <div key={entry.key} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-foreground">{entry.label}</span>
                <span className="flex items-center gap-1.5 text-muted-foreground tabular-nums">
                  {entry.from ?? "—"}
                  <ArrowRight aria-hidden="true" className="size-3" />
                  <span className="font-medium text-foreground">{entry.to ?? "—"}</span>
                </span>
              </div>
            ))}
            {diff.flagDiffs.map((entry) => (
              <div key={entry.flag} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-foreground">{entry.label}</span>
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  {entry.from ? "On" : "Off"}
                  <ArrowRight aria-hidden="true" className="size-3" />
                  <span className="font-medium text-foreground">{entry.to ? "On" : "Off"}</span>
                </span>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={pending || noChange}>
            {pending ? (
              <Loader2 aria-hidden="true" data-icon="inline-start" className="size-3.5 animate-spin" />
            ) : null}
            {pending ? "Moving…" : `Move to ${PLAN_CATALOG[targetPlanId].name}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
