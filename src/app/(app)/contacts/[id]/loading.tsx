import { PageHeaderSkeleton } from "@/components/skeletons"
import { Skeleton } from "@/components/ui/skeleton"

export default function ContactProfileLoading() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeaderSkeleton withActions />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,320px)_1fr]">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-28" />
            <div className="flex flex-wrap gap-1.5">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
          </div>
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
        <div className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex items-start gap-3 rounded-lg bg-muted/40 p-3">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
