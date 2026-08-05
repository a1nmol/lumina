import { CardSkeleton, PageHeaderSkeleton } from "@/components/skeletons"

export default function SettingsPlanLoading() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeaderSkeleton />
      <CardSkeleton lines={4} />
    </div>
  )
}
