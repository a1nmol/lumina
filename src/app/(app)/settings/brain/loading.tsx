import { Skeleton } from "@/components/ui/skeleton"

export default function BrainWizardLoading() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-1 w-full rounded-full" />
        <div className="flex flex-wrap items-center gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-7 w-24 rounded-full" />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-6 rounded-2xl bg-card p-6 shadow-raised ring-1 ring-border/40 sm:p-8">
        <Skeleton className="h-6 w-56" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-9 w-full rounded-lg" />
          <Skeleton className="h-9 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 border-t border-border pt-6">
          <Skeleton className="h-8 w-16 rounded-lg" />
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>
      </div>
    </div>
  )
}
