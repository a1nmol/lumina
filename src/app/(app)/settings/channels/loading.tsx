import { CardSkeleton, PageHeaderSkeleton } from "@/components/skeletons"

export default function SettingsChannelsLoading() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeaderSkeleton />
      <CardSkeleton lines={3} />
      <CardSkeleton lines={2} withFooter />
      <CardSkeleton lines={2} />
    </div>
  )
}
