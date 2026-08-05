import { PageHeaderSkeleton, ThreePaneSkeleton } from "@/components/skeletons"

export default function InboxLoading() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeaderSkeleton />
      <ThreePaneSkeleton />
    </div>
  )
}
