import { PageHeaderSkeleton } from "@/components/skeletons"
import { Skeleton } from "@/components/ui/skeleton"

export default function CalendarLoading() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeaderSkeleton withActions />
      {/* View tabs (Queue / Week / Month) */}
      <Skeleton className="h-8 w-56 rounded-lg" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-7">
        {Array.from({ length: 7 }).map((_, index) => (
          <div key={index} className="flex min-w-0 flex-col gap-2">
            <div className="flex items-center justify-between px-0.5">
              <Skeleton className="h-3 w-8" />
              <Skeleton className="size-6 rounded-full" />
            </div>
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  )
}
