import { CardSkeleton, PageHeaderSkeleton } from "@/components/skeletons"

export default function SettingsAiLoading() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeaderSkeleton />
      <div className="grid gap-4 sm:grid-cols-2">
        <CardSkeleton lines={1} />
        <CardSkeleton lines={2} />
        <CardSkeleton lines={1} />
        <CardSkeleton lines={1} />
      </div>
      <CardSkeleton lines={3} />
      <CardSkeleton lines={2} />
    </div>
  )
}
