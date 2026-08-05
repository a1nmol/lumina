import { CardSkeleton, PageHeaderSkeleton } from "@/components/skeletons"

export default function AccountLoading() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeaderSkeleton />
      <CardSkeleton lines={1} />
      <CardSkeleton lines={1} />
      <CardSkeleton lines={2} />
    </div>
  )
}
