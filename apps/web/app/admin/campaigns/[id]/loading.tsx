import Skeleton from "@/components/ui/Skeleton";
import { t } from "@/lib/messages";

export default function CampaignSetupLoading() {
  return (
    <div role="status" aria-label={t.common.loading} className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-[76px] rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}
