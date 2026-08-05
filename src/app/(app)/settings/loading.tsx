import { CardSkeleton, PageHeaderSkeleton } from "@/components/skeletons"

export default function SettingsLoading() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeaderSkeleton />
      <CardSkeleton lines={3} withFooter className="max-w-2xl" />
      <CardSkeleton lines={4} className="max-w-2xl" />
      <CardSkeleton lines={2} className="max-w-2xl" />
      <CardSkeleton lines={3} className="max-w-2xl" />
      <CardSkeleton lines={2} withFooter className="max-w-2xl" />
      <CardSkeleton lines={3} className="max-w-2xl" />
      <CardSkeleton lines={3} className="max-w-2xl" />
    </div>
  )
}
