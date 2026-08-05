"use client"

// Client island for the admin Accounts table — row click opens the
// org-detail Sheet (design brief: "master-detail... Row click opens a
// right-side Sheet org-detail panel — not a modal, not a route"). The list
// data itself is still server-rendered (src/app/(app)/admin/page.tsx via
// getAdminStats()); this component only owns the "which row is selected"
// interaction state.

import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { relativeTime } from "@/app/(app)/contacts/utils"
import type { AdminAccountRow } from "@/lib/admin-stats"

import { ChannelIconRow } from "./channel-icons"
import { OrgDetailSheet } from "./org-detail-sheet"
import { UsageMiniBar } from "./usage-mini-bar"

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`
}

interface AccountsTableProps {
  accounts: AdminAccountRow[]
}

export function AccountsTable({ accounts }: AccountsTableProps) {
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  function openOrg(orgId: string) {
    setSelectedOrgId(orgId)
    setSheetOpen(true)
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Business</TableHead>
            <TableHead>Plan</TableHead>
            <TableHead>Usage</TableHead>
            <TableHead>Channels</TableHead>
            <TableHead>Last activity</TableHead>
            <TableHead>Spend</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                No accounts yet.
              </TableCell>
            </TableRow>
          ) : (
            accounts.map((account) => (
              <TableRow
                key={account.id}
                onClick={() => openOrg(account.id)}
                className="group/row cursor-pointer transition-colors hover:bg-muted/50"
              >
                <TableCell className="py-3">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      openOrg(account.id)
                    }}
                    className="-m-1 rounded-lg p-1 text-left font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    {account.name}
                  </button>
                </TableCell>
                <TableCell className="py-3 text-muted-foreground">{account.planName}</TableCell>
                <TableCell className="py-3">
                  <UsageMiniBar percent={account.usagePercent} />
                </TableCell>
                <TableCell className="py-3">
                  <ChannelIconRow connectedChannels={account.connectedChannels} />
                </TableCell>
                <TableCell className="py-3 text-muted-foreground">
                  {account.lastActivityAt ? relativeTime(account.lastActivityAt) : "—"}
                </TableCell>
                <TableCell className="py-3 text-muted-foreground">{formatUsd(account.spendUsd)}</TableCell>
                <TableCell className="py-3">
                  {account.isActiveThisWeek ? (
                    <Badge variant="secondary" className="bg-success/10 text-success">
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="bg-muted text-muted-foreground">
                      Quiet
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <OrgDetailSheet orgId={selectedOrgId} open={sheetOpen} onOpenChange={setSheetOpen} />
    </>
  )
}
