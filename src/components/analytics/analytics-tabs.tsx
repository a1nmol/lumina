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
}

/** Overview / Loop tab switcher for the Analytics page. */
export function AnalyticsTabs({ overview, postMetrics, loopPairs, rangeDays }: AnalyticsTabsProps) {
  const [tab, setTab] = useState("overview")

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="loop">Loop</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="pt-4">
        <OverviewTab
          overview={overview}
          postMetrics={postMetrics}
          loopPairs={loopPairs}
          rangeDays={rangeDays}
        />
      </TabsContent>
      <TabsContent value="loop" className="pt-4">
        <LoopFeed pairs={loopPairs} />
      </TabsContent>
    </Tabs>
  )
}
