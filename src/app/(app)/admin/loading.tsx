import { PageHeaderSkeleton, StatGridSkeleton, TableSkeleton } from "@/components/skeletons"

export default function AdminLoading() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeaderSkeleton />
      <StatGridSkeleton count={4} />
      <TableSkeleton rows={8} cols={6} />
    </div>
  )
}
