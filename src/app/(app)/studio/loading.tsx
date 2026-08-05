import { PageHeaderSkeleton } from "@/components/skeletons"
import { Skeleton } from "@/components/ui/skeleton"

export default function StudioLoading() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeaderSkeleton />
      {/* Prompt bar + format picker */}
      <Skeleton className="h-11 w-full rounded-lg" />
      <Skeleton className="h-9 w-full max-w-md rounded-lg" />
      <div className="grid flex-1 gap-6 lg:grid-cols-[1fr_320px]">
        {/* Editable caption/hashtag panel */}
        <div className="flex flex-col gap-3">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-8 w-full rounded-lg" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-28 rounded-lg" />
            <Skeleton className="h-8 w-28 rounded-lg" />
          </div>
        </div>
        {/* Live phone-mockup preview */}
        <Skeleton className="mx-auto h-[420px] w-full max-w-[260px] rounded-[2rem]" />
      </div>
    </div>
  )
}
