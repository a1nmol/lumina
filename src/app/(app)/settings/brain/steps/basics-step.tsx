"use client"

import type { BusinessBrain } from "@/lib/types"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CATEGORY_OPTIONS } from "../constants"

type BasicsStepProps = {
  brain: BusinessBrain
  onChange: (patch: Partial<BusinessBrain>) => void
}

export function BasicsStep({ brain, onChange }: BasicsStepProps) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="business-name">Business name</Label>
        <Input
          id="business-name"
          value={brain.business_name ?? ""}
          onChange={(event) => onChange({ business_name: event.target.value })}
          placeholder="Sunrise Bakery"
          autoComplete="organization"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="business-category">Category</Label>
        <Select
          value={brain.category ?? null}
          onValueChange={(value) => onChange({ category: value as string })}
        >
          <SelectTrigger id="business-category" className="w-full">
            <SelectValue placeholder="Choose a category" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_OPTIONS.map((category) => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="business-description">One-line description</Label>
        <Textarea
          id="business-description"
          value={brain.description ?? ""}
          onChange={(event) => onChange({ description: event.target.value })}
          placeholder="A neighborhood bakery serving fresh sourdough, pastries, and coffee since 2019."
          rows={2}
        />
      </div>
    </div>
  )
}
