"use client"

import { useState } from "react"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { AnalyticsOverviewStats, LoopPair, PostMetrics } from "@/lib/types"

import { LoopFeed } from "./loop-feed"
import { OverviewTab } from "./overview-tab"

type AnalyticsTabsProps = {
  overview: AnalyticsOverviewStats
  postMetrics: PostMetrics[]
  loopPairs: LoopPair[]
  rangeDays: number
  /**
   * Redesign wave R4 — the Loop tab is the product's thesis and was
   * defaulting hidden behind Overview. The server decides which tab opens
   * first (loop pairs exist for the current range → "loop", else
   * "overview") and passes it down here rather than this component
   * re-deriving it, so the decision stays in one place alongside the data
   * fetch (src/app/(app)/analytics/page.tsx).
   */
  defaultTab: "overview" | "loop"
}

/** Loop / Overview tab switcher for the Analytics page — Loop first (see `defaultTab` doc above). */
export function AnalyticsTabs({ overview, postMetrics, loopPairs, rangeDays, defaultTab }: AnalyticsTabsProps) {
  const [tab, setTab] = useState<string>(defaultTab)

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
      <TabsList>
        <TabsTrigger value="loop">Loop</TabsTrigger>
        <TabsTrigger value="overview">Overview</TabsTrigger>
      </TabsList>
      <TabsContent value="loop" className="pt-4">
        <LoopFeed pairs={loopPairs} />
      </TabsContent>
      <TabsContent value="overview" className="pt-4">
        <OverviewTab
          overview={overview}
          postMetrics={postMetrics}
          loopPairs={loopPairs}
          rangeDays={rangeDays}
        />
      </TabsContent>
    </Tabs>
  )
}
