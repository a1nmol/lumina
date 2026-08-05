import { PageHeaderSkeleton, TableSkeleton } from "@/components/skeletons"
import { Skeleton } from "@/components/ui/skeleton"

export default function ContactsLoading() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeaderSkeleton withActions />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-8 w-full max-w-xs rounded-lg" />
        <Skeleton className="h-8 w-full rounded-lg sm:w-40" />
      </div>
      <TableSkeleton rows={7} cols={5} />
    </div>
  )
}
