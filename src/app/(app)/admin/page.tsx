import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Activity, CircleDollarSign, Gauge, Info, Users } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { isPlatformAdmin } from "@/lib/admin"
import { DEMO_ORG } from "@/lib/demo"
import { formatMonthlyPrice, PLAN_CATALOG, PLAN_LIMIT_LABELS, PLAN_ORDER } from "@/lib/plans"

export const metadata: Metadata = { title: "Admin" }

const STATS = [
  {
    label: "Accounts",
    value: 1,
    icon: <Users aria-hidden="true" className="size-3.5" />,
  },
  {
    label: "Active this week",
    value: 1,
    icon: <Activity aria-hidden="true" className="size-3.5" />,
  },
  {
    label: "AI spend this month",
    value: "$0.00",
    icon: <CircleDollarSign aria-hidden="true" className="size-3.5" />,
  },
  {
    label: "Usage events",
    value: 0,
    icon: <Gauge aria-hidden="true" className="size-3.5" />,
  },
]

export default async function AdminPage() {
  if (!(await isPlatformAdmin())) notFound()

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader
        title="Admin"
        description="Per-account usage, spend, and plan status across every business on Lumina."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {STATS.map((stat, index) => (
          <StatCard key={stat.label} index={index} {...stat} />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Accounts</CardTitle>
          <CardDescription>
            Every business currently on Lumina, invite-only test phase.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Usage this month</TableHead>
                <TableHead>Spend</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium text-foreground">{DEMO_ORG.name}</TableCell>
                <TableCell className="text-muted-foreground">Free test</TableCell>
                <TableCell className="text-muted-foreground">—</TableCell>
                <TableCell className="text-muted-foreground">$0.00</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="bg-success/10 text-success">
                    Active
                  </Badge>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Plans</CardTitle>
          <CardDescription>
            The subscription tiers structured in <code className="rounded bg-muted px-1 py-0.5 text-xs">src/lib/plans.ts</code> — pricing and limits are indicative only, billing isn&apos;t turned on yet. Every account is on Free (Test Phase) during the invite-only phase.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Limits</TableHead>
                <TableHead>Flags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {PLAN_ORDER.map((planId) => {
                const plan = PLAN_CATALOG[planId]
                return (
                  <TableRow key={plan.id}>
                    <TableCell className="align-top">
                      <div className="flex flex-col gap-0.5">
                        <span className="flex items-center gap-1.5 font-medium text-foreground">
                          {plan.name}
                          {planId === "free_test" && (
                            <Badge variant="secondary" className="bg-success/10 text-success">
                              Current
                            </Badge>
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground">{plan.tagline}</span>
                      </div>
                    </TableCell>
                    <TableCell className="align-top text-foreground tabular-nums">
                      {formatMonthlyPrice(plan.monthly_price_cents)}
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex flex-wrap gap-1.5">
                        {(Object.keys(PLAN_LIMIT_LABELS) as (keyof typeof PLAN_LIMIT_LABELS)[]).map((key) => {
                          const value = plan.limits[key]
                          if (value === undefined) return null
                          const display = key === "spend_cap_usd" ? `$${value}` : value
                          return (
                            <Badge key={key} variant="outline" className="font-normal">
                              {PLAN_LIMIT_LABELS[key]}: <span className="tabular-nums">{display}</span>
                            </Badge>
                          )
                        })}
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(plan.featureFlags).map(([flag, enabled]) => (
                          <Badge
                            key={flag}
                            variant={enabled ? "secondary" : "outline"}
                            className={enabled ? "bg-primary/10 text-primary font-normal" : "font-normal text-muted-foreground"}
                          >
                            {flag.replace(/_/g, " ")}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Alert>
        <Info aria-hidden="true" className="size-4 text-muted-foreground" />
        <AlertTitle>Usage metering is live server-side</AlertTitle>
        <AlertDescription>
          Every AI call already records cost and units via{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">usage.ts</code> and the spend
          guard. This table populates with real accounts once Supabase is configured.
        </AlertDescription>
      </Alert>
    </div>
  )
}
