"use client"

import { useState } from "react"
import Link from "next/link"
import { motion, useReducedMotion } from "framer-motion"
import { Bell, BellOff, CalendarCheck, TriangleAlert, UserPlus } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { ChannelGlyph } from "@/components/inbox/channel-glyphs"
import { formatRelativeTime } from "@/components/inbox/relative-time"
import {
  useNotifications,
  type NotificationAlertType,
  type NotificationAlertWithReadState,
} from "@/components/notifications-provider"
import { buttonVariants } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { spring } from "@/lib/motion"
import { cn } from "@/lib/utils"

const ALERT_TYPE_META: Record<
  NotificationAlertType,
  { label: string; icon: LucideIcon; className: string }
> = {
  new_lead: { label: "New lead", icon: UserPlus, className: "bg-primary/10 text-primary" },
  escalated: { label: "Escalated", icon: TriangleAlert, className: "bg-destructive/10 text-destructive" },
  booking: { label: "Booking", icon: CalendarCheck, className: "bg-success/10 text-success" },
}

/**
 * Bell icon button + popover — the persistent, always-visible half of the
 * instant-lead-alert system (a toast is never the only record). Lives in the
 * app header, top-right, next to the breadcrumb. See "Instant lead alert" in
 * docs/design-briefs/phase-2-inbox-frontdesk-crm.md.
 */
export function NotificationTray() {
  const { alerts, unreadCount, markAllRead } = useNotifications()
  const reduceMotion = useReducedMotion()
  const [open, setOpen] = useState(false)

  const badgeLabel = unreadCount > 9 ? "9+" : String(unreadCount)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "relative text-muted-foreground hover:text-foreground"
        )}
      >
        <Bell aria-hidden="true" className="size-4" />
        {unreadCount > 0 && (
          <motion.span
            key={badgeLabel}
            initial={reduceMotion ? false : { scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={reduceMotion ? { duration: 0 } : spring}
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-medium text-primary-foreground ring-2 ring-background"
          >
            {badgeLabel}
          </motion.span>
        )}
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="w-80 gap-0 p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
          <span className="text-sm font-medium text-foreground">Notifications</span>
          <button
            type="button"
            disabled={unreadCount === 0}
            onClick={markAllRead}
            className="rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            Mark all read
          </button>
        </div>

        {alerts.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <BellOff aria-hidden="true" className="size-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">You&apos;re all caught up — new leads will show up here.</p>
          </div>
        ) : (
          <ul className="m-0 flex max-h-96 list-none flex-col gap-0.5 overflow-y-auto p-1.5">
            {alerts.map((alert) => (
              <AlertRow key={alert.id} alert={alert} onNavigate={() => setOpen(false)} />
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}

function AlertRow({
  alert,
  onNavigate,
}: {
  alert: NotificationAlertWithReadState
  onNavigate: () => void
}) {
  const meta = ALERT_TYPE_META[alert.type]
  const Icon = meta.icon

  return (
    <li>
      <Link
        href={alert.href}
        onClick={onNavigate}
        className="group/alert relative flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-1/2 left-0 h-4 w-1 -translate-y-1/2 rounded-full transition-colors",
            alert.read ? "bg-transparent" : "bg-primary"
          )}
        />
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ring-transparent",
            meta.className
          )}
        >
          <Icon aria-hidden="true" className="size-4" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5">
              <ChannelGlyph channel={alert.channel} className="size-3 shrink-0 text-muted-foreground" />
              <span
                className={cn(
                  "truncate text-sm text-foreground",
                  alert.read ? "font-normal" : "font-semibold"
                )}
              >
                {alert.contactName}
              </span>
            </span>
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {formatRelativeTime(alert.createdAt)}
            </span>
          </span>
          <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{alert.reason}</span>
          <span className="mt-1 inline-block text-xs font-medium text-primary opacity-0 transition-opacity group-hover/alert:opacity-100 group-focus-visible/alert:opacity-100">
            View
          </span>
        </span>
      </Link>
    </li>
  )
}
