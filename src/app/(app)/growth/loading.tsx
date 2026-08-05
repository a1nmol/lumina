import { PageHeaderSkeleton } from "@/components/skeletons"
import { Skeleton } from "@/components/ui/skeleton"

export default function GrowthLoading() {
  return (
    <div className="flex flex-1 flex-col gap-8">
      <PageHeaderSkeleton withActions />

      {/* Reviews section: auto-reply settings card + filter row + review rows */}
      <div className="flex flex-col gap-4">
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-8 w-40 rounded-lg" />
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-24 w-full rounded-xl" />
        ))}
      </div>

      {/* Web chat widget section */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </div>

      {/* QR codes card */}
      <Skeleton className="h-56 w-full rounded-xl" />
    </div>
  )
}
