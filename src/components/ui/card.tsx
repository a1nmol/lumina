import * as React from "react"
import { Slot } from "@radix-ui/react-slot"

import { cn } from "@/lib/utils"

function Card({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm" }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl bg-card py-(--card-spacing) text-sm text-card-foreground ring-1 ring-foreground/10 [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, asChild = false, ...props }: React.ComponentProps<"div"> & { asChild?: boolean }) {
  // asChild (Radix Slot): lets a call site render a REAL heading element
  // (e.g. account-forms' <h2>) with CardTitle's exact styling when the page
  // outline needs it — CardTitle is otherwise a div by convention.
  const Comp = asChild ? Slot : "div"
  return (
    <Comp
      data-slot="card-title"
      className={cn(
        // Dense UI chrome — deliberately font-sans, never the display serif
        // (that's reserved for page-hero headlines / big stat numerals /
        // empty-state headlines / celebration moments; see globals.css).
        "text-base leading-snug font-medium group-data-[size=sm]/card:text-sm",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

/**
 * The one shared "tinted icon chip" convention for card headers app-wide
 * (settings/growth/voice cards) — a small rounded-lg bg-primary/10
 * text-primary chip that wraps a Lucide icon. Sits next to CardTitle inside
 * a `<div className="flex items-center gap-2">`, e.g.:
 *
 *   <CardHeader>
 *     <div className="flex items-center gap-2">
 *       <CardIcon><Phone /></CardIcon>
 *       <CardTitle>AI Receptionist</CardTitle>
 *     </div>
 *     <CardDescription>…</CardDescription>
 *   </CardHeader>
 *
 * `size="sm"` matches `<Card size="sm">`'s tighter card rhythm.
 */
function CardIcon({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"span"> & { size?: "default" | "sm" }) {
  return (
    <span
      aria-hidden="true"
      data-slot="card-icon"
      data-size={size}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary",
        "data-[size=default]:size-8 data-[size=default]:[&_svg:not([class*='size-'])]:size-4",
        "data-[size=sm]:size-7 data-[size=sm]:[&_svg:not([class*='size-'])]:size-3.5",
        className
      )}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-(--card-spacing)", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-xl border-t bg-muted/50 p-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardIcon,
  CardAction,
  CardDescription,
  CardContent,
}
