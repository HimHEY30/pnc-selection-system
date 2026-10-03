import Skeleton from "@/components/ui/Skeleton";
import { t } from "@/lib/messages";

// Shown while any /admin page is loading its data (the campaign pages have their own).
export default function AdminLoading() {
  return (
    <div role="status" aria-label={t.common.loading} className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-[420px] w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    </div>
  );
}
