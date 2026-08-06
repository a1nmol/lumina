"use client"

import { useId } from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts"

import { Skeleton } from "@/components/ui/skeleton"
import { useMounted } from "@/hooks/use-mounted"
import type { DailyPoint } from "./derive-daily-series"

type LeadsBookingsChartProps = {
  data: DailyPoint[]
}

function ChartTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null

  return (
    <div className="rounded-lg bg-popover px-3 py-2 text-xs text-popover-foreground shadow-raised ring-1 ring-foreground/10">
      <p className="mb-1 font-medium text-foreground">{label}</p>
      <div className="flex flex-col gap-0.5">
        {payload.map((entry) => (
          <div key={String(entry.dataKey)} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-muted-foreground capitalize">{String(entry.dataKey)}</span>
            <span className="ml-auto font-medium tabular-nums text-foreground">{String(entry.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * "Leads & bookings over time" area chart. Client-only with a mounted gate
 * (Recharts measures via ResizeObserver — an SSR pass would render 0-width).
 * A visually-hidden data table mirrors the chart so the values stay
 * available to screen readers / keyboard users (design-brief AA requirement:
 * "chart values available as text").
 */
export function LeadsBookingsChart({ data }: LeadsBookingsChartProps) {
  const mounted = useMounted()
  const leadsGradientId = useId()
  const bookingsGradientId = useId()

  const totalLeads = data.reduce((sum, point) => sum + point.leads, 0)
  const totalBookings = data.reduce((sum, point) => sum + point.bookings, 0)

  return (
    <div className="rounded-2xl bg-card p-4 shadow-raised ring-1 ring-border/40">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-foreground">Leads &amp; bookings over time</h3>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-[var(--color-chart-1)]" />
            Leads
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-[var(--color-chart-2)]" />
            Bookings
          </span>
        </div>
      </div>

      {mounted ? (
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id={leadsGradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id={bookingsGradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-chart-2)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--color-chart-2)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                axisLine={{ stroke: "var(--border)" }}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={28}
              />
              <Tooltip content={ChartTooltip} cursor={{ stroke: "var(--border)" }} />
              <Area
                type="monotone"
                dataKey="leads"
                stroke="var(--color-chart-1)"
                strokeWidth={2}
                fill={`url(#${leadsGradientId})`}
              />
              <Area
                type="monotone"
                dataKey="bookings"
                stroke="var(--color-chart-2)"
                strokeWidth={2}
                fill={`url(#${bookingsGradientId})`}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <Skeleton className="h-56 w-full" />
      )}

      <table className="sr-only">
        <caption>Leads and bookings per day</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Leads</th>
            <th scope="col">Bookings</th>
          </tr>
        </thead>
        <tbody>
          {data.map((point) => (
            <tr key={point.date}>
              <th scope="row">{point.label}</th>
              <td>{point.leads}</td>
              <td>{point.bookings}</td>
            </tr>
          ))}
          <tr>
            <th scope="row">Total</th>
            <td>{totalLeads}</td>
            <td>{totalBookings}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
