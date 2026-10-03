import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { t } from "@/lib/messages";

// Shown when /admin/campaigns/[id] asks for a campaign that does not exist.
export default function CampaignNotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center rounded-2xl border border-line bg-surface px-8 py-14 text-center">
      <h1 className="text-xl font-bold text-ink">{t.errors.notFoundTitle}</h1>
      <p className="mt-2 text-[15px] text-ink-muted">{t.errors.notFoundBody}</p>
      <Link href="/admin" className={`${buttonClasses("primary", "lg")} mt-6`}>
        {t.errors.backToDashboard}
      </Link>
    </div>
  );
}
