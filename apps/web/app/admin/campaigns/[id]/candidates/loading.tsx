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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-10 w-52" />
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-10 w-48" />
      </div>
      <Skeleton className="h-72 rounded-2xl" />
    </div>
  );
}
