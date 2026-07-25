import { describe, expect, it } from "vitest"

import type { BusinessHours } from "@/lib/types"

import { combineDateAndTime, dayKeyForDate, getTimeSlotsForDay } from "./booking-slots"

// Slot generation for the Booking MVP dialog — derived from the Business
// Brain's weekly hours. 2026-07-20 is a Monday (local time).
const MONDAY = new Date(2026, 6, 20, 12, 0, 0)
const SUNDAY = new Date(2026, 6, 19, 12, 0, 0)

function hoursWith(monday: BusinessHours[keyof BusinessHours]): BusinessHours {
  return { monday } as BusinessHours
}

describe("dayKeyForDate", () => {
  it("maps JS weekday numbers to Brain day keys", () => {
    expect(dayKeyForDate(MONDAY)).toBe("monday")
    expect(dayKeyForDate(SUNDAY)).toBe("sunday")
  })
})

describe("getTimeSlotsForDay", () => {
  it("generates 30-minute slots across open hours", () => {
    const slots = getTimeSlotsForDay(hoursWith({ open: "09:00", close: "17:00", closed: false }), MONDAY)
    // 09:00–17:00 = 8h = 16 half-hour starts (last one 16:30)
    expect(slots).toHaveLength(16)
    expect(slots[0]).toEqual({ value: "09:00", label: "9:00 AM" })
    expect(slots.at(-1)).toEqual({ value: "16:30", label: "4:30 PM" })
  })

  it("formats noon and afternoon labels in 12-hour time", () => {
    const slots = getTimeSlotsForDay(hoursWith({ open: "11:30", close: "13:00", closed: false }), MONDAY)
    expect(slots.map((s) => s.label)).toEqual(["11:30 AM", "12:00 PM", "12:30 PM"])
  })

  it("returns no slots on a closed day", () => {
    expect(getTimeSlotsForDay(hoursWith({ open: "09:00", close: "17:00", closed: true }), MONDAY)).toEqual([])
  })

  it("returns no slots when the day has no hours configured", () => {
    expect(getTimeSlotsForDay(hoursWith(undefined), MONDAY)).toEqual([])
    expect(getTimeSlotsForDay(undefined, MONDAY)).toEqual([])
  })

  it("treats malformed or AM/PM-suffixed times as closed rather than misparsing", () => {
    expect(getTimeSlotsForDay(hoursWith({ open: "9am", close: "5pm", closed: false }), MONDAY)).toEqual([])
    expect(getTimeSlotsForDay(hoursWith({ open: "09:00 AM", close: "17:00", closed: false }), MONDAY)).toEqual([])
    expect(getTimeSlotsForDay(hoursWith({ open: "25:00", close: "26:00", closed: false }), MONDAY)).toEqual([])
  })

  it("treats inverted or zero-length hours as closed (no overnight support yet)", () => {
    expect(getTimeSlotsForDay(hoursWith({ open: "18:00", close: "02:00", closed: false }), MONDAY)).toEqual([])
    expect(getTimeSlotsForDay(hoursWith({ open: "09:00", close: "09:00", closed: false }), MONDAY)).toEqual([])
  })

  it("only emits slots that fully fit before close", () => {
    const slots = getTimeSlotsForDay(hoursWith({ open: "09:00", close: "09:45", closed: false }), MONDAY)
    expect(slots.map((s) => s.value)).toEqual(["09:00"])
  })
})

describe("combineDateAndTime", () => {
  it("combines a calendar date with an HH:MM time in local time", () => {
    const combined = combineDateAndTime(MONDAY, "14:30")
    expect(combined?.getFullYear()).toBe(2026)
    expect(combined?.getMonth()).toBe(6)
    expect(combined?.getDate()).toBe(20)
    expect(combined?.getHours()).toBe(14)
    expect(combined?.getMinutes()).toBe(30)
    expect(combined?.getSeconds()).toBe(0)
  })

  it("returns null for malformed times", () => {
    expect(combineDateAndTime(MONDAY, "2pm")).toBeNull()
    expect(combineDateAndTime(MONDAY, "")).toBeNull()
  })
})
