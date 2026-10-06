import Skeleton from "@/components/ui/Skeleton";
import { t } from "@/lib/messages";

export default function CandidatesLoading() {
  return (
    <div role="status" aria-label={t.common.loading} className="mx-auto flex max-w-7xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      {/* Where the toolbar will be: the search, then the three filters. */}
      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
        <div className="flex gap-3">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-36 max-md:hidden" />
        </div>
        <div className="grid gap-3 max-md:hidden md:grid-cols-3">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      </div>
      {/* Where the rows will be. */}
      <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 py-2">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-1/4 max-md:hidden" />
            <Skeleton className="h-4 w-1/5 max-md:hidden" />
          </div>
        ))}
      </div>
    </div>
  );
}
