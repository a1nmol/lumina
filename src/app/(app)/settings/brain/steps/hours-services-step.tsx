"use client"

import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Plus, Trash2 } from "lucide-react"

import type { BusinessBrain, BusinessHours, BusinessService } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { duration, easing } from "@/lib/motion"
import { DAY_ORDER } from "../constants"

type HoursServicesStepProps = {
  brain: BusinessBrain
  onChange: (patch: Partial<BusinessBrain>) => void
}

export function HoursServicesStep({ brain, onChange }: HoursServicesStepProps) {
  const reduceMotion = useReducedMotion()

  function updateDay(
    day: string,
    patch: Partial<{ open: string; close: string; closed: boolean }>
  ) {
    const current = brain.hours[day] ?? { open: "09:00", close: "17:00" }
    const nextHours: BusinessHours = { ...brain.hours, [day]: { ...current, ...patch } }
    onChange({ hours: nextHours })
  }

  function updateService(index: number, patch: Partial<BusinessService>) {
    const nextServices = brain.services.map((service, i) =>
      i === index ? { ...service, ...patch } : service
    )
    onChange({ services: nextServices })
  }

  function addService() {
    onChange({ services: [...brain.services, { name: "", price: "" }] })
  }

  function removeService(index: number) {
    onChange({ services: brain.services.filter((_, i) => i !== index) })
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-foreground">Weekly hours</h3>
        <div className="flex flex-col divide-y divide-border rounded-xl ring-1 ring-foreground/10">
          {DAY_ORDER.map(({ key, label }) => {
            const day = brain.hours[key]
            const closed = day?.closed ?? false
            return (
              <div key={key} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="w-24 shrink-0 text-sm font-medium text-foreground">{label}</span>
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <Input
                    type="time"
                    aria-label={`${label} opening time`}
                    value={day?.open ?? "09:00"}
                    onChange={(event) => updateDay(key, { open: event.target.value })}
                    disabled={closed}
                    className="w-28"
                  />
                  <span className="text-sm text-muted-foreground" aria-hidden="true">
                    to
                  </span>
                  <Input
                    type="time"
                    aria-label={`${label} closing time`}
                    value={day?.close ?? "17:00"}
                    onChange={(event) => updateDay(key, { close: event.target.value })}
                    disabled={closed}
                    className="w-28"
                  />
                </div>
                <Label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                  Closed
                  <Switch
                    checked={closed}
                    onCheckedChange={(checked) => updateDay(key, { closed: Boolean(checked) })}
                    aria-label={`Mark ${label} closed`}
                  />
                </Label>
              </div>
            )
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-foreground">Services & pricing</h3>
        <div className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {brain.services.map((service, index) => (
              <motion.div
                key={index}
                initial={reduceMotion ? false : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={reduceMotion ? undefined : { opacity: 0, height: 0 }}
                transition={{ duration: duration.base, ease: easing.out }}
                className="flex items-center gap-2 overflow-hidden"
              >
                <Input
                  value={service.name}
                  onChange={(event) => updateService(index, { name: event.target.value })}
                  placeholder="Service name"
                  aria-label="Service name"
                  className="flex-1"
                />
                <Input
                  value={service.price ?? ""}
                  onChange={(event) => updateService(index, { price: event.target.value })}
                  placeholder="$0"
                  aria-label="Service price"
                  className="w-28"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeService(index)}
                  aria-label={`Remove ${service.name || "service"}`}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </Button>
              </motion.div>
            ))}
          </AnimatePresence>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addService}
            className="self-start"
          >
            <Plus aria-hidden="true" className="size-3.5" />
            Add another service
          </Button>
        </div>
      </section>
    </div>
  )
}
