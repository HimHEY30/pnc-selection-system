import Skeleton from "@/components/ui/Skeleton";
import { t } from "@/lib/messages";

export default function HostsLoading() {
  return (
    <div role="status" aria-label={t.common.loading} className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-52" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-28 rounded-2xl" />
      <Skeleton className="h-28 rounded-2xl" />
      <Skeleton className="h-28 rounded-2xl" />
    </div>
  );
}
