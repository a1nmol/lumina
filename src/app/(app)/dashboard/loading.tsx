import { PageHeaderSkeleton, StatGridSkeleton } from "@/components/skeletons"
import { Skeleton } from "@/components/ui/skeleton"

export default function DashboardLoading() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeaderSkeleton />
      <Skeleton className="h-24 w-full rounded-2xl" />
      <StatGridSkeleton count={4} />
      <Skeleton className="h-40 w-full rounded-2xl" />
    </div>
  )
}
