"use client"

// Small client context so the "Pick your shop" tabs (shop-picker.tsx) can
// swap example content in sections that render both above and below it on
// the page (problem.tsx, outcome-cards.tsx) without prop-drilling through
// the server-rendered page composition. See src/lib/marketing/shop-examples.ts
// for the swappable content itself.

import { createContext, useContext, useMemo, useState, type ReactNode } from "react"

import {
  DEFAULT_SHOP_VERTICAL,
  getShopExample,
  type ShopExample,
  type ShopVerticalId,
} from "@/lib/marketing/shop-examples"

interface ShopExampleContextValue {
  vertical: ShopVerticalId
  example: ShopExample
  setVertical: (id: ShopVerticalId) => void
}

const ShopExampleContext = createContext<ShopExampleContextValue | null>(null)

export function ShopExampleProvider({ children }: { children: ReactNode }) {
  const [vertical, setVertical] = useState<ShopVerticalId>(DEFAULT_SHOP_VERTICAL)

  const value = useMemo<ShopExampleContextValue>(
    () => ({ vertical, example: getShopExample(vertical), setVertical }),
    [vertical]
  )

  return <ShopExampleContext.Provider value={value}>{children}</ShopExampleContext.Provider>
}

/** Falls back to the default vertical if no provider is mounted (defensive — every marketing page mounts one). */
export function useShopExample(): ShopExampleContextValue {
  const ctx = useContext(ShopExampleContext)
  if (ctx) return ctx
  return { vertical: DEFAULT_SHOP_VERTICAL, example: getShopExample(DEFAULT_SHOP_VERTICAL), setVertical: () => {} }
}
