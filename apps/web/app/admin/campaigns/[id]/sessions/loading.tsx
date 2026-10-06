import Skeleton from "@/components/ui/Skeleton";
import { t } from "@/lib/messages";

export default function SessionsLoading() {
  return (
    <div role="status" aria-label={t.common.loading} className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-[30rem] max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
      {/* Where the three totals will be. */}
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-2xl" />
        ))}
      </div>
      {/* Where what needs attention, and the toolbar, will be. */}
      <Skeleton className="h-24 rounded-2xl" />
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
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 py-2">
            <Skeleton className="h-4 w-28 shrink-0" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-1/5 max-md:hidden" />
            <Skeleton className="h-6 w-20 rounded-full max-md:hidden" />
          </div>
        ))}
      </div>
    </div>
  );
}
