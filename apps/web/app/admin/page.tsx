import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import EmptyState from "@/components/ui/EmptyState";
import { loadCampaigns } from "@/lib/campaigns/api";
import { STEP_KEYS } from "@/lib/campaigns/types";
import { stepTitle } from "@/lib/campaigns/steps";
import { t } from "@/lib/messages";
import { canManageCampaigns } from "@/lib/permissions";
import CreateCampaignButton from "./campaigns/_components/CreateCampaignButton";

export const metadata: Metadata = { title: "Dashboard" };

// Until the first campaign exists this is the "No campaign yet" screen. Once there is
// one, the dashboard for a running campaign (candidates, sessions, exam results) is a
// later feature, so for now it opens the newest campaign's setup.
export default async function AdminDashboardPage() {
  const [session, campaigns] = await Promise.all([auth(), loadCampaigns()]);

  if (campaigns.length > 0) {
    redirect(`/admin/campaigns/${campaigns[0].id}`);
  }

  const firstName = (session?.user?.name ?? "").split(/\s+/)[0] || t.dashboard.fallbackName;
  const canCreate = canManageCampaigns(session?.roles ?? []);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-[28px] font-bold tracking-tight text-ink">{t.dashboard.welcome(firstName)}</h1>
        <p className="mt-1 text-[15px] text-ink-muted">{t.dashboard.subtitle}</p>
      </div>

      <EmptyState
        title={t.dashboard.emptyTitle}
        description={t.dashboard.emptyBody}
        action={<CreateCampaignButton />}
        hint={canCreate ? t.dashboard.hint : t.dashboard.readOnlyHint}
      />

      <ol aria-label={t.dashboard.stepsLabel} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {STEP_KEYS.map((step, i) => (
          <li key={step} className="rounded-xl border border-line bg-surface px-4 py-3">
            <p className="text-xs text-ink-muted">{t.dashboard.stepLabel(i + 1)}</p>
            <p className="mt-1 text-[15px] font-semibold text-ink">{stepTitle(step)}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
