import { PageHeaderSkeleton } from "@/components/skeletons"
import { Skeleton } from "@/components/ui/skeleton"

export default function GrowthLoading() {
  return (
    <div className="flex flex-1 flex-col gap-8">
      <PageHeaderSkeleton withActions />

      {/* Reviews section: heading + filter row + review rows */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-8 w-40 rounded-lg" />
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-24 w-full rounded-xl" />
        ))}
      </div>

      {/* QR codes card */}
      <Skeleton className="h-56 w-full rounded-xl" />
    </div>
  )
}
