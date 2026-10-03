import Skeleton from "@/components/ui/Skeleton";
import { t } from "@/lib/messages";

export default function CampaignInfoLoading() {
  return (
    <div role="status" aria-label={t.common.loading} className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-[28rem] max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Skeleton className="h-[640px] rounded-xl" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-60 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
