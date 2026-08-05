"use client"

import Link from "next/link"
import { motion, useReducedMotion } from "framer-motion"
import { BrainCircuit, Check } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardIcon,
  CardTitle,
} from "@/components/ui/card"
import { duration, easing } from "@/lib/motion"
import type { BusinessBrain } from "@/lib/types"
import { cn } from "@/lib/utils"

import type { Completeness } from "./brain-completeness"

type BrainSummaryCardProps = {
  brain: BusinessBrain
  completeness: Completeness
}

const RADIUS = 26
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function BrainSummaryCard({ brain, completeness }: BrainSummaryCardProps) {
  const reduceMotion = useReducedMotion()
  const { percent, fields } = completeness
  const offset = CIRCUMFERENCE * (1 - percent / 100)

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardIcon>
            <BrainCircuit />
          </CardIcon>
          <CardTitle>{brain.business_name || "Your Business Brain"}</CardTitle>
        </div>
        <CardDescription>
          The info that powers your content and FrontDesk agent — hours, services, tone, and
          channels.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className="flex shrink-0 items-center gap-4">
          <svg viewBox="0 0 64 64" className="size-16 -rotate-90" aria-hidden="true">
            <circle cx="32" cy="32" r={RADIUS} fill="none" stroke="var(--muted)" strokeWidth="6" />
            <motion.circle
              cx="32"
              cy="32"
              r={RADIUS}
              fill="none"
              stroke="var(--primary)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              initial={reduceMotion ? false : { strokeDashoffset: CIRCUMFERENCE }}
              animate={{ strokeDashoffset: offset }}
              transition={{ duration: reduceMotion ? 0 : duration.slow, ease: easing.out }}
            />
          </svg>
          <div className="flex flex-col">
            {/* Metric display, not a headline — font-mono + tabular-nums so
                the digits don't reflow as the ring animates. */}
            <span className="font-mono text-2xl leading-none font-semibold text-foreground tabular-nums">
              {percent}%
            </span>
            <span className="text-xs text-muted-foreground">complete</span>
          </div>
        </div>

        <ul className="grid flex-1 grid-cols-2 gap-x-4 gap-y-1.5">
          {fields.map((field) => (
            <li key={field.label} className="flex items-center gap-1.5 text-xs">
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-3.5 shrink-0 items-center justify-center rounded-full",
                  field.filled ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
                )}
              >
                {field.filled && <Check className="size-2.5" />}
              </span>
              <span className={field.filled ? "text-foreground" : "text-muted-foreground"}>
                {field.label}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>

      <CardFooter className="justify-end">
        <Button render={<Link href="/settings/brain" />}>
          {percent === 0 ? "Start setup" : "Edit Business Brain"}
        </Button>
      </CardFooter>
    </Card>
  )
}
